-- Make Live2D pet sleep recover energy by elapsed sleep duration instead of immediately.

alter table public.creation_spaces
  add column if not exists pet_sleep_started_at timestamptz;

create or replace function public.creation_pet_sleep_recovery_delta(started_at timestamptz, settled_at timestamptz)
returns integer
language sql
stable
as $$
  select case
    when started_at is null then 0
    when extract(epoch from (settled_at - started_at)) < 30 then 0
    when extract(epoch from (settled_at - started_at)) < 120 then 6
    when extract(epoch from (settled_at - started_at)) < 300 then 12
    else 18
  end;
$$;

revoke all on function public.creation_pet_sleep_recovery_delta(timestamptz, timestamptz) from public;
revoke all on function public.creation_pet_sleep_recovery_delta(timestamptz, timestamptz) from anon;
revoke all on function public.creation_pet_sleep_recovery_delta(timestamptz, timestamptz) from authenticated;

create or replace function public.feed_creation_pet(target_couple_id uuid, food_type text)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_food_type text := lower(nullif(trim(food_type), ''));
  delta_fullness integer;
  delta_affection integer;
  delta_growth integer;
  delta_energy integer;
  next_mood text;
  food_label text;
  sleep_started_at timestamptz;
  sleep_elapsed_seconds integer;
  sleep_energy_delta integer := 0;
  sleep_fullness_delta integer := 0;
  sleep_growth_delta integer := 0;
  sleep_boredom_delta integer := 0;
  sleep_comfort_delta integer := 0;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if clean_food_type = 'basic' then
    delta_fullness := 18;
    delta_affection := 4;
    delta_growth := 8;
    delta_energy := 14;
    next_mood := '吃完日常粮后，慢慢恢复了精神';
    food_label := '日常粮';
  elsif clean_food_type = 'premium' then
    delta_fullness := 30;
    delta_affection := 10;
    delta_growth := 18;
    delta_energy := 24;
    next_mood := '吃到鲜食粮后，精神一下亮了起来';
    food_label := '鲜食粮';
  else
    raise exception 'unsupported_food_type';
  end if;

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  select pet_sleep_started_at
  into sleep_started_at
  from public.creation_spaces
  where couple_id = target_couple_id
  for update;

  if sleep_started_at is not null then
    sleep_elapsed_seconds := greatest(0, floor(extract(epoch from (now() - sleep_started_at)))::integer);
    sleep_energy_delta := public.creation_pet_sleep_recovery_delta(sleep_started_at, now());
    sleep_fullness_delta := case sleep_energy_delta when 0 then 0 when 6 then -1 when 12 then -2 else -3 end;
    sleep_growth_delta := case sleep_energy_delta when 0 then 0 when 6 then 1 when 12 then 3 else 4 end;
    sleep_boredom_delta := case sleep_energy_delta when 0 then 0 when 18 then -2 else -1 end;
    sleep_comfort_delta := case sleep_energy_delta when 0 then 0 when 6 then 3 when 12 then 5 else 8 end;
  end if;

  update public.creation_spaces
  set
    basic_food_count = basic_food_count - case when clean_food_type = 'basic' then 1 else 0 end,
    premium_food_count = premium_food_count - case when clean_food_type = 'premium' then 1 else 0 end,
    fullness = greatest(0, least(100, fullness + delta_fullness + sleep_fullness_delta)),
    affection = greatest(0, least(100, affection + delta_affection)),
    cleanliness = greatest(0, least(100, cleanliness - 2)),
    energy = greatest(0, least(100, energy + delta_energy + sleep_energy_delta)),
    boredom = greatest(0, least(100, boredom + sleep_boredom_delta)),
    comfort = greatest(0, least(100, comfort + sleep_comfort_delta)),
    growth_points = growth_points + delta_growth + sleep_growth_delta,
    pet_level = greatest(1, ((growth_points + delta_growth + sleep_growth_delta) / 100) + 1),
    pet_mood = next_mood,
    current_action = 'eat',
    pet_sleep_started_at = null,
    last_fed_food = clean_food_type,
    last_fed_at = now(),
    last_interaction_at = now(),
    updated_at = now()
  where couple_id = target_couple_id
    and (
      (clean_food_type = 'basic' and basic_food_count > 0)
      or (clean_food_type = 'premium' and premium_food_count > 0)
    );

  if not found then
    raise exception 'food_inventory_empty';
  end if;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'feed',
    '喂了一份' || food_label,
    jsonb_build_object(
      'food_type', clean_food_type,
      'growth', delta_growth,
      'energy_delta', delta_energy,
      'sleep_energy_delta', sleep_energy_delta,
      'sleep_elapsed_seconds', sleep_elapsed_seconds,
      'interrupted_sleep', sleep_started_at is not null
    )
  );

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
  delta_energy integer := 0;
  delta_boredom integer := 0;
  delta_comfort integer := 0;
  sleep_started_at timestamptz;
  sleep_elapsed_seconds integer;
  sleep_energy_delta integer := 0;
  sleep_fullness_delta integer := 0;
  sleep_growth_delta integer := 0;
  sleep_boredom_delta integer := 0;
  sleep_comfort_delta integer := 0;
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
    return query select * from public.feed_creation_pet(target_couple_id, 'basic');
    return;
  end if;

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  select pet_sleep_started_at
  into sleep_started_at
  from public.creation_spaces
  where couple_id = target_couple_id
  for update;

  if clean_type = 'sleep' then
    update public.creation_spaces
    set
      current_action = 'sleep',
      pet_world_state = 'sleep',
      pet_world_mood = 'sleepy',
      pet_sleep_started_at = coalesce(pet_sleep_started_at, now()),
      pet_mood = '在小窝里睡着了，别太快叫醒它',
      last_interaction_at = now(),
      updated_at = now()
    where couple_id = target_couple_id;

    insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
    values (
      target_couple_id,
      current_user_id,
      'sleep',
      '哄云宠睡下了',
      jsonb_build_object('energy_delta', 0, 'sleep_started', sleep_started_at is null)
    );

    return query
    select *
    from public.creation_spaces
    where couple_id = target_couple_id;
    return;
  elsif clean_type = 'pet' then
    delta_affection := 12;
    delta_fullness := -1;
    delta_energy := -1;
    delta_growth := 5;
    delta_comfort := 2;
    next_mood := '被摸摸后变得很黏人';
    action_label := '摸摸了云宠';
  elsif clean_type = 'clean' then
    delta_cleanliness := 22;
    delta_affection := 3;
    delta_energy := -3;
    delta_growth := 7;
    delta_comfort := 4;
    next_mood := '小屋被收拾得亮亮的';
    action_label := '打扫了云宠小屋';
  elsif clean_type = 'play' then
    delta_affection := 8;
    delta_fullness := -4;
    delta_energy := -8;
    delta_growth := 9;
    delta_boredom := -12;
    next_mood := '刚刚玩得很开心，正在小屋里打转';
    action_label := '陪云宠玩了一会儿';
  else
    raise exception 'unsupported_interaction_type';
  end if;

  if sleep_started_at is not null then
    sleep_elapsed_seconds := greatest(0, floor(extract(epoch from (now() - sleep_started_at)))::integer);
    sleep_energy_delta := public.creation_pet_sleep_recovery_delta(sleep_started_at, now());
    sleep_fullness_delta := case sleep_energy_delta when 0 then 0 when 6 then -1 when 12 then -2 else -3 end;
    sleep_growth_delta := case sleep_energy_delta when 0 then 0 when 6 then 1 when 12 then 3 else 4 end;
    sleep_boredom_delta := case sleep_energy_delta when 0 then 0 when 18 then -2 else -1 end;
    sleep_comfort_delta := case sleep_energy_delta when 0 then 0 when 6 then 3 when 12 then 5 else 8 end;
  end if;

  update public.creation_spaces
  set
    fullness = greatest(0, least(100, fullness + delta_fullness + sleep_fullness_delta)),
    cleanliness = greatest(0, least(100, cleanliness + delta_cleanliness)),
    affection = greatest(0, least(100, affection + delta_affection)),
    energy = greatest(0, least(100, energy + delta_energy + sleep_energy_delta)),
    boredom = greatest(0, least(100, boredom + delta_boredom + sleep_boredom_delta)),
    comfort = greatest(0, least(100, comfort + delta_comfort + sleep_comfort_delta)),
    growth_points = growth_points + delta_growth + sleep_growth_delta,
    pet_level = greatest(1, ((growth_points + delta_growth + sleep_growth_delta) / 100) + 1),
    pet_mood = next_mood,
    current_action = clean_type,
    pet_sleep_started_at = null,
    last_played_at = case when clean_type = 'play' then now() else last_played_at end,
    last_interaction_at = now(),
    updated_at = now()
  where couple_id = target_couple_id;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    clean_type,
    action_label,
    jsonb_build_object(
      'energy_delta', delta_energy,
      'fullness_delta', delta_fullness,
      'sleep_energy_delta', sleep_energy_delta,
      'sleep_elapsed_seconds', sleep_elapsed_seconds,
      'interrupted_sleep', sleep_started_at is not null
    )
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

