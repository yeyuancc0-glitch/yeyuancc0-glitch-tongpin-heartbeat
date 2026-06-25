alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists deletion_requested_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_account_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active', 'deletion_requested', 'frozen'));
  end if;
end $$;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete set null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  check (char_length(trim(reason)) between 1 and 1000),
  check (details is null or char_length(details) <= 2000),
  check (status in ('open', 'reviewing', 'closed'))
);

create index if not exists reports_reporter_created_idx
  on public.reports(reporter_id, created_at desc);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  couple_id uuid references public.couples(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_user_id),
  check (blocker_id <> blocked_user_id),
  check (reason is null or char_length(reason) <= 1000)
);

create index if not exists blocks_blocked_user_idx
  on public.blocks(blocked_user_id, created_at desc);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, status),
  check (status in ('requested', 'processing', 'cancelled', 'completed')),
  check (reason is null or char_length(reason) <= 1000)
);

create index if not exists account_deletion_requests_user_requested_idx
  on public.account_deletion_requests(user_id, requested_at desc);

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  couple_id uuid references public.couples(id) on delete set null,
  body text not null,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (char_length(trim(body)) between 1 and 1000),
  check (status in ('open', 'reviewed', 'closed')),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists app_feedback_user_created_idx
  on public.app_feedback(user_id, created_at desc);
