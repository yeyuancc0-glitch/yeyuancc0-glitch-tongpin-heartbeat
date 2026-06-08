-- Allow visible outside naps to use the same timed energy recovery as pet room sleep.

drop function if exists public.start_creation_pet_sleep(uuid, text);

create or replace function public.start_creation_pet_sleep(
  target_couple_id uuid,
  sleep_reason text default 'night_auto',
  sleep_surface text default null
)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_reason text := left(lower(coalesce(nullif(trim(sleep_reason), ''), 'night_auto')), 48);
  requested_surface text := lower(coalesce(nullif(trim(sleep_surface), ''), 'pet_room'));
  clean_surface text := case
    when requested_surface in ('home', 'share', 'memory') and clean_reason = 'outside_rest' then requested_surface
    else 'pet_room'
  end;
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
    or previous_surface is distinct from clean_surface
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
      when clean_surface <> 'pet_room' then '在外面打了个盹，慢慢恢复精神'
      when clean_reason like 'night%' then '夜深了，已经在小窝里睡着'
      else '在小窝里睡着了，别太快叫醒它'
    end,
    current_action = 'sleep',
    pet_world_surface = clean_surface,
    pet_world_state = 'sleep',
    pet_world_mood = 'sleepy',
    pet_hidden = false,
    pet_sleep_started_at = coalesce(pet_sleep_started_at, now()),
    pet_sleep_recovered_energy = case
      when sleep_started_at is null then 0
      else greatest(0, least(18, recovered_energy + sleep_energy_delta))
    end,
    last_world_decision = jsonb_build_object(
      'target_surface', clean_surface,
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
        when clean_surface <> 'pet_room' then '云宠在外面打了个盹'
        when clean_reason like 'night%' then '夜深后云宠自动睡下了'
        else '云宠回小窝睡下了'
      end,
      jsonb_build_object(
        'reason', clean_reason,
        'surface', clean_surface,
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
  sleep_surface text := 'pet_room';
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

  select pet_sleep_started_at, pet_sleep_recovered_energy, coalesce(nullif(pet_world_surface, ''), 'pet_room')
  into sleep_started_at, recovered_energy, sleep_surface
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

  if sleep_surface not in ('home', 'share', 'memory', 'pet_room') then
    sleep_surface := 'pet_room';
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
      pet_world_surface = sleep_surface,
      pet_world_state = 'sleep',
      pet_world_mood = 'sleepy',
      pet_hidden = false,
      pet_sleep_recovered_energy = greatest(0, least(18, recovered_energy + sleep_energy_delta)),
      pet_mood = case when sleep_surface = 'pet_room' then '睡梦里慢慢恢复精力' else '在外面打盹时慢慢恢复精力' end,
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
        'surface', sleep_surface,
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

grant execute on function public.start_creation_pet_sleep(uuid, text, text) to authenticated;
grant execute on function public.refresh_creation_pet_sleep(uuid) to authenticated;

revoke execute on function public.start_creation_pet_sleep(uuid, text, text) from public, anon;
