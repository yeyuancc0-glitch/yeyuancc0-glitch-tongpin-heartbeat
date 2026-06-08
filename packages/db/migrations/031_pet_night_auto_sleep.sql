-- Let night rest start real pet sleep, recover energy progressively, and avoid repeated recovery.

alter table public.creation_spaces
  add column if not exists pet_sleep_recovered_energy integer not null default 0;

alter table public.creation_spaces
  drop constraint if exists creation_spaces_pet_sleep_recovered_energy_check,
  add constraint creation_spaces_pet_sleep_recovered_energy_check
  check (pet_sleep_recovered_energy between 0 and 18);

create or replace function public.creation_pet_sleep_pending_recovery_delta(
  started_at timestamptz,
  settled_at timestamptz,
  already_recovered integer default 0
)
returns integer
language sql
stable
as $$
  select greatest(
    0,
    public.creation_pet_sleep_recovery_delta(started_at, settled_at)
      - greatest(0, least(18, coalesce(already_recovered, 0)))
  );
$$;

revoke all on function public.creation_pet_sleep_pending_recovery_delta(timestamptz, timestamptz, integer) from public;
revoke all on function public.creation_pet_sleep_pending_recovery_delta(timestamptz, timestamptz, integer) from anon;
revoke all on function public.creation_pet_sleep_pending_recovery_delta(timestamptz, timestamptz, integer) from authenticated;

create or replace function public.creation_pet_sleep_fullness_delta(recovered_energy integer)
returns integer
language sql
stable
as $$
  select case
    when greatest(0, least(18, coalesce(recovered_energy, 0))) >= 18 then -3
    when greatest(0, least(18, coalesce(recovered_energy, 0))) >= 12 then -2
    when greatest(0, least(18, coalesce(recovered_energy, 0))) >= 6 then -1
    else 0
  end;
$$;

create or replace function public.creation_pet_sleep_growth_delta(recovered_energy integer)
returns integer
language sql
stable
as $$
  select case
    when greatest(0, least(18, coalesce(recovered_energy, 0))) >= 18 then 4
    when greatest(0, least(18, coalesce(recovered_energy, 0))) >= 12 then 3
    when greatest(0, least(18, coalesce(recovered_energy, 0))) >= 6 then 1
    else 0
  end;
$$;

create or replace function public.creation_pet_sleep_boredom_delta(recovered_energy integer)
returns integer
language sql
stable
as $$
  select case
    when greatest(0, least(18, coalesce(recovered_energy, 0))) >= 18 then -2
    when greatest(0, least(18, coalesce(recovered_energy, 0))) >= 6 then -1
    else 0
  end;
$$;

create or replace function public.creation_pet_sleep_comfort_delta(recovered_energy integer)
returns integer
language sql
stable
as $$
  select case
    when greatest(0, least(18, coalesce(recovered_energy, 0))) >= 18 then 8
    when greatest(0, least(18, coalesce(recovered_energy, 0))) >= 12 then 5
    when greatest(0, least(18, coalesce(recovered_energy, 0))) >= 6 then 3
    else 0
  end;
$$;

revoke all on function public.creation_pet_sleep_fullness_delta(integer) from public, anon, authenticated;
revoke all on function public.creation_pet_sleep_growth_delta(integer) from public, anon, authenticated;
revoke all on function public.creation_pet_sleep_boredom_delta(integer) from public, anon, authenticated;
revoke all on function public.creation_pet_sleep_comfort_delta(integer) from public, anon, authenticated;

