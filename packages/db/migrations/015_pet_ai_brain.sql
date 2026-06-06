alter table public.creation_spaces
  add column if not exists boredom integer not null default 18 check (boredom between 0 and 100),
  add column if not exists comfort integer not null default 70 check (comfort between 0 and 100),
  add column if not exists curiosity integer not null default 50 check (curiosity between 0 and 100),
  add column if not exists personality_seed text not null default substring(md5(gen_random_uuid()::text), 1, 12),
  add column if not exists last_brain_tick_at timestamptz,
  add column if not exists last_ai_response_at timestamptz,
  add column if not exists last_ai_bubble text,
  add column if not exists last_rig_cue jsonb not null default '{}'::jsonb;

alter table public.creation_spaces
  drop constraint if exists creation_spaces_current_action_check,
  add constraint creation_spaces_current_action_check
  check (current_action in ('idle', 'walk', 'eat', 'pet', 'clean', 'play', 'sleep', 'sad', 'happy'));

alter table public.creation_actions
  drop constraint if exists creation_actions_action_type_check,
  add constraint creation_actions_action_type_check
  check (
    action_type in (
      'feed',
      'pet',
      'clean',
      'play',
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

create table if not exists public.pet_memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  memory_type text not null check (memory_type in ('preference', 'care_summary', 'footprint', 'online_together', 'milestone')),
  memory_scope text not null default 'short' check (memory_scope in ('short', 'core')),
  importance integer not null default 50 check (importance between 0 and 100),
  summary text not null check (char_length(summary) between 1 and 60),
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pet_memories_couple_created_idx
on public.pet_memories(couple_id, created_at desc)
where archived_at is null;

create index if not exists pet_memories_couple_scope_idx
on public.pet_memories(couple_id, memory_scope, importance desc, created_at desc)
where archived_at is null;

create table if not exists public.pet_ai_generations (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  trigger_type text not null,
  model text,
  input_summary jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  fallback_used boolean not null default false,
  error_code text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists pet_ai_generations_couple_created_idx
on public.pet_ai_generations(couple_id, created_at desc);

create index if not exists pet_ai_generations_daily_idx
on public.pet_ai_generations(couple_id, created_at desc)
where fallback_used is false;

alter table public.pet_memories enable row level security;
alter table public.pet_ai_generations enable row level security;

revoke all on public.pet_memories from anon, authenticated;
revoke all on public.pet_ai_generations from anon, authenticated;

grant select on public.pet_memories to authenticated;
grant select on public.pet_ai_generations to authenticated;

drop policy if exists "pet_memories select active members" on public.pet_memories;
create policy "pet_memories select active members"
on public.pet_memories for select
to authenticated
using (public.is_active_couple_member(couple_id));

drop policy if exists "pet_ai_generations select active members" on public.pet_ai_generations;
create policy "pet_ai_generations select active members"
on public.pet_ai_generations for select
to authenticated
using (public.is_active_couple_member(couple_id));

create or replace function public.pet_ai_int(value jsonb, fallback integer default 0)
returns integer
language plpgsql
stable
set search_path = public
as $$
begin
  if value is null or value = 'null'::jsonb then
    return fallback;
  end if;

  return (value #>> '{}')::integer;
exception
  when others then
    return fallback;
end;
$$;

revoke execute on function public.pet_ai_int(jsonb, integer) from public, anon, authenticated;

create or replace function public.archive_expired_pet_memories()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_count integer := 0;
begin
  update public.pet_memories
  set archived_at = now()
  where memory_scope = 'short'
    and archived_at is null
    and expires_at is not null
    and expires_at <= now();

  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

grant execute on function public.archive_expired_pet_memories() to authenticated;

create or replace function public.prepare_pet_ai_context(target_couple_id uuid, trigger_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_trigger text := left(coalesce(nullif(trim(trigger_type), ''), 'interaction'), 40);
  space_context jsonb := '{}'::jsonb;
  recent_actions jsonb := '[]'::jsonb;
  active_memories jsonb := '[]'::jsonb;
  recent_footprints jsonb := '[]'::jsonb;
  today_ai_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  perform public.archive_expired_pet_memories();

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  select jsonb_build_object(
    'pet_key', pet_key,
    'pet_species', pet_species,
    'pet_name', pet_name,
    'pet_mood', pet_mood,
    'pet_level', pet_level,
    'growth_points', growth_points,
    'fullness', fullness,
    'cleanliness', cleanliness,
    'affection', affection,
    'energy', energy,
    'boredom', boredom,
    'comfort', comfort,
    'curiosity', curiosity,
    'current_action', current_action,
    'treat_balance', treat_balance,
    'basic_food_count', basic_food_count,
    'premium_food_count', premium_food_count,
    'last_fed_food', last_fed_food,
    'last_fed_at', last_fed_at,
    'last_played_at', last_played_at,
    'last_interaction_at', last_interaction_at,
    'personality_seed', personality_seed,
    'last_ai_bubble', last_ai_bubble,
    'last_rig_cue', last_rig_cue
  )
  into space_context
  from public.creation_spaces
  where couple_id = target_couple_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'action_type', action_type,
      'action_label', action_label,
      'created_at', created_at,
      'metadata', metadata - 'latitude' - 'longitude' - 'note'
    )
    order by created_at desc
  ), '[]'::jsonb)
  into recent_actions
  from (
    select action_type, action_label, metadata, created_at
    from public.creation_actions
    where couple_id = target_couple_id
    order by created_at desc
    limit 16
  ) actions;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'memory_type', memory_type,
      'memory_scope', memory_scope,
      'importance', importance,
      'summary', summary,
      'created_at', created_at,
      'expires_at', expires_at
    )
    order by case when memory_scope = 'core' then 0 else 1 end, importance desc, created_at desc
  ), '[]'::jsonb)
  into active_memories
  from (
    select id, memory_type, memory_scope, importance, summary, created_at, expires_at
    from public.pet_memories
    where couple_id = target_couple_id
      and archived_at is null
      and (
        memory_scope = 'core'
        or (memory_scope = 'short' and coalesce(expires_at, created_at + interval '7 days') > now())
      )
    order by case when memory_scope = 'core' then 0 else 1 end, importance desc, created_at desc
    limit 14
  ) memories;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'title', title,
      'visited_at', visited_at,
      'created_at', created_at
    )
    order by visited_at desc, created_at desc
  ), '[]'::jsonb)
  into recent_footprints
  from (
    select title, visited_at, created_at
    from public.couple_footprints
    where couple_id = target_couple_id
      and deleted_at is null
    order by visited_at desc, created_at desc
    limit 5
  ) footprints;

  select count(*)::integer
  into today_ai_count
  from public.pet_ai_generations
  where couple_id = target_couple_id
    and fallback_used is false
    and created_at >= date_trunc('day', now());

  return jsonb_build_object(
    'trigger_type', clean_trigger,
    'today_ai_count', today_ai_count,
    'space', space_context,
    'recent_actions', recent_actions,
    'memories', active_memories,
    'recent_footprints', recent_footprints,
    'privacy_note', 'Only pet state, pet actions, pet memories, footprint titles, and inventory are included. Messages, letters, capsule bodies, photos, and exact coordinates are not included.'
  );
