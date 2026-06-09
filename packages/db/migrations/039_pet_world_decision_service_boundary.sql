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
  raw_actor_user_id text := nullif(generation_meta ->> 'actor_user_id', '');
  current_user_id uuid;
  clean_generation_meta jsonb := coalesce(generation_meta, '{}'::jsonb) - 'actor_user_id';
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
  current_user_id := coalesce(
    auth.uid(),
    case
      when coalesce(auth.role(), '') = 'service_role'
        and raw_actor_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then raw_actor_user_id::uuid
      else null
    end
  );

  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
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
        'trigger_type', coalesce(clean_generation_meta ->> 'trigger', clean_generation_meta ->> 'source', clean_intent),
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
    clean_generation_meta || jsonb_build_object(
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
    clean_generation_meta || jsonb_build_object('decision', clean_decision)
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

create or replace function public.apply_pet_rule_world_decision(
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
  clean_meta jsonb := coalesce(generation_meta, '{}'::jsonb);
  clean_source text := lower(left(coalesce(nullif(trim(clean_meta ->> 'source'), ''), 'user_interaction'), 60));
  clean_trigger text := lower(left(coalesce(nullif(trim(clean_meta ->> 'trigger'), ''), 'rule'), 60));
  clean_rule_reason text := lower(left(coalesce(nullif(trim(clean_meta ->> 'rule_reason'), ''), 'manual_rule'), 80));
  rule_decision jsonb;
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

  if coalesce(clean_meta ->> 'ai_used', 'false') <> 'false'
    or clean_meta ? 'model'
    or clean_meta ? 'input_summary'
    or clean_source like 'edge_%' then
    raise exception 'ai_decision_requires_edge';
  end if;

  if clean_source not in (
    'app_open',
    'route_effect',
    'idle_tick',
    'partner_presence',
    'user_interaction',
    'ritual_rule_fallback',
    'write_letter',
    'memory_surface_trigger'
  ) then
    raise exception 'unsupported_rule_source';
  end if;

  if clean_rule_reason not in (
    'manual_rule',
    'initial_surface_seed',
    'night_wake_home_visit',
    'continuous_pet_rule',
    'continuous_feed_rule',
    'clean_home_rule',
    'sleep_home_rule',
    'hungry_return_home',
    'partner_online_rule',
    'home_visit_from_room',
    'current_surface_visit_rule',
    'recent_care_rest_rule',
    'boredom_wander_rule',
    'quiet_hide_rule',
    'autonomous_wander_rule',
    'app_open_hungry_home',
    'app_open_random_refresh',
    'ritual_rule_fallback'
  ) then
    raise exception 'unsupported_rule_reason';
  end if;

  rule_decision := jsonb_set(
    jsonb_set(
      coalesce(decision, '{}'::jsonb),
      '{state_delta}',
      '{"fullness":0,"cleanliness":0,"affection":0,"energy":0,"boredom":0,"comfort":0,"growth_points":0}'::jsonb,
      true
    ),
    '{memory_policy}',
    '{"should_write":false,"importance":0,"summary":""}'::jsonb,
    true
  );

  return query
  select *
  from public.apply_pet_world_decision(
    target_couple_id,
    rule_decision,
    (clean_meta - 'actor_user_id') || jsonb_build_object(
      'actor_user_id', current_user_id,
      'ai_used', false,
      'rule_rpc', true,
      'source', clean_source,
      'trigger', clean_trigger,
      'rule_reason', clean_rule_reason
    )
  );
end;
$$;

revoke execute on function public.apply_pet_world_decision(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_pet_world_decision(uuid, jsonb, jsonb) to service_role;

revoke execute on function public.apply_pet_rule_world_decision(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.apply_pet_rule_world_decision(uuid, jsonb, jsonb) to authenticated;
