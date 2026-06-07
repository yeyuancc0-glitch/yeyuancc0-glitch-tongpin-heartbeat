-- Tune Live2D pet energy recovery so feeding and sleep both help the pet roam again.

alter table public.creation_actions
  drop constraint if exists creation_actions_action_type_check,
  add constraint creation_actions_action_type_check
  check (
    action_type in (
      'feed',
      'pet',
      'clean',
      'play',
      'sleep',
      'rename',
      'decorate',
      'choose_pet',
      'buy_food',
      'game_reward',
      'ai_brain',
      'memory_update',
      'footprint_add',
      'footprint_update',
      'footprint_delete'
    )
  );

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

  update public.creation_spaces
  set
    basic_food_count = basic_food_count - case when clean_food_type = 'basic' then 1 else 0 end,
    premium_food_count = premium_food_count - case when clean_food_type = 'premium' then 1 else 0 end,
    fullness = greatest(0, least(100, fullness + delta_fullness)),
    affection = greatest(0, least(100, affection + delta_affection)),
    cleanliness = greatest(0, least(100, cleanliness - 2)),
    energy = greatest(0, least(100, energy + delta_energy)),
    growth_points = growth_points + delta_growth,
    pet_level = greatest(1, ((growth_points + delta_growth) / 100) + 1),
    pet_mood = next_mood,
    current_action = 'eat',
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
    jsonb_build_object('food_type', clean_food_type, 'growth', delta_growth, 'energy_delta', delta_energy)
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
  elsif clean_type = 'sleep' then
    delta_fullness := -3;
    delta_energy := 18;
    delta_growth := 4;
    delta_boredom := -2;
    delta_comfort := 8;
    next_mood := '在小窝里睡了一会儿，精神慢慢回来了';
    action_label := '哄云宠睡了一会儿';
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
    energy = greatest(0, least(100, energy + delta_energy)),
    boredom = greatest(0, least(100, boredom + delta_boredom)),
    comfort = greatest(0, least(100, comfort + delta_comfort)),
    growth_points = growth_points + delta_growth,
    pet_level = greatest(1, ((growth_points + delta_growth) / 100) + 1),
    pet_mood = next_mood,
    current_action = clean_type,
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
    jsonb_build_object('energy_delta', delta_energy, 'fullness_delta', delta_fullness)
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

grant execute on function public.feed_creation_pet(uuid, text) to authenticated;
grant execute on function public.interact_creation_pet(uuid, text) to authenticated;
