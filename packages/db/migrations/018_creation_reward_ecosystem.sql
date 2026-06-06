create or replace function public.claim_creation_footprint_reward(
  target_couple_id uuid,
  target_footprint_id uuid
)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  footprint_title text;
  basic_reward integer := 1;
  treat_reward integer := 10;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  select title
  into footprint_title
  from public.couple_footprints
  where id = target_footprint_id
    and couple_id = target_couple_id
    and deleted_at is null;

  if footprint_title is null then
    raise exception 'footprint_not_found';
  end if;

  if exists (
    select 1
    from public.creation_actions
    where couple_id = target_couple_id
      and action_type = 'footprint_add'
      and metadata ->> 'footprint_id' = target_footprint_id::text
  ) then
    return query
    select *
    from public.creation_spaces
    where couple_id = target_couple_id;
    return;
  end if;

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  update public.creation_spaces
  set
    basic_food_count = basic_food_count + basic_reward,
    treat_balance = treat_balance + treat_reward,
    pet_mood = '你们的新足迹，变成了小家的养分',
    current_action = 'happy',
    last_interaction_at = now()
  where couple_id = target_couple_id;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'footprint_add',
    '点亮足迹「' || left(footprint_title, 28) || '」，凝聚养分',
    jsonb_build_object(
      'footprint_id', target_footprint_id,
      'basic_food_delta', basic_reward,
      'treat_delta', treat_reward
    )
  );

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
  treat_reward integer := 15;
  premium_reward integer := 1;
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
    treat_balance = treat_balance + treat_reward,
    premium_food_count = premium_food_count + premium_reward,
    pet_mood = '刚刚靠你们的默契赚到了一份加餐',
    current_action = 'happy',
    last_interaction_at = now()
  where couple_id = target_couple_id;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'game_reward',
    '解谜通关，鲜食粮和骨头金币已入仓',
    jsonb_build_object(
      'puzzle_id', clean_puzzle_id,
      'treat_delta', treat_reward,
      'premium_food_delta', premium_reward
    )
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

grant execute on function public.claim_creation_footprint_reward(uuid, uuid) to authenticated;
grant execute on function public.claim_creation_game_reward(uuid, text, boolean) to authenticated;
