alter table public.creation_spaces
  add column if not exists pet_key text not null default 'silver_tabby',
  add column if not exists pet_species text not null default 'cat',
  add column if not exists treat_balance integer not null default 0 check (treat_balance >= 0),
  add column if not exists basic_food_count integer not null default 2 check (basic_food_count >= 0),
  add column if not exists premium_food_count integer not null default 0 check (premium_food_count >= 0),
  add column if not exists last_fed_food text;

alter table public.creation_spaces
  drop constraint if exists creation_spaces_pet_key_check,
  add constraint creation_spaces_pet_key_check
  check (pet_key in ('silver_tabby', 'golden_retriever', 'cream_shorthair', 'corgi'));

alter table public.creation_spaces
  drop constraint if exists creation_spaces_pet_species_check,
  add constraint creation_spaces_pet_species_check
  check (pet_species in ('cat', 'dog'));

alter table public.creation_spaces
  drop constraint if exists creation_spaces_last_fed_food_check,
  add constraint creation_spaces_last_fed_food_check
  check (last_fed_food is null or last_fed_food in ('basic', 'premium'));

alter table public.creation_actions
  drop constraint if exists creation_actions_action_type_check,
  add constraint creation_actions_action_type_check
  check (
    action_type in (
      'feed',
      'pet',
      'clean',
      'rename',
      'decorate',
      'choose_pet',
      'buy_food',
      'game_reward',
      'footprint_add',
      'footprint_update',
      'footprint_delete'
    )
  );

create or replace function public.creation_pet_species_for_key(pet_key text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when pet_key in ('silver_tabby', 'cream_shorthair') then 'cat'
    when pet_key in ('golden_retriever', 'corgi') then 'dog'
    else null
  end;
$$;

create or replace function public.choose_creation_pet(
  target_couple_id uuid,
  chosen_pet_key text,
  chosen_pet_name text
)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_pet_key text := lower(nullif(trim(chosen_pet_key), ''));
  clean_species text := public.creation_pet_species_for_key(clean_pet_key);
  clean_pet_name text := left(coalesce(nullif(trim(chosen_pet_name), ''), '小云宠'), 16);
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if clean_species is null then
    raise exception 'unsupported_pet_key';
  end if;

  insert into public.creation_spaces (couple_id, pet_key, pet_species, pet_name, pet_mood)
  values (target_couple_id, clean_pet_key, clean_species, clean_pet_name, '刚刚住进你们的云端小屋')
  on conflict (couple_id) do nothing;

  update public.creation_spaces
  set
    pet_key = clean_pet_key,
    pet_species = clean_species,
    pet_name = clean_pet_name,
    pet_mood = case
      when clean_species = 'cat' then '换好小窝后，正在安静观察你们'
      else '换好小窝后，正摇着尾巴等你们'
    end,
    last_interaction_at = now()
  where couple_id = target_couple_id;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'choose_pet',
    '选择了云宠「' || clean_pet_name || '」',
    jsonb_build_object('pet_key', clean_pet_key, 'pet_species', clean_species, 'pet_name', clean_pet_name)
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

create or replace function public.buy_creation_food(
  target_couple_id uuid,
  food_type text,
  quantity integer default 1
)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_food_type text := lower(nullif(trim(food_type), ''));
  clean_quantity integer := greatest(1, least(10, coalesce(quantity, 1)));
  unit_price integer;
  total_price integer;
  food_label text;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if clean_food_type = 'basic' then
    unit_price := 6;
    food_label := '日常粮';
  elsif clean_food_type = 'premium' then
    unit_price := 14;
    food_label := '鲜食粮';
  else
    raise exception 'unsupported_food_type';
  end if;

  total_price := unit_price * clean_quantity;

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  update public.creation_spaces
  set
    treat_balance = treat_balance - total_price,
    basic_food_count = basic_food_count + case when clean_food_type = 'basic' then clean_quantity else 0 end,
    premium_food_count = premium_food_count + case when clean_food_type = 'premium' then clean_quantity else 0 end,
    pet_mood = '粮仓补充好了，今天也有人惦记它',
    last_interaction_at = now()
  where couple_id = target_couple_id
    and treat_balance >= total_price;

  if not found then
    raise exception 'insufficient_treat_balance';
  end if;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'buy_food',
    '用奖励买了' || clean_quantity || '份' || food_label,
    jsonb_build_object('food_type', clean_food_type, 'quantity', clean_quantity, 'cost', total_price)
  );

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
    next_mood := '吃完日常粮后，安心地趴在你们身边';
    food_label := '日常粮';
  elsif clean_food_type = 'premium' then
    delta_fullness := 30;
    delta_affection := 10;
    delta_growth := 18;
    next_mood := '吃到鲜食粮后，整只都亮了起来';
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
    growth_points = growth_points + delta_growth,
    pet_level = greatest(1, ((growth_points + delta_growth) / 100) + 1),
    pet_mood = next_mood,
    last_fed_food = clean_food_type,
    last_interaction_at = now()
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
    jsonb_build_object('food_type', clean_food_type, 'growth', delta_growth)
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
    delta_affection := 16;
    delta_fullness := -2;
    delta_growth := 6;
    next_mood := '被摸摸后变得很黏人';
    action_label := '摸摸了云宠';
  elsif clean_type = 'clean' then
    delta_cleanliness := 20;
    delta_affection := 3;
    delta_growth := 7;
    next_mood := '小屋被收拾得亮亮的';
    action_label := '打扫了云宠小屋';
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

create or replace function public.claim_creation_game_reward(
  target_couple_id uuid,
  puzzle_id text,
  solved boolean
)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_puzzle_id text := left(coalesce(nullif(trim(puzzle_id), ''), 'puzzle'), 48);
  reward integer := 10;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if not solved then
    raise exception 'puzzle_not_solved';
  end if;

  if exists (
    select 1
    from public.creation_actions
    where couple_id = target_couple_id
      and action_type = 'game_reward'
      and metadata ->> 'puzzle_id' = clean_puzzle_id
      and created_at >= date_trunc('day', now())
  ) then
    raise exception 'puzzle_reward_already_claimed_today';
  end if;

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  update public.creation_spaces
  set
    treat_balance = treat_balance + reward,
    pet_mood = '刚刚靠你们的脑力赚到了一点口粮',
    last_interaction_at = now()
  where couple_id = target_couple_id;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'game_reward',
    '解开一道小谜题，获得' || reward || '点奖励',
    jsonb_build_object('puzzle_id', clean_puzzle_id, 'reward', reward)
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

grant execute on function public.creation_pet_species_for_key(text) to authenticated;
grant execute on function public.choose_creation_pet(uuid, text, text) to authenticated;
grant execute on function public.buy_creation_food(uuid, text, integer) to authenticated;
grant execute on function public.feed_creation_pet(uuid, text) to authenticated;
grant execute on function public.claim_creation_game_reward(uuid, text, boolean) to authenticated;
