-- Audit hardening: close broad client write paths and add atomic push claims.

create extension if not exists pgcrypto;

alter table public.push_deliveries
  drop constraint if exists push_deliveries_status_check,
  add constraint push_deliveries_status_check
  check (status in ('pending', 'processing', 'sent', 'skipped', 'failed'));

create unique index if not exists creation_actions_footprint_reward_once_idx
on public.creation_actions(couple_id, (metadata ->> 'reward_key'))
where action_type = 'footprint_add' and metadata ? 'reward_key';

create unique index if not exists creation_actions_game_reward_once_per_day_idx
on public.creation_actions(couple_id, (metadata ->> 'reward_key'))
where action_type = 'game_reward' and metadata ? 'reward_key';

create or replace function public.create_pair_invite(invite_expires_at timestamptz default now() + interval '7 days')
returns setof public.pair_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  generated_code text;
  attempt integer;
  inserted_invite public.pair_invites;
begin
  if current_user_id is null then
    raise exception 'login_required';
  end if;

  if public.user_has_active_couple(current_user_id) then
    raise exception 'user_already_has_active_couple';
  end if;

  update public.pair_invites
  set status = 'cancelled'
  where created_by = current_user_id
    and status = 'pending';

  for attempt in 1..12 loop
    generated_code := '';
    for i in 1..8 loop
      generated_code := generated_code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;

    begin
      insert into public.pair_invites (created_by, code, expires_at)
      values (current_user_id, generated_code, greatest(coalesce(invite_expires_at, now() + interval '7 days'), now() + interval '10 minutes'))
      returning * into inserted_invite;

      return query select inserted_invite.*;
      return;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  raise exception 'invite_code_generation_failed';
end;
$$;

create or replace function public.create_future_letter(
  target_couple_id uuid,
  recipient_id uuid,
  letter_title text,
  letter_body text,
  unlock_at timestamptz
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_title text := left(coalesce(nullif(trim(letter_title), ''), '一封写给你的信'), 80);
  clean_body text := nullif(trim(letter_body), '');
  new_letter_id uuid;
begin
  if current_user_id is null then
    raise exception 'login_required';
  end if;

  if clean_body is null then
    raise exception 'letter_body_required';
  end if;

  if recipient_id = current_user_id then
    raise exception 'recipient_required';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id)
     or not public.is_active_couple_member(target_couple_id, recipient_id) then
    raise exception 'active_couple_not_found';
  end if;

  insert into public.future_letters (couple_id, author_id, recipient_id, title, body, unlock_at)
  values (target_couple_id, current_user_id, recipient_id, clean_title, clean_body, coalesce(unlock_at, now()))
  returning future_letters.id into new_letter_id;

  insert into public.notifications (
    couple_id,
    user_id,
    actor_id,
    type,
    title,
    body,
    related_table,
    related_id
  )
  values (
    target_couple_id,
    recipient_id,
    current_user_id,
    'letter',
    case when coalesce(unlock_at, now()) <= now() + interval '30 seconds' then '你收到了一封信' else '一封信已经寄到未来' end,
    case when coalesce(unlock_at, now()) <= now() + interval '30 seconds' then '现在就可以打开。' else '到约定时间再打开。' end,
    'future_letters',
    new_letter_id
  );

  return query select new_letter_id;
end;
$$;

create or replace function public.create_partner_notification(
  target_couple_id uuid,
  notification_type text,
  notification_title text,
  notification_body text default null,
  related_table text default null,
  related_id uuid default null
)
returns table (notification_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  partner_user_id uuid;
  clean_type text := lower(coalesce(nullif(trim(notification_type), ''), 'system'));
  clean_title text := left(coalesce(nullif(trim(notification_title), ''), '你有一条新提醒'), 80);
  clean_body text := case when notification_body is null then null else left(trim(notification_body), 160) end;
  clean_related_table text := nullif(trim(related_table), '');
  inserted_id uuid;
begin
  if current_user_id is null then
    raise exception 'login_required';
  end if;

  if clean_type not in ('letter', 'message', 'checkin', 'calendar_event', 'system') then
    raise exception 'unsupported_notification_type';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  partner_user_id := public.active_partner_id(target_couple_id, current_user_id);
  if partner_user_id is null then
    raise exception 'active_partner_not_found';
  end if;

  insert into public.notifications (
    couple_id,
    user_id,
    actor_id,
    type,
    title,
    body,
    related_table,
    related_id
  )
  values (
    target_couple_id,
    partner_user_id,
    current_user_id,
    clean_type,
    clean_title,
    clean_body,
    clean_related_table,
    related_id
  )
  returning id into inserted_id;

  return query select inserted_id;
end;
$$;

create or replace function public.record_creation_action(
  target_couple_id uuid,
  action_type text,
  action_label text,
  action_metadata jsonb default '{}'::jsonb
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_type text := lower(coalesce(nullif(trim(action_type), ''), ''));
  clean_label text := left(coalesce(nullif(trim(action_label), ''), '更新了家园'), 120);
  inserted_id uuid;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if clean_type not in ('footprint_add', 'footprint_update', 'footprint_delete') then
    raise exception 'unsupported_action_type';
  end if;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (target_couple_id, current_user_id, clean_type, clean_label, coalesce(action_metadata, '{}'::jsonb))
  returning creation_actions.id into inserted_id;

  return query select inserted_id;
end;
$$;

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

  perform 1 from public.creation_spaces where couple_id = target_couple_id for update;

  select title
  into footprint_title
  from public.couple_footprints
  where id = target_footprint_id
    and couple_id = target_couple_id
    and deleted_at is null
  for update;

  if footprint_title is null then
    raise exception 'footprint_not_found';
  end if;

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'footprint_add',
    '点亮足迹，凝聚养分',
    jsonb_build_object(
      'footprint_id', target_footprint_id,
      'reward_key', target_footprint_id::text,
      'basic_food_delta', basic_reward,
      'treat_delta', treat_reward
    )
  )
  on conflict do nothing;

  if not found then
    return query
    select *
    from public.creation_spaces
    where couple_id = target_couple_id;
    return;
  end if;

  update public.creation_spaces
  set
    basic_food_count = basic_food_count + basic_reward,
    treat_balance = treat_balance + treat_reward,
    pet_mood = '你们的新足迹，变成了小家的养分',
    current_action = 'happy',
    last_interaction_at = now()
  where couple_id = target_couple_id;

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
  reward_date text := to_char(now() at time zone 'Asia/Shanghai', 'YYYY-MM-DD');
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

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  perform 1 from public.creation_spaces where couple_id = target_couple_id for update;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'game_reward',
    '解谜通关，鲜食粮和骨头金币已入仓',
    jsonb_build_object(
      'puzzle_id', clean_puzzle_id,
      'reward_date', reward_date,
      'reward_key', clean_puzzle_id || ':' || reward_date,
      'treat_delta', treat_reward,
      'premium_food_delta', premium_reward
    )
  )
  on conflict do nothing;

  if not found then
    raise exception 'puzzle_reward_already_claimed_today';
  end if;

  update public.creation_spaces
  set
    treat_balance = treat_balance + treat_reward,
    premium_food_count = premium_food_count + premium_reward,
    pet_mood = '刚刚靠你们的默契赚到了一份加餐',
    current_action = 'happy',
    last_interaction_at = now()
  where couple_id = target_couple_id;

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

