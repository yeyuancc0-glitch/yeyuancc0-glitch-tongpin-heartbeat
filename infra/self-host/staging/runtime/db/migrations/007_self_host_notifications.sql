create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  body text,
  related_table text,
  related_id uuid,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  check (type in ('letter', 'message', 'checkin', 'calendar_event', 'system')),
  check (length(trim(title)) between 1 and 80),
  check (body is null or length(trim(body)) <= 160),
  check (related_table is null or related_table in ('messages', 'checkins', 'future_letters', 'calendar_events', 'system'))
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc)
  where dismissed_at is null;

create index if not exists notifications_couple_created_idx
  on public.notifications(couple_id, created_at desc)
  where dismissed_at is null;