end;
$$;

grant execute on function public.prepare_pet_ai_context(uuid, text) to authenticated;

create or replace function public.apply_pet_ai_decision(
  target_couple_id uuid,
  trigger_type text,
  decision jsonb,
  generation_meta jsonb default '{}'::jsonb
)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_trigger text := left(coalesce(nullif(trim(trigger_type), ''), 'interaction'), 40);
  clean_action text := lower(coalesce(nullif(trim(decision ->> 'action'), ''), 'idle'));
  clean_mood text := left(coalesce(nullif(trim(decision ->> 'mood'), ''), '它认真听见了你们'), 40);
  clean_bubble text := left(coalesce(nullif(trim(decision ->> 'bubble'), ''), clean_mood), 36);
  clean_rig jsonb := case when jsonb_typeof(decision -> 'rig_cue') = 'object' then decision -> 'rig_cue' else '{}'::jsonb end;
  delta_fullness integer := greatest(-20, least(20, public.pet_ai_int(decision #> '{state_delta,fullness}', 0)));
  delta_cleanliness integer := greatest(-20, least(20, public.pet_ai_int(decision #> '{state_delta,cleanliness}', 0)));
  delta_affection integer := greatest(-20, least(20, public.pet_ai_int(decision #> '{state_delta,affection}', 0)));
  delta_energy integer := greatest(-20, least(20, public.pet_ai_int(decision #> '{state_delta,energy}', 0)));
  delta_boredom integer := greatest(-25, least(25, public.pet_ai_int(decision #> '{state_delta,boredom}', 0)));
  delta_comfort integer := greatest(-20, least(20, public.pet_ai_int(decision #> '{state_delta,comfort}', 0)));
  delta_growth integer := greatest(0, least(15, public.pet_ai_int(decision #> '{state_delta,growth_points}', 0)));
  memory_payload jsonb := case when jsonb_typeof(decision -> 'memory') = 'object' then decision -> 'memory' else '{}'::jsonb end;
  should_write_memory boolean := coalesce(memory_payload ->> 'should_write', '') = 'true';
  clean_memory_type text := lower(coalesce(nullif(trim(memory_payload ->> 'memory_type'), ''), 'care_summary'));
  requested_scope text := lower(coalesce(nullif(trim(memory_payload ->> 'memory_scope'), ''), 'short'));
  clean_scope text := 'short';
  clean_importance integer := greatest(0, least(100, public.pet_ai_int(memory_payload -> 'importance', 0)));
  clean_summary text := left(coalesce(nullif(trim(memory_payload ->> 'summary'), ''), ''), 60);
  clean_model text := left(nullif(trim(generation_meta ->> 'model'), ''), 80);
  clean_error_code text := left(nullif(trim(generation_meta ->> 'error_code'), ''), 64);
  duration integer := greatest(0, least(30000, public.pet_ai_int(generation_meta -> 'duration_ms', 0)));
  fallback boolean := coalesce(generation_meta ->> 'fallback_used', '') = 'true';
  input_summary jsonb := case when jsonb_typeof(generation_meta -> 'input_summary') = 'object' then generation_meta -> 'input_summary' else '{}'::jsonb end;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if jsonb_typeof(decision) is distinct from 'object' then
    raise exception 'invalid_ai_decision';
  end if;

  if clean_action not in ('idle', 'walk', 'eat', 'pet', 'clean', 'play', 'sleep', 'sad', 'happy') then
    raise exception 'invalid_ai_action';
  end if;

  if clean_bubble ~* '(https?://|www\.)' or clean_mood ~* '(https?://|www\.)' then
    raise exception 'invalid_ai_text';
  end if;

  if clean_memory_type not in ('preference', 'care_summary', 'footprint', 'online_together', 'milestone') then
    clean_memory_type := 'care_summary';
  end if;

  if requested_scope = 'core'
    and clean_importance >= 95
    and clean_memory_type in ('milestone', 'preference', 'online_together') then
    clean_scope := 'core';
  end if;

  if clean_scope = 'core' and (
    select count(*)
    from public.pet_memories
    where couple_id = target_couple_id
      and memory_scope = 'core'
      and archived_at is null
      and created_at >= date_trunc('day', now())
  ) >= 3 then
    clean_scope := 'short';
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
    pet_mood = clean_mood,
    current_action = clean_action,
    last_played_at = case when clean_action = 'play' then now() else last_played_at end,
    last_interaction_at = now(),
    last_brain_tick_at = now(),
    last_ai_response_at = now(),
    last_ai_bubble = clean_bubble,
    last_rig_cue = jsonb_build_object(
      'gaze', case when clean_rig ->> 'gaze' in ('user', 'bowl', 'toy', 'partner', 'none') then clean_rig ->> 'gaze' else 'none' end,
      'blink', case when clean_rig ->> 'blink' in ('normal', 'slow', 'sleepy') then clean_rig ->> 'blink' else 'normal' end,
      'tail', case when clean_rig ->> 'tail' in ('still', 'soft', 'fast') then clean_rig ->> 'tail' else 'soft' end,
      'pose', case when clean_rig ->> 'pose' in ('stand', 'sit', 'crouch', 'nap', 'bounce') then clean_rig ->> 'pose' else 'stand' end
    )
  where couple_id = target_couple_id;

  if should_write_memory and clean_summary <> '' then
    insert into public.pet_memories (
      couple_id,
      memory_type,
      memory_scope,
      importance,
      summary,
      metadata,
      expires_at,
      created_by
    )
    values (
      target_couple_id,
      clean_memory_type,
      clean_scope,
      clean_importance,
      clean_summary,
      jsonb_build_object('trigger_type', clean_trigger, 'source', case when fallback then 'fallback' else 'ai' end),
      case when clean_scope = 'core' then null else now() + interval '7 days' end,
      current_user_id
    );
  end if;

  insert into public.pet_ai_generations (
    couple_id,
    actor_id,
    trigger_type,
    model,
    input_summary,
    output_json,
    fallback_used,
    error_code,
    duration_ms
  )
  values (
    target_couple_id,
    current_user_id,
    clean_trigger,
    clean_model,
    input_summary,
    decision,
    fallback,
    clean_error_code,
    duration
  );

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'ai_brain',
    '云宠回应了「' || clean_bubble || '」',
    jsonb_build_object('trigger_type', clean_trigger, 'action', clean_action, 'fallback_used', fallback)
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

grant execute on function public.apply_pet_ai_decision(uuid, text, jsonb, jsonb) to authenticated;

create or replace function public.apply_pet_brain_fallback(target_couple_id uuid, trigger_type text)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_trigger text := left(coalesce(nullif(trim(trigger_type), ''), 'interaction'), 40);
  fallback_decision jsonb;
begin
  if clean_trigger like 'feed%' then
    fallback_decision := jsonb_build_object(
      'action', 'eat',
      'mood', '它吃得很安心，抬头看了看你',
      'bubble', '吃饱就想靠近你',
      'state_delta', jsonb_build_object('fullness', 4, 'cleanliness', -1, 'affection', 2, 'energy', 1, 'boredom', -4, 'comfort', 3, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'bowl', 'blink', 'normal', 'tail', 'soft', 'pose', 'sit')
    );
  elsif clean_trigger in ('pet', 'stroke', 'tap') then
    fallback_decision := jsonb_build_object(
      'action', 'pet',
      'mood', '它被摸得放松了，轻轻贴近你',
      'bubble', '再摸摸也可以',
      'state_delta', jsonb_build_object('fullness', -1, 'cleanliness', 0, 'affection', 3, 'energy', -1, 'boredom', -3, 'comfort', 4, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'user', 'blink', 'slow', 'tail', 'soft', 'pose', 'sit')
    );
  elsif clean_trigger = 'play' then
    fallback_decision := jsonb_build_object(
      'action', 'play',
      'mood', '它跟着你玩了一会儿，精神亮起来',
      'bubble', '再玩一个回合吧',
      'state_delta', jsonb_build_object('fullness', -2, 'cleanliness', -1, 'affection', 2, 'energy', -2, 'boredom', -8, 'comfort', 1, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'toy', 'blink', 'normal', 'tail', 'fast', 'pose', 'bounce')
    );
  elsif clean_trigger = 'clean' then
    fallback_decision := jsonb_build_object(
      'action', 'clean',
      'mood', '小屋变亮后，它放心地绕了一圈',
      'bubble', '这里亮晶晶的',
      'state_delta', jsonb_build_object('fullness', 0, 'cleanliness', 3, 'affection', 1, 'energy', -1, 'boredom', -1, 'comfort', 4, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'user', 'blink', 'normal', 'tail', 'soft', 'pose', 'stand')
    );
  elsif clean_trigger = 'footprint_add' then
    fallback_decision := jsonb_build_object(
      'action', 'happy',
      'mood', '它记住了你们刚刚放进小屋的一处足迹',
      'bubble', '那是你们去过的地方',
      'state_delta', jsonb_build_object('fullness', 0, 'cleanliness', 0, 'affection', 2, 'energy', 0, 'boredom', -2, 'comfort', 2, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', true, 'memory_type', 'footprint', 'memory_scope', 'short', 'importance', 62, 'summary', '你们记录了一处新的共同足迹'),
      'rig_cue', jsonb_build_object('gaze', 'partner', 'blink', 'normal', 'tail', 'fast', 'pose', 'bounce')
    );
  else
    fallback_decision := jsonb_build_object(
      'action', 'idle',
      'mood', '它安静地待在小屋里，等你们下一次靠近',
      'bubble', '我在这里等你们',
      'state_delta', jsonb_build_object('fullness', 0, 'cleanliness', 0, 'affection', 1, 'energy', 0, 'boredom', -1, 'comfort', 1, 'growth_points', 0),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'user', 'blink', 'slow', 'tail', 'soft', 'pose', 'sit')
    );
  end if;

  return query
  select *
  from public.apply_pet_ai_decision(
    target_couple_id,
    clean_trigger,
    fallback_decision,
    jsonb_build_object(
      'model', 'local-rules',
      'fallback_used', true,
      'error_code', 'fallback_local',
      'duration_ms', 0,
      'input_summary', jsonb_build_object('trigger_type', clean_trigger)
    )
  );
end;
$$;

grant execute on function public.apply_pet_brain_fallback(uuid, text) to authenticated;

create or replace function public.toggle_pet_memory_core(memory_id uuid, remember boolean)
returns setof public.pet_memories
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  memory_row public.pet_memories%rowtype;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into memory_row
  from public.pet_memories
  where id = memory_id;

  if memory_row.id is null then
    raise exception 'memory_not_found';
  end if;

  if not public.is_active_couple_member(memory_row.couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if remember then
    update public.pet_memories
    set
      memory_scope = 'core',
      importance = greatest(importance, 95),
      expires_at = null,
      archived_at = null,
      metadata = metadata || jsonb_build_object('manual_core_by', current_user_id, 'manual_core_at', now())
    where id = memory_id;

    insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
    values (
      memory_row.couple_id,
      current_user_id,
      'memory_update',
      '让云宠长期记住了一件事',
      jsonb_build_object('memory_id', memory_id, 'remember', true)
    );
  else
    update public.pet_memories
    set
      memory_scope = 'short',
      importance = least(importance, 80),
      expires_at = now() + interval '7 days',
      archived_at = null,
      metadata = metadata || jsonb_build_object('manual_core_cancelled_by', current_user_id, 'manual_core_cancelled_at', now())
    where id = memory_id;

    insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
    values (
      memory_row.couple_id,
      current_user_id,
      'memory_update',
      '取消了一条云宠长期记忆',
      jsonb_build_object('memory_id', memory_id, 'remember', false)
    );
  end if;

  return query
  select *
  from public.pet_memories
  where id = memory_id;
end;
$$;

grant execute on function public.toggle_pet_memory_core(uuid, boolean) to authenticated;