create or replace function public.claim_push_deliveries(max_count integer default 50)
returns table (
  id uuid,
  notification_id uuid,
  user_id uuid,
  attempt_count integer,
  created_at timestamptz,
  notification jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select pd.id
    from public.push_deliveries pd
    where pd.status in ('pending', 'failed')
      and pd.attempt_count < 3
    order by pd.created_at asc
    limit greatest(1, least(coalesce(max_count, 50), 100))
    for update skip locked
  ),
  updated as (
    update public.push_deliveries pd
    set status = 'processing',
        updated_at = now()
    from claimed
    where pd.id = claimed.id
    returning pd.*
  )
  select
    u.id,
    u.notification_id,
    u.user_id,
    u.attempt_count,
    u.created_at,
    to_jsonb(n.*) as notification
  from updated u
  left join public.notifications n on n.id = u.notification_id
  order by u.created_at asc;
end;
$$;

create or replace function public.mark_push_delivery_result(
  delivery_id uuid,
  next_status text,
  previous_attempt_count integer,
  error_message text default null
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_status text := lower(coalesce(nullif(trim(next_status), ''), 'failed'));
begin
  if clean_status not in ('sent', 'skipped', 'failed') then
    raise exception 'unsupported_push_delivery_status';
  end if;

  update public.push_deliveries pd
  set status = clean_status,
      attempt_count = greatest(pd.attempt_count, coalesce(previous_attempt_count, pd.attempt_count) + 1),
      expo_ticket_id = null,
      last_error = case when clean_status = 'sent' then left(nullif(error_message, ''), 240) else left(coalesce(error_message, 'push_delivery_failed'), 240) end,
      sent_at = case when clean_status = 'sent' then now() else pd.sent_at end,
      updated_at = now()
  where pd.id = delivery_id;

  if not found then
    raise exception 'push_delivery_not_found';
  end if;

  return query select delivery_id;
end;
$$;

create or replace function public.requeue_stale_push_deliveries(stale_after interval default interval '2 minutes')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
begin
  update public.push_deliveries
  set status = 'failed',
      last_error = 'processing_timeout',
      updated_at = now()
  where status = 'processing'
    and updated_at < now() - coalesce(stale_after, interval '2 minutes')
    and attempt_count < 3;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

drop policy if exists "pair_invites select own or pending by code" on public.pair_invites;
drop policy if exists "pair_invites select own" on public.pair_invites;
create policy "pair_invites select own"
on public.pair_invites for select
to authenticated
using (created_by = auth.uid() or accepted_by = auth.uid());

drop policy if exists "future_letters insert own active couple" on public.future_letters;
drop policy if exists "future_letters update author active couple" on public.future_letters;
drop policy if exists "future_letters delete author active couple" on public.future_letters;

drop policy if exists "notifications insert active couple recipient" on public.notifications;

drop policy if exists "creation_actions insert active member actor" on public.creation_actions;

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, avatar_thumbnail_url, birthdate, updated_at) on public.profiles to authenticated;

revoke insert, update, delete on public.future_letters from authenticated;
revoke insert on public.notifications from authenticated;
revoke insert on public.creation_actions from authenticated;

grant execute on function public.create_pair_invite(timestamptz) to authenticated;
grant execute on function public.create_future_letter(uuid, uuid, text, text, timestamptz) to authenticated;
grant execute on function public.create_partner_notification(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.record_creation_action(uuid, text, text, jsonb) to authenticated;

revoke execute on function public.archive_expired_pet_memories() from public, anon, authenticated;

revoke execute on function public.claim_push_deliveries(integer) from public, anon, authenticated;
revoke execute on function public.mark_push_delivery_result(uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public.requeue_stale_push_deliveries(interval) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;
grant execute on function public.mark_push_delivery_result(uuid, text, integer, text) to service_role;
grant execute on function public.requeue_stale_push_deliveries(interval) to service_role;

revoke execute on function public.apply_pet_ai_decision(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.apply_pet_world_decision(uuid, jsonb, jsonb) from public, anon;