create or replace function public.start_creation_pet_sleep(target_couple_id uuid, sleep_reason text default 'night_auto')
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_reason text := left(lower(coalesce(nullif(trim(sleep_reason), ''), 'night_auto')), 48);
  sleep_started_at timestamptz;
  recovered_energy integer := 0;
  previous_action text;
  previous_surface text;
  sleep_energy_delta integer := 0;
  sleep_fullness_delta integer := 0;
  sleep_growth_delta integer := 0;
  sleep_boredom_delta integer := 0;
  sleep_comfort_delta integer := 0;
  should_log boolean := false;
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

  select pet_sleep_started_at, pet_sleep_recovered_energy, current_action, pet_world_surface
  into sleep_started_at, recovered_energy, previous_action, previous_surface
  from public.creation_spaces
  where couple_id = target_couple_id
  for update;

  if sleep_started_at is not null then
    sleep_energy_delta := public.creation_pet_sleep_pending_recovery_delta(sleep_started_at, now(), recovered_energy);
    sleep_fullness_delta := public.creation_pet_sleep_fullness_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_fullness_delta(recovered_energy);
    sleep_growth_delta := public.creation_pet_sleep_growth_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_growth_delta(recovered_energy);
    sleep_boredom_delta := public.creation_pet_sleep_boredom_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_boredom_delta(recovered_energy);
    sleep_comfort_delta := public.creation_pet_sleep_comfort_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_comfort_delta(recovered_energy);
  end if;

  should_log := sleep_started_at is null
    or previous_action is distinct from 'sleep'
    or previous_surface is distinct from 'pet_room'
    or sleep_energy_delta > 0;

  update public.creation_spaces
  set
    fullness = greatest(0, least(100, fullness + sleep_fullness_delta)),
    energy = greatest(0, least(100, energy + sleep_energy_delta)),
    boredom = greatest(0, least(100, boredom + sleep_boredom_delta)),
    comfort = greatest(0, least(100, comfort + sleep_comfort_delta)),
    growth_points = growth_points + sleep_growth_delta,
    pet_level = greatest(1, ((growth_points + sleep_growth_delta) / 100) + 1),
    pet_mood = case
      when clean_reason like 'night%' then '夜深了，已经在小窝里睡着'
      else '在小窝里睡着了，别太快叫醒它'
    end,
    current_action = 'sleep',
    pet_world_surface = 'pet_room',
    pet_world_state = 'sleep',
    pet_world_mood = 'sleepy',
    pet_hidden = false,
    pet_sleep_started_at = coalesce(pet_sleep_started_at, now()),
    pet_sleep_recovered_energy = case
      when sleep_started_at is null then 0
      else greatest(0, least(18, recovered_energy + sleep_energy_delta))
    end,
    last_world_decision = jsonb_build_object(
      'target_surface', 'pet_room',
      'intent', 'rest',
      'animation', 'sleep',
      'mood', 'sleepy',
      'expression', 'sleepy',
      'symbol', 'sleep',
      'sound_cue', 'purr',
      'prop', 'none',
      'speech', '呼噜',
      'bubble', '呼噜',
      'memory_policy', jsonb_build_object('should_write', false, 'importance', 0, 'summary', '')
    ),
    last_ai_bubble = '呼噜',
    updated_at = now()
  where couple_id = target_couple_id;

  if should_log then
    insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
    values (
      target_couple_id,
      current_user_id,
      'sleep',
      case
        when sleep_energy_delta > 0 then '云宠睡梦中恢复了精力'
        when clean_reason like 'night%' then '夜深后云宠自动睡下了'
        else '云宠回小窝睡下了'
      end,
      jsonb_build_object(
        'reason', clean_reason,
        'energy_delta', sleep_energy_delta,
        'recovered_energy', case when sleep_started_at is null then 0 else recovered_energy + sleep_energy_delta end,
        'auto_sleep', true
      )
    );
  end if;

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

