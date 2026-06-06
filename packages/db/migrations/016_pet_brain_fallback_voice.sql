create or replace function public.apply_pet_brain_fallback(target_couple_id uuid, trigger_type text)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_trigger text := left(coalesce(nullif(trim(trigger_type), ''), 'interaction'), 40);
  pet_kind text := 'dog';
  pet_sound text := '汪';
  fallback_decision jsonb;
begin
  if not public.is_active_couple_member(target_couple_id, auth.uid()) then
    raise exception 'active_couple_not_found';
  end if;

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  select coalesce(pet_species, 'dog')
  into pet_kind
  from public.creation_spaces
  where couple_id = target_couple_id;

  pet_sound := case when pet_kind = 'cat' then '喵' else '汪' end;

  if clean_trigger like 'feed%' then
    fallback_decision := jsonb_build_object(
      'action', 'eat',
      'mood', pet_sound || '，我吃得很安心',
      'bubble', pet_sound || '，好香我吃到啦',
      'state_delta', jsonb_build_object('fullness', 4, 'cleanliness', -1, 'affection', 2, 'energy', 1, 'boredom', -4, 'comfort', 3, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'bowl', 'blink', 'normal', 'tail', 'soft', 'pose', 'sit')
    );
  elsif clean_trigger in ('pet', 'stroke', 'tap') then
    fallback_decision := jsonb_build_object(
      'action', 'pet',
      'mood', pet_sound || '，我被摸得放松了',
      'bubble', pet_sound || '，再摸摸我的头',
      'state_delta', jsonb_build_object('fullness', -1, 'cleanliness', 0, 'affection', 3, 'energy', -1, 'boredom', -3, 'comfort', 4, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'user', 'blink', 'slow', 'tail', 'soft', 'pose', 'sit')
    );
  elsif clean_trigger = 'play' then
    fallback_decision := jsonb_build_object(
      'action', 'play',
      'mood', pet_sound || '，我玩得亮起来了',
      'bubble', pet_sound || '，还想再玩一下',
      'state_delta', jsonb_build_object('fullness', -2, 'cleanliness', -1, 'affection', 2, 'energy', -2, 'boredom', -8, 'comfort', 1, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'toy', 'blink', 'normal', 'tail', 'fast', 'pose', 'bounce')
    );
  elsif clean_trigger = 'clean' then
    fallback_decision := jsonb_build_object(
      'action', 'clean',
      'mood', pet_sound || '，我的小窝亮起来了',
      'bubble', pet_sound || '，这里亮晶晶的',
      'state_delta', jsonb_build_object('fullness', 0, 'cleanliness', 3, 'affection', 1, 'energy', -1, 'boredom', -1, 'comfort', 4, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'user', 'blink', 'normal', 'tail', 'soft', 'pose', 'stand')
    );
  elsif clean_trigger = 'footprint_add' then
    fallback_decision := jsonb_build_object(
      'action', 'happy',
      'mood', pet_sound || '，我记住这处足迹啦',
      'bubble', pet_sound || '，这是你们的地方',
      'state_delta', jsonb_build_object('fullness', 0, 'cleanliness', 0, 'affection', 2, 'energy', 0, 'boredom', -2, 'comfort', 2, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', true, 'memory_type', 'footprint', 'memory_scope', 'short', 'importance', 62, 'summary', '你们记录了一处新的共同足迹'),
      'rig_cue', jsonb_build_object('gaze', 'partner', 'blink', 'normal', 'tail', 'fast', 'pose', 'bounce')
    );
  else
    fallback_decision := jsonb_build_object(
      'action', 'idle',
      'mood', pet_sound || '，我在小窝里等你',
      'bubble', pet_sound || '，我在这里等你',
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
