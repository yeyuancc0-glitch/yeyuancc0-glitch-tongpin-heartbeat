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
      'mood', pet_sound || case when pet_kind = 'cat' then '，我吃饱啦，想蹭蹭你' else '，我吃饱啦，想靠近你' end,
      'bubble', pet_sound || '，我吃饱啦',
      'state_delta', jsonb_build_object('fullness', 4, 'cleanliness', -1, 'affection', 2, 'energy', 1, 'boredom', -4, 'comfort', 3, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'bowl', 'blink', 'normal', 'tail', 'soft', 'pose', 'sit')
    );
  elsif clean_trigger in ('pet', 'stroke', 'tap') then
    fallback_decision := jsonb_build_object(
      'action', 'pet',
      'mood', pet_sound || '，摸摸头好舒服',
      'bubble', pet_sound || '，再摸摸我',
      'state_delta', jsonb_build_object('fullness', -1, 'cleanliness', 0, 'affection', 3, 'energy', -1, 'boredom', -3, 'comfort', 4, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'user', 'blink', 'slow', 'tail', 'soft', 'pose', 'sit')
    );
  elsif clean_trigger = 'play' then
    fallback_decision := jsonb_build_object(
      'action', 'play',
      'mood', pet_sound || '，还想和你玩一会儿',
      'bubble', pet_sound || '，还想玩',
      'state_delta', jsonb_build_object('fullness', -2, 'cleanliness', -1, 'affection', 2, 'energy', -2, 'boredom', -8, 'comfort', 1, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'toy', 'blink', 'normal', 'tail', 'fast', 'pose', 'bounce')
    );
  elsif clean_trigger = 'clean' then
    fallback_decision := jsonb_build_object(
      'action', 'clean',
      'mood', pet_sound || case when pet_kind = 'cat' then '，小窝干净啦，我想蹭蹭你' else '，小窝干净啦，我想靠近你' end,
      'bubble', pet_sound || '，小窝干净啦',
      'state_delta', jsonb_build_object('fullness', 0, 'cleanliness', 3, 'affection', 1, 'energy', -1, 'boredom', -1, 'comfort', 4, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'user', 'blink', 'normal', 'tail', 'soft', 'pose', 'stand')
    );
  elsif clean_trigger = 'footprint_add' then
    fallback_decision := jsonb_build_object(
      'action', 'happy',
      'mood', pet_sound || '，我记住这个地方啦',
      'bubble', pet_sound || '，我记住啦',
      'state_delta', jsonb_build_object('fullness', 0, 'cleanliness', 0, 'affection', 2, 'energy', 0, 'boredom', -2, 'comfort', 2, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', true, 'memory_type', 'footprint', 'memory_scope', 'short', 'importance', 62, 'summary', '你们记录了一处新的共同足迹'),
      'rig_cue', jsonb_build_object('gaze', 'partner', 'blink', 'normal', 'tail', 'fast', 'pose', 'bounce')
    );
  else
    fallback_decision := jsonb_build_object(
      'action', 'idle',
      'mood', pet_sound || '，我在这里等你',
      'bubble', pet_sound || '，我在这里呀',
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

update public.creation_spaces
set
  pet_mood = case
    when pet_species = 'cat' then '喵，小窝干净啦，我想蹭蹭你'
    else '汪，小窝干净啦，我想靠近你'
  end,
  last_ai_bubble = case
    when pet_species = 'cat' then '喵，小窝干净啦'
    else '汪，小窝干净啦'
  end
where
  pet_mood ~ '(洗澡|擦澡|洗完澡|擦完澡|刚擦完|毛茸茸|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光|叼这句话)'
  or last_ai_bubble ~ '(洗澡|擦澡|洗完澡|擦完澡|刚擦完|毛茸茸|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光|叼这句话)';

update public.creation_actions
set action_label = '云宠回应了「小窝干净啦」'
where action_type = 'ai_brain'
  and action_label ~ '(洗澡|擦澡|洗完澡|擦完澡|刚擦完|毛茸茸|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光|叼这句话)';