create or replace function public.refresh_creation_pet_sleep(target_couple_id uuid)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  sleep_started_at timestamptz;
  recovered_energy integer := 0;
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

  select pet_sleep_started_at, pet_sleep_recovered_energy
  into sleep_started_at, recovered_energy
  from public.creation_spaces
  where couple_id = target_couple_id
  for update;

  if sleep_started_at is null then
    return query
    select *
    from public.creation_spaces
    where couple_id = target_couple_id;
    return;
  end if;

  sleep_energy_delta := public.creation_pet_sleep_pending_recovery_delta(sleep_started_at, now(), recovered_energy);

  if sleep_energy_delta > 0 then
    sleep_fullness_delta := public.creation_pet_sleep_fullness_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_fullness_delta(recovered_energy);
    sleep_growth_delta := public.creation_pet_sleep_growth_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_growth_delta(recovered_energy);
    sleep_boredom_delta := public.creation_pet_sleep_boredom_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_boredom_delta(recovered_energy);
    sleep_comfort_delta := public.creation_pet_sleep_comfort_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_comfort_delta(recovered_energy);

    update public.creation_spaces
    set
      fullness = greatest(0, least(100, fullness + sleep_fullness_delta)),
      energy = greatest(0, least(100, energy + sleep_energy_delta)),
      boredom = greatest(0, least(100, boredom + sleep_boredom_delta)),
      comfort = greatest(0, least(100, comfort + sleep_comfort_delta)),
      growth_points = growth_points + sleep_growth_delta,
      pet_level = greatest(1, ((growth_points + sleep_growth_delta) / 100) + 1),
      current_action = 'sleep',
      pet_world_surface = 'pet_room',
      pet_world_state = 'sleep',
      pet_world_mood = 'sleepy',
      pet_hidden = false,
      pet_sleep_recovered_energy = greatest(0, least(18, recovered_energy + sleep_energy_delta)),
      pet_mood = '睡梦里慢慢恢复精力',
      last_ai_bubble = '呼噜',
      updated_at = now()
    where couple_id = target_couple_id;

    insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
    values (
      target_couple_id,
      current_user_id,
      'sleep',
      '云宠睡梦中恢复了精力',
      jsonb_build_object(
        'energy_delta', sleep_energy_delta,
        'recovered_energy', recovered_energy + sleep_energy_delta,
        'auto_recovery', true
      )
    );
  end if;

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

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
  recovered_energy integer := 0;
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

  select pet_sleep_started_at, pet_sleep_recovered_energy
  into sleep_started_at, recovered_energy
  from public.creation_spaces
  where couple_id = target_couple_id
  for update;

  if sleep_started_at is not null then
    sleep_elapsed_seconds := greatest(0, floor(extract(epoch from (now() - sleep_started_at)))::integer);
    sleep_energy_delta := public.creation_pet_sleep_pending_recovery_delta(sleep_started_at, now(), recovered_energy);
    sleep_fullness_delta := public.creation_pet_sleep_fullness_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_fullness_delta(recovered_energy);
    sleep_growth_delta := public.creation_pet_sleep_growth_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_growth_delta(recovered_energy);
    sleep_boredom_delta := public.creation_pet_sleep_boredom_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_boredom_delta(recovered_energy);
    sleep_comfort_delta := public.creation_pet_sleep_comfort_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_comfort_delta(recovered_energy);
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
    pet_sleep_recovered_energy = 0,
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
  recovered_energy integer := 0;
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

  select pet_sleep_started_at, pet_sleep_recovered_energy
  into sleep_started_at, recovered_energy
  from public.creation_spaces
  where couple_id = target_couple_id
  for update;

  if clean_type = 'sleep' then
    update public.creation_spaces
    set
      current_action = 'sleep',
      pet_world_surface = 'pet_room',
      pet_world_state = 'sleep',
      pet_world_mood = 'sleepy',
      pet_hidden = false,
      pet_sleep_started_at = coalesce(pet_sleep_started_at, now()),
      pet_sleep_recovered_energy = case when pet_sleep_started_at is null then 0 else pet_sleep_recovered_energy end,
      pet_mood = '在小窝里睡着了，别太快叫醒它',
      last_ai_bubble = '呼噜',
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
    sleep_energy_delta := public.creation_pet_sleep_pending_recovery_delta(sleep_started_at, now(), recovered_energy);
    sleep_fullness_delta := public.creation_pet_sleep_fullness_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_fullness_delta(recovered_energy);
    sleep_growth_delta := public.creation_pet_sleep_growth_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_growth_delta(recovered_energy);
    sleep_boredom_delta := public.creation_pet_sleep_boredom_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_boredom_delta(recovered_energy);
    sleep_comfort_delta := public.creation_pet_sleep_comfort_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_comfort_delta(recovered_energy);
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
    pet_sleep_recovered_energy = 0,
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
  recovered_energy integer := 0;
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

  select pet_sleep_started_at, pet_sleep_recovered_energy
  into sleep_started_at, recovered_energy
  from public.creation_spaces
  where couple_id = target_couple_id
  for update;

  if sleep_started_at is null then
    return query
    select *
    from public.creation_spaces
    where couple_id = target_couple_id;
    return;
  end if;

  sleep_elapsed_seconds := greatest(0, floor(extract(epoch from (now() - sleep_started_at)))::integer);
  sleep_energy_delta := public.creation_pet_sleep_pending_recovery_delta(sleep_started_at, now(), recovered_energy);
  sleep_fullness_delta := public.creation_pet_sleep_fullness_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_fullness_delta(recovered_energy);
  sleep_growth_delta := public.creation_pet_sleep_growth_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_growth_delta(recovered_energy);
  sleep_boredom_delta := public.creation_pet_sleep_boredom_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_boredom_delta(recovered_energy);
  sleep_comfort_delta := public.creation_pet_sleep_comfort_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_comfort_delta(recovered_energy);

  update public.creation_spaces
  set
    fullness = greatest(0, least(100, fullness + sleep_fullness_delta)),
    energy = greatest(0, least(100, energy + sleep_energy_delta)),
    boredom = greatest(0, least(100, boredom + sleep_boredom_delta)),
    comfort = greatest(0, least(100, comfort + sleep_comfort_delta)),
    growth_points = growth_points + sleep_growth_delta,
    pet_level = greatest(1, ((growth_points + sleep_growth_delta) / 100) + 1),
    pet_mood = case when sleep_energy_delta > 0 then '睡醒后精神回来了' else '被轻轻叫醒了' end,
    current_action = 'happy',
    pet_world_state = 'idle',
    pet_world_mood = 'calm',
    pet_sleep_started_at = null,
    pet_sleep_recovered_energy = 0,
    last_ai_bubble = '喵',
    updated_at = now()
  where couple_id = target_couple_id;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'sleep',
    case when sleep_energy_delta > 0 then '云宠睡醒后恢复了精力' else '云宠被轻轻叫醒了' end,
    jsonb_build_object(
      'energy_delta', sleep_energy_delta,
      'fullness_delta', sleep_fullness_delta,
      'sleep_elapsed_seconds', sleep_elapsed_seconds,
      'completed_sleep', sleep_energy_delta = 18,
      'interrupted_sleep', sleep_energy_delta < 18
    )
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

