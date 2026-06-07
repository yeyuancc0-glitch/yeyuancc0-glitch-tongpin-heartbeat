-- Step 8/9: director protocol memory policy and safer pet memory management.

alter table public.pet_memories
  drop constraint if exists pet_memories_memory_type_check,
  add constraint pet_memories_memory_type_check
  check (memory_type in ('preference', 'care_summary', 'event', 'footprint', 'online_together', 'milestone'));

create index if not exists pet_memories_dedupe_idx
on public.pet_memories(couple_id, (metadata ->> 'dedupe_key'))
where archived_at is null and metadata ? 'dedupe_key';

create or replace function public.pet_memory_summary_is_safe(summary text)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    coalesce(nullif(trim(summary), ''), '') <> ''
    and char_length(trim(summary)) <= 60
    and trim(summary) !~* '(https?://|www\.)'
    and trim(summary) !~ '(留言正文|信件正文|胶囊正文|照片内容|照片里|图片里|精确坐标|经纬度|latitude|longitude|他说|她说|TA说|内容是|原文|截图|相册内容)';
$$;

revoke execute on function public.pet_memory_summary_is_safe(text) from public, anon, authenticated;

create or replace function public.insert_pet_memory_if_allowed(
  target_couple_id uuid,
  actor_id uuid,
  requested_memory_type text,
  requested_scope text,
  requested_importance integer,
  requested_summary text,
  requested_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_type text := lower(coalesce(nullif(trim(requested_memory_type), ''), 'event'));
  clean_scope text := 'short';
  clean_importance integer := greatest(0, least(100, coalesce(requested_importance, 0)));
  clean_summary text := left(coalesce(nullif(trim(requested_summary), ''), ''), 60);
  clean_metadata jsonb := case when jsonb_typeof(requested_metadata) = 'object' then requested_metadata else '{}'::jsonb end;
  dedupe_key text := left(nullif(trim(clean_metadata ->> 'dedupe_key'), ''), 80);
  allowed_memory_kind boolean;
  current_user_id uuid := auth.uid();
  inserted_id uuid;
begin
  if current_user_id is not null and not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if actor_id is not null and not public.is_active_couple_member(target_couple_id, actor_id) then
    raise exception 'active_couple_not_found';
  end if;

  if clean_type not in ('preference', 'care_summary', 'event', 'footprint', 'online_together', 'milestone') then
    clean_type := 'event';
  end if;

  if lower(coalesce(requested_scope, 'short')) = 'core'
    and clean_importance >= 95
    and clean_type in ('milestone', 'preference', 'event', 'online_together') then
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

  allowed_memory_kind :=
    dedupe_key in ('first_adoption', 'first_naming', 'first_letter_delivery', 'frequent_feed', 'frequent_pet')
    or dedupe_key like 'anniversary_memory:%'
    or dedupe_key like 'recent_memory_surface:%';

  if allowed_memory_kind is not true then
    return null::uuid;
  end if;

  if not public.pet_memory_summary_is_safe(clean_summary) then
    return null::uuid;
  end if;

  if dedupe_key is not null and exists (
    select 1
    from public.pet_memories
    where couple_id = target_couple_id
      and archived_at is null
      and metadata ->> 'dedupe_key' = dedupe_key
  ) then
    return null::uuid;
  end if;

  if dedupe_key is null and exists (
    select 1
    from public.pet_memories
    where couple_id = target_couple_id
      and archived_at is null
      and summary = clean_summary
      and created_at >= now() - interval '14 days'
  ) then
    return null::uuid;
  end if;

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
    clean_type,
    clean_scope,
    clean_importance,
    clean_summary,
    clean_metadata || jsonb_build_object('source', coalesce(clean_metadata ->> 'source', 'rules')),
    case when clean_scope = 'core' then null else now() + interval '7 days' end,
    actor_id
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke execute on function public.insert_pet_memory_if_allowed(uuid, uuid, text, text, integer, text, jsonb) from public, anon, authenticated;

create or replace function public.archive_pet_memory(memory_id uuid)
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

  update public.pet_memories
  set
    archived_at = now(),
    metadata = metadata || jsonb_build_object('archived_by', current_user_id, 'archived_reason', 'user_deleted')
  where id = memory_id;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    memory_row.couple_id,
    current_user_id,
    'memory_update',
    '删除了一条云宠记忆',
    jsonb_build_object('memory_id', memory_id, 'archive', true)
  );

  return query
  select *
  from public.pet_memories
  where id = memory_id;