create or replace function public.settle_creation_pet_sleep(target_couple_id uuid)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  sleep_started_at timestamptz;
  sleep_elapsed_seconds integer;
  sleep_energy_delta integer := 0;
  sleep_fullness_delta integer := 0;
  sleep_growth_delta integer := 0;
  sleep_boredom_delta integer := 0;
  sleep_comfort_delta integer := 0;
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

  select pet_sleep_started_at
  into sleep_started_at
  from public.creation_spaces
  where couple_id = target_couple_id
  for update;

  if sleep_started_at is null or extract(epoch from (now() - sleep_started_at)) < 300 then
    return query
    select *
    from public.creation_spaces
    where couple_id = target_couple_id;
    return;
  end if;

  sleep_elapsed_seconds := greatest(0, floor(extract(epoch from (now() - sleep_started_at)))::integer);
  sleep_energy_delta := public.creation_pet_sleep_recovery_delta(sleep_started_at, now());
  sleep_fullness_delta := -3;
  sleep_growth_delta := 4;
  sleep_boredom_delta := -2;
  sleep_comfort_delta := 8;

  update public.creation_spaces
  set
    fullness = greatest(0, least(100, fullness + sleep_fullness_delta)),
    energy = greatest(0, least(100, energy + sleep_energy_delta)),
    boredom = greatest(0, least(100, boredom + sleep_boredom_delta)),
    comfort = greatest(0, least(100, comfort + sleep_comfort_delta)),
    growth_points = growth_points + sleep_growth_delta,
    pet_level = greatest(1, ((growth_points + sleep_growth_delta) / 100) + 1),
    pet_mood = '睡足一觉，精神回来了',
    current_action = 'sleep',
    pet_world_state = 'sleep',
    pet_world_mood = 'sleepy',
    pet_sleep_started_at = null,
    updated_at = now()
  where couple_id = target_couple_id;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'sleep',
    '云宠睡足后恢复了精力',
    jsonb_build_object(
      'energy_delta', sleep_energy_delta,
      'fullness_delta', sleep_fullness_delta,
      'sleep_elapsed_seconds', sleep_elapsed_seconds,
      'completed_sleep', true
    )
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

grant execute on function public.feed_creation_pet(uuid, text) to authenticated;
grant execute on function public.interact_creation_pet(uuid, text) to authenticated;
grant execute on function public.settle_creation_pet_sleep(uuid) to authenticated;
