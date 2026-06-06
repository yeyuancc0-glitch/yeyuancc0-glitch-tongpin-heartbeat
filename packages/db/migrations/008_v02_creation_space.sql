create table if not exists public.creation_spaces (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null unique references public.couples(id) on delete cascade,
  pet_name text not null default '小胶囊',
  pet_mood text not null default '等你们来陪陪它',
  pet_level integer not null default 1 check (pet_level >= 1),
  growth_points integer not null default 0 check (growth_points >= 0),
  fullness integer not null default 62 check (fullness between 0 and 100),
  cleanliness integer not null default 64 check (cleanliness between 0 and 100),
  affection integer not null default 68 check (affection between 0 and 100),
  home_theme text not null default 'cream',
  decor_slot_1 text not null default '软软窝垫',
  decor_slot_2 text not null default '暖光小灯',
  decor_slot_3 text not null default '胶囊花窗',
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists creation_spaces_set_updated_at on public.creation_spaces;
create trigger creation_spaces_set_updated_at
before update on public.creation_spaces
for each row execute function public.set_updated_at();

create table if not exists public.creation_actions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null check (
    action_type in (
      'feed',
      'pet',
      'clean',
      'rename',
      'decorate',
      'footprint_add',
      'footprint_update',
      'footprint_delete'
    )
  ),
  action_label text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creation_actions_couple_created_idx
on public.creation_actions(couple_id, created_at desc);

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
  constraint couple_footprints_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint couple_footprints_longitude_range check (longitude is null or longitude between -180 and 180),
  constraint couple_footprints_coordinate_pair check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null))
);

drop trigger if exists couple_footprints_set_updated_at on public.couple_footprints;
create trigger couple_footprints_set_updated_at
before update on public.couple_footprints
for each row execute function public.set_updated_at();

create index if not exists couple_footprints_couple_visited_idx
on public.couple_footprints(couple_id, visited_at desc)
where deleted_at is null;

alter table public.creation_spaces enable row level security;
alter table public.creation_actions enable row level security;
alter table public.couple_footprints enable row level security;

grant usage on schema public to authenticated;
grant select on public.creation_spaces to authenticated;
grant select, insert on public.creation_actions to authenticated;
grant select, insert, update on public.couple_footprints to authenticated;

drop policy if exists "creation_spaces select active members" on public.creation_spaces;
create policy "creation_spaces select active members"
on public.creation_spaces for select
using (public.is_active_couple_member(couple_id));

drop policy if exists "creation_actions select active members" on public.creation_actions;
create policy "creation_actions select active members"
on public.creation_actions for select
using (public.is_active_couple_member(couple_id));

drop policy if exists "creation_actions insert active member actor" on public.creation_actions;
create policy "creation_actions insert active member actor"
on public.creation_actions for insert
with check (
  actor_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "couple_footprints select active members" on public.couple_footprints;
create policy "couple_footprints select active members"
on public.couple_footprints for select
using (public.is_active_couple_member(couple_id));

drop policy if exists "couple_footprints insert active member creator" on public.couple_footprints;
create policy "couple_footprints insert active member creator"
on public.couple_footprints for insert
with check (
  created_by = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "couple_footprints update active members" on public.couple_footprints;
create policy "couple_footprints update active members"
on public.couple_footprints for update
using (public.is_active_couple_member(couple_id) and created_by = auth.uid())
with check (public.is_active_couple_member(couple_id) and created_by = auth.uid());

create or replace function public.ensure_creation_space(target_couple_id uuid)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

create or replace function public.interact_creation_pet(target_couple_id uuid, interaction_type text)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_type text := lower(nullif(trim(interaction_type), ''));
  delta_fullness integer := 0;
  delta_cleanliness integer := 0;
  delta_affection integer := 0;
  delta_growth integer := 0;
  next_mood text := '刚刚收到了你们的陪伴';
  action_label text := '陪了陪小屋伙伴';
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if clean_type = 'feed' then
    delta_fullness := 18;
    delta_affection := 4;
    delta_growth := 8;
    next_mood := '吃饱后在小屋里打转';
    action_label := '喂了一份小点心';
  elsif clean_type = 'pet' then
    delta_affection := 16;
    delta_fullness := -2;
    delta_growth := 6;
    next_mood := '被摸摸后变得黏人';
    action_label := '摸摸了小伙伴';
  elsif clean_type = 'clean' then
    delta_cleanliness := 20;
    delta_affection := 3;
    delta_growth := 7;
    next_mood := '小屋被收拾得亮亮的';
    action_label := '打扫了小屋';
  else
    raise exception 'unsupported_interaction_type';
  end if;

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  update public.creation_spaces
  set
    fullness = greatest(0, least(100, fullness + delta_fullness)),
    cleanliness = greatest(0, least(100, cleanliness + delta_cleanliness)),
    affection = greatest(0, least(100, affection + delta_affection)),
    growth_points = growth_points + delta_growth,
    pet_level = greatest(1, ((growth_points + delta_growth) / 100) + 1),
    pet_mood = next_mood,
    last_interaction_at = now()
  where couple_id = target_couple_id;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label)
  values (target_couple_id, current_user_id, clean_type, action_label);

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

create or replace function public.update_creation_home(
  target_couple_id uuid,
  pet_name text,
  home_theme text,
  decor_slot_1 text,
  decor_slot_2 text,
  decor_slot_3 text
)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_pet_name text := left(coalesce(nullif(trim(pet_name), ''), '小胶囊'), 16);
  clean_home_theme text := left(coalesce(nullif(trim(home_theme), ''), 'cream'), 24);
  clean_decor_slot_1 text := left(coalesce(nullif(trim(decor_slot_1), ''), '软软窝垫'), 18);
  clean_decor_slot_2 text := left(coalesce(nullif(trim(decor_slot_2), ''), '暖光小灯'), 18);
  clean_decor_slot_3 text := left(coalesce(nullif(trim(decor_slot_3), ''), '胶囊花窗'), 18);
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  update public.creation_spaces
  set
    pet_name = clean_pet_name,
    home_theme = clean_home_theme,
    decor_slot_1 = clean_decor_slot_1,
    decor_slot_2 = clean_decor_slot_2,
    decor_slot_3 = clean_decor_slot_3
  where couple_id = target_couple_id;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'decorate',
    '整理了共创小屋',
    jsonb_build_object(
      'pet_name', clean_pet_name,
      'home_theme', clean_home_theme,
      'decor', jsonb_build_array(clean_decor_slot_1, clean_decor_slot_2, clean_decor_slot_3)
    )
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

grant execute on function public.ensure_creation_space(uuid) to authenticated;
grant execute on function public.interact_creation_pet(uuid, text) to authenticated;
grant execute on function public.update_creation_home(uuid, text, text, text, text, text) to authenticated;