create or replace function public.settle_creation_pet_night_sleep(target_couple_id uuid)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  sleep_started_at timestamptz;
  recovered_energy integer := 0;
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

  select pet_sleep_started_at, pet_sleep_recovered_energy
  into sleep_started_at, recovered_energy
  from public.creation_spaces
  where couple_id = target_couple_id
  for update;

  if sleep_started_at is null then
    return query
    select *
    from public.creation_spaces
    where couple_id = target_couple_id;
    return;
  end if;

  sleep_elapsed_seconds := greatest(0, floor(extract(epoch from (now() - sleep_started_at)))::integer);
  sleep_energy_delta := public.creation_pet_sleep_pending_recovery_delta(sleep_started_at, now(), recovered_energy);
  sleep_fullness_delta := public.creation_pet_sleep_fullness_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_fullness_delta(recovered_energy);
  sleep_growth_delta := public.creation_pet_sleep_growth_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_growth_delta(recovered_energy);
  sleep_boredom_delta := public.creation_pet_sleep_boredom_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_boredom_delta(recovered_energy);
  sleep_comfort_delta := public.creation_pet_sleep_comfort_delta(recovered_energy + sleep_energy_delta) - public.creation_pet_sleep_comfort_delta(recovered_energy);

  update public.creation_spaces
  set
    fullness = greatest(0, least(100, fullness + sleep_fullness_delta)),
    energy = greatest(0, least(100, energy + sleep_energy_delta)),
    boredom = greatest(0, least(100, boredom + sleep_boredom_delta)),
    comfort = greatest(0, least(100, comfort + sleep_comfort_delta)),
    growth_points = growth_points + sleep_growth_delta,
    pet_level = greatest(1, ((growth_points + sleep_growth_delta) / 100) + 1),
    pet_mood = case when sleep_energy_delta > 0 then '天亮后精神回来了' else '天亮后醒来了' end,
    current_action = 'happy',
    pet_world_state = 'idle',
    pet_world_mood = 'calm',
    pet_sleep_started_at = null,
    pet_sleep_recovered_energy = 0,
    last_world_decision = jsonb_build_object(
      'target_surface', coalesce(nullif(pet_world_surface, 'pet_room'), 'home'),
      'intent', 'wander',
      'animation', 'happy',
      'mood', 'calm',
      'expression', 'happy',
      'symbol', 'sparkle',
      'sound_cue', 'soft_chime',
      'prop', 'none',
      'speech', '喵',
      'bubble', '喵',
      'night_auto_wake', true,
      'memory_policy', jsonb_build_object('should_write', false, 'importance', 0, 'summary', '')
    ),
    last_ai_bubble = '喵',
    updated_at = now()
  where couple_id = target_couple_id;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'sleep',
    case when sleep_energy_delta > 0 then '天亮后云宠睡醒并恢复了精力' else '天亮后云宠醒来了' end,
    jsonb_build_object(
      'energy_delta', sleep_energy_delta,
      'fullness_delta', sleep_fullness_delta,
      'sleep_elapsed_seconds', sleep_elapsed_seconds,
      'completed_sleep', sleep_energy_delta = 18,
      'night_auto_wake', true
    )
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

grant execute on function public.start_creation_pet_sleep(uuid, text) to authenticated;
grant execute on function public.refresh_creation_pet_sleep(uuid) to authenticated;
grant execute on function public.feed_creation_pet(uuid, text) to authenticated;
grant execute on function public.interact_creation_pet(uuid, text) to authenticated;
grant execute on function public.settle_creation_pet_sleep(uuid) to authenticated;
grant execute on function public.settle_creation_pet_night_sleep(uuid) to authenticated;

revoke execute on function public.start_creation_pet_sleep(uuid, text) from public, anon;
revoke execute on function public.refresh_creation_pet_sleep(uuid) from public, anon;
revoke execute on function public.settle_creation_pet_night_sleep(uuid) from public, anon;