end;
$$;

grant execute on function public.archive_pet_memory(uuid) to authenticated;

create or replace function public.record_pet_memory_from_creation_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_count integer := 0;
  clean_pet_name text := left(coalesce(nullif(trim(new.metadata ->> 'pet_name'), ''), '迪灵'), 16);
begin
  if new.action_type = 'choose_pet' then
    perform public.insert_pet_memory_if_allowed(
      new.couple_id,
      new.actor_id,
      'milestone',
      'core',
      98,
      '第一次住进你们的小窝',
      jsonb_build_object('dedupe_key', 'first_adoption', 'trigger_type', new.action_type, 'source', 'creation_action')
    );

    perform public.insert_pet_memory_if_allowed(
      new.couple_id,
      new.actor_id,
      'preference',
      'core',
      96,
      '第一次被叫作「' || clean_pet_name || '」',
      jsonb_build_object('dedupe_key', 'first_naming', 'trigger_type', new.action_type, 'source', 'creation_action')
    );
  elsif new.action_type in ('feed', 'pet') then
    select count(*)::integer
    into action_count
    from public.creation_actions
    where couple_id = new.couple_id
      and action_type = new.action_type
      and created_at >= now() - interval '7 days';

    if new.action_type = 'feed' and action_count >= 5 then
      perform public.insert_pet_memory_if_allowed(
        new.couple_id,
        new.actor_id,
        'preference',
        'core',
        96,
        '你们常常记得喂我',
        jsonb_build_object('dedupe_key', 'frequent_feed', 'trigger_type', new.action_type, 'source', 'creation_action')
      );
    elsif new.action_type = 'pet' and action_count >= 5 then
      perform public.insert_pet_memory_if_allowed(
        new.couple_id,
        new.actor_id,
        'preference',
        'core',
        96,
        '你们常常摸摸我',
        jsonb_build_object('dedupe_key', 'frequent_pet', 'trigger_type', new.action_type, 'source', 'creation_action')
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists creation_actions_record_pet_memory on public.creation_actions;
create trigger creation_actions_record_pet_memory
after insert on public.creation_actions
for each row
execute function public.record_pet_memory_from_creation_action();

create or replace function public.record_pet_memory_from_world_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  memory_seen_count integer := 0;
begin
  if new.event_type = 'surface_seen' and new.surface = 'memory' then
    select count(*)::integer
    into memory_seen_count
    from public.pet_world_events
    where couple_id = new.couple_id
      and event_type = 'surface_seen'
      and surface = 'memory'
      and created_at >= now() - interval '7 days';

    if memory_seen_count >= 3 then
      perform public.insert_pet_memory_if_allowed(
        new.couple_id,
        new.actor_id,
        'event',
        'short',
        72,
        '最近常去记忆页慢慢看',
        jsonb_build_object('dedupe_key', 'recent_memory_surface:' || to_char(now(), 'IYYY-IW'), 'trigger_type', 'surface_seen', 'source', 'pet_world_event')
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists pet_world_events_record_pet_memory on public.pet_world_events;
create trigger pet_world_events_record_pet_memory
after insert on public.pet_world_events
for each row
execute function public.record_pet_memory_from_world_event();

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
  delta_fullness integer := greatest(-20, least(20, public.pet_ai_int(coalesce(decision #> '{state_delta,fullness}', decision #> '{world,state_delta,fullness}'), 0)));
  delta_cleanliness integer := greatest(-20, least(20, public.pet_ai_int(coalesce(decision #> '{state_delta,cleanliness}', decision #> '{world,state_delta,cleanliness}'), 0)));
  delta_affection integer := greatest(-20, least(20, public.pet_ai_int(coalesce(decision #> '{state_delta,affection}', decision #> '{world,state_delta,affection}'), 0)));
  delta_energy integer := greatest(-20, least(20, public.pet_ai_int(coalesce(decision #> '{state_delta,energy}', decision #> '{world,state_delta,energy}'), 0)));
  delta_boredom integer := greatest(-25, least(25, public.pet_ai_int(coalesce(decision #> '{state_delta,boredom}', decision #> '{world,state_delta,boredom}'), 0)));
  delta_comfort integer := greatest(-20, least(20, public.pet_ai_int(coalesce(decision #> '{state_delta,comfort}', decision #> '{world,state_delta,comfort}'), 0)));
  delta_growth integer := greatest(0, least(15, public.pet_ai_int(coalesce(decision #> '{state_delta,growth_points}', decision #> '{world,state_delta,growth_points}'), 0)));
  memory_payload jsonb := case when jsonb_typeof(decision -> 'memory') = 'object' then decision -> 'memory' else '{}'::jsonb end;
  should_write_memory boolean := coalesce(memory_payload ->> 'should_write', '') = 'true';
  clean_memory_type text := lower(coalesce(nullif(trim(memory_payload ->> 'memory_type'), ''), 'care_summary'));
  requested_scope text := lower(coalesce(nullif(trim(memory_payload ->> 'memory_scope'), ''), 'short'));
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
    perform public.insert_pet_memory_if_allowed(
      target_couple_id,
      current_user_id,
      clean_memory_type,
      requested_scope,
      clean_importance,
      clean_summary,
      jsonb_strip_nulls(jsonb_build_object(
        'trigger_type', clean_trigger,
        'dedupe_key', nullif(left(memory_payload ->> 'dedupe_key', 80), ''),
        'source', case when fallback then 'fallback' else 'ai' end
      ))
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

create or replace function public.apply_pet_world_decision(
  target_couple_id uuid,
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
  requested_surface text := lower(coalesce(decision ->> 'target_surface', 'pet_room'));
  clean_surface text := case when requested_surface in ('footprints', 'playground') then 'pet_room' else requested_surface end;
  clean_intent text := lower(coalesce(decision ->> 'intent', 'wander'));
  clean_animation text := lower(coalesce(decision ->> 'animation', 'idle'));
  clean_mood text := lower(coalesce(decision ->> 'mood', 'calm'));
  clean_speech text := left(coalesce(nullif(trim(decision ->> 'speech'), ''), nullif(trim(decision ->> 'bubble'), ''), ''), 64);
  clean_expression text := lower(coalesce(nullif(trim(decision ->> 'expression'), ''), clean_mood));
  clean_symbol text := left(coalesce(nullif(trim(decision ->> 'symbol'), ''), ''), 16);
  clean_sound_cue text := lower(coalesce(nullif(trim(decision ->> 'sound_cue'), ''), 'none'));
  clean_prop text := lower(coalesce(nullif(trim(decision ->> 'prop'), ''), 'none'));
  delta_fullness integer := greatest(-20, least(20, public.pet_ai_int(coalesce(decision #> '{state_delta,fullness}', decision #> '{world,state_delta,fullness}'), 0)));
  delta_cleanliness integer := greatest(-20, least(20, public.pet_ai_int(coalesce(decision #> '{state_delta,cleanliness}', decision #> '{world,state_delta,cleanliness}'), 0)));
  delta_affection integer := greatest(-20, least(20, public.pet_ai_int(coalesce(decision #> '{state_delta,affection}', decision #> '{world,state_delta,affection}'), 0)));
  delta_energy integer := greatest(-20, least(20, public.pet_ai_int(coalesce(decision #> '{state_delta,energy}', decision #> '{world,state_delta,energy}'), 0)));
  delta_boredom integer := greatest(-25, least(25, public.pet_ai_int(coalesce(decision #> '{state_delta,boredom}', decision #> '{world,state_delta,boredom}'), 0)));
  delta_comfort integer := greatest(-20, least(20, public.pet_ai_int(coalesce(decision #> '{state_delta,comfort}', decision #> '{world,state_delta,comfort}'), 0)));
  delta_growth integer := greatest(0, least(15, public.pet_ai_int(coalesce(decision #> '{state_delta,growth_points}', decision #> '{world,state_delta,growth_points}'), 0)));
  memory_payload jsonb := case when jsonb_typeof(decision -> 'memory_policy') = 'object' then decision -> 'memory_policy' else '{}'::jsonb end;
  should_write_memory boolean := coalesce(memory_payload ->> 'should_write', '') = 'true';
  clean_memory_summary text := left(coalesce(nullif(trim(memory_payload ->> 'summary'), ''), ''), 60);
  clean_memory_type text := lower(coalesce(nullif(trim(memory_payload ->> 'memory_type'), ''), 'event'));
  clean_memory_scope text := lower(coalesce(nullif(trim(memory_payload ->> 'memory_scope'), ''), 'short'));
  clean_importance integer := greatest(0, least(100, public.pet_ai_int(memory_payload -> 'importance', 0)));
  clean_decision jsonb;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if jsonb_typeof(decision) is distinct from 'object' then
    raise exception 'invalid_world_decision';
  end if;

  if clean_surface not in ('home', 'share', 'memory', 'creation_hub', 'pet_room') then
    raise exception 'unsupported_surface';
  end if;

  if clean_intent not in ('wander', 'hide', 'seek_attention', 'inspect_memory', 'visit_partner', 'return_home', 'rest', 'play', 'ask_food', 'comfort_user') then
    raise exception 'unsupported_intent';
  end if;

  if clean_animation not in ('idle', 'walk', 'run', 'hop', 'float', 'hide', 'peek', 'found', 'summon', 'sleep', 'happy', 'sad', 'eat', 'pet', 'clean', 'play', 'curious', 'return_home', 'inspect', 'visit_partner') then
    raise exception 'unsupported_animation';
  end if;

  if clean_mood not in ('happy', 'curious', 'sleepy', 'lonely', 'excited', 'calm', 'hungry') then
    raise exception 'unsupported_mood';
  end if;

  if clean_expression not in ('happy', 'curious', 'sleepy', 'lonely', 'excited', 'calm', 'hungry', 'soft', 'shy') then
    clean_expression := clean_mood;
  end if;

  if clean_sound_cue not in ('none', 'soft_chime', 'purr', 'tap', 'letter', 'photo') then
    clean_sound_cue := 'none';
  end if;

  if clean_prop not in ('none', 'letter', 'photo', 'memory') then
    clean_prop := 'none';
  end if;

  if clean_speech <> '' and not public.pet_memory_summary_is_safe(clean_speech) then
    clean_speech := '';
  end if;

  clean_decision := jsonb_strip_nulls(
    coalesce(decision, '{}'::jsonb)
    || jsonb_build_object(
      'target_surface', clean_surface,
      'intent', clean_intent,
      'animation', clean_animation,
      'mood', clean_mood,
      'expression', clean_expression,
      'symbol', clean_symbol,
      'sound_cue', clean_sound_cue,
      'prop', clean_prop,
      'speech', clean_speech,
      'bubble', clean_speech
    )
  );

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
    last_world_decision = clean_decision,
    pet_world_surface = clean_surface,
    pet_world_state = clean_animation,
    pet_world_mood = clean_mood,
    pet_hidden = clean_intent = 'hide',
    pet_last_seen_at = case when clean_intent in ('seek_attention', 'comfort_user', 'visit_partner', 'found') then now() else pet_last_seen_at end,
    pet_last_found_at = case when clean_intent = 'found' then now() else pet_last_found_at end,
    pet_last_surface_changed_at = case when pet_world_surface is distinct from clean_surface then now() else pet_last_surface_changed_at end,
    last_ai_bubble = case when clean_speech <> '' then clean_speech else last_ai_bubble end,
    last_interaction_at = now(),
    last_ai_response_at = now()
  where couple_id = target_couple_id;

  if should_write_memory and clean_memory_summary <> '' then
    perform public.insert_pet_memory_if_allowed(
      target_couple_id,
      current_user_id,
      clean_memory_type,
      clean_memory_scope,
      clean_importance,
      clean_memory_summary,
      jsonb_build_object(
        'trigger_type', coalesce(generation_meta ->> 'trigger', generation_meta ->> 'source', clean_intent),
        'dedupe_key', nullif(left(memory_payload ->> 'dedupe_key', 80), ''),
        'source', 'world_decision',
        'surface', clean_surface,
        'intent', clean_intent
      )
    );
  end if;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'ai_brain',
    '云宠回应了「' || coalesce(nullif(clean_speech, ''), clean_intent) || '」',
    coalesce(generation_meta, '{}'::jsonb) || jsonb_build_object(
      'surface', clean_surface,
      'intent', clean_intent,
      'animation', clean_animation,
      'mood', clean_mood
    )
  );

  insert into public.pet_world_events (couple_id, actor_id, event_type, surface, intent, metadata)
  values (
    target_couple_id,
    current_user_id,
    'decision',
    clean_surface,
    clean_intent,
    coalesce(generation_meta, '{}'::jsonb) || jsonb_build_object('decision', clean_decision)
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

grant execute on function public.apply_pet_world_decision(uuid, jsonb, jsonb) to authenticated;
