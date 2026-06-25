create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  checkin_date date not null,
  content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (content is null or length(trim(content)) <= 2000)
);

create unique index if not exists checkins_one_active_per_user_date_idx
  on public.checkins(couple_id, user_id, checkin_date)
  where deleted_at is null;

create index if not exists checkins_couple_date_active_idx
  on public.checkins(couple_id, checkin_date desc)
  where deleted_at is null;

drop trigger if exists checkins_set_updated_at on public.checkins;
create trigger checkins_set_updated_at
before update on public.checkins
for each row execute function public.set_updated_at();

create table if not exists public.mood_status (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mood text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (couple_id, user_id),
  check (length(trim(mood)) between 1 and 40),
  check (note is null or length(trim(note)) <= 500)
);

create index if not exists mood_status_couple_updated_idx
  on public.mood_status(couple_id, updated_at desc);

drop trigger if exists mood_status_set_updated_at on public.mood_status;
create trigger mood_status_set_updated_at
before update on public.mood_status
for each row execute function public.set_updated_at();
