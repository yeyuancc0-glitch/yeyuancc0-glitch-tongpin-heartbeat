create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  event_date date not null,
  type text not null default 'other',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (length(trim(title)) between 1 and 120),
  check (note is null or length(note) <= 1000),
  check (type in ('anniversary', 'date', 'todo', 'other'))
);

create index if not exists calendar_events_couple_date_active_idx
  on public.calendar_events(couple_id, event_date asc, created_at desc)
  where deleted_at is null;

create index if not exists calendar_events_created_by_idx
  on public.calendar_events(created_by, created_at desc)
  where deleted_at is null;

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();
