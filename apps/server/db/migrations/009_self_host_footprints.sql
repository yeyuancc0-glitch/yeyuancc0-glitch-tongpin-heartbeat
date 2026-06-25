create table if not exists public.couple_footprints (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  note text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  visited_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (length(trim(title)) between 1 and 120),
  check (note is null or length(note) <= 1000),
  constraint couple_footprints_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint couple_footprints_longitude_range check (longitude is null or longitude between -180 and 180),
  constraint couple_footprints_coordinate_pair check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null))
);

create index if not exists couple_footprints_couple_visited_active_idx
  on public.couple_footprints(couple_id, visited_at desc, created_at desc)
  where deleted_at is null;

create index if not exists couple_footprints_created_by_idx
  on public.couple_footprints(created_by, created_at desc)
  where deleted_at is null;

drop trigger if exists couple_footprints_set_updated_at on public.couple_footprints;
create trigger couple_footprints_set_updated_at
before update on public.couple_footprints
for each row execute function public.set_updated_at();
