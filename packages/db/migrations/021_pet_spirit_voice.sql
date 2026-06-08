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
  if not public.is_active_couple_member(target_couple_id, auth.uid()) then
    raise exception 'active_couple_not_found';
  end if;

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  if clean_trigger like 'feed%' then
    fallback_decision := jsonb_build_object(
      'action', 'eat',
      'mood', '我吃饱啦，想靠近你',
      'bubble', '我吃饱啦',
      'state_delta', jsonb_build_object('fullness', 4, 'cleanliness', -1, 'affection', 2, 'energy', 1, 'boredom', -4, 'comfort', 3, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'bowl', 'blink', 'normal', 'tail', 'soft', 'pose', 'sit')
    );
  elsif clean_trigger in ('pet', 'stroke', 'tap') then
    fallback_decision := jsonb_build_object(
      'action', 'pet',
      'mood', '摸摸头好舒服',
      'bubble', '再摸摸我',
      'state_delta', jsonb_build_object('fullness', -1, 'cleanliness', 0, 'affection', 3, 'energy', -1, 'boredom', -3, 'comfort', 4, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'user', 'blink', 'slow', 'tail', 'soft', 'pose', 'sit')
    );
  elsif clean_trigger = 'play' then
    fallback_decision := jsonb_build_object(
      'action', 'play',
      'mood', '还想和你玩一会儿',
      'bubble', '还想玩',
      'state_delta', jsonb_build_object('fullness', -2, 'cleanliness', -1, 'affection', 2, 'energy', -2, 'boredom', -8, 'comfort', 1, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'toy', 'blink', 'normal', 'tail', 'fast', 'pose', 'bounce')
    );
  elsif clean_trigger = 'clean' then
    fallback_decision := jsonb_build_object(
      'action', 'clean',
      'mood', '小窝干净啦，我想靠近你',
      'bubble', '小窝干净啦',
      'state_delta', jsonb_build_object('fullness', 0, 'cleanliness', 3, 'affection', 1, 'energy', -1, 'boredom', -1, 'comfort', 4, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', false, 'memory_type', 'care_summary', 'memory_scope', 'short', 'importance', 0, 'summary', ''),
      'rig_cue', jsonb_build_object('gaze', 'user', 'blink', 'normal', 'tail', 'soft', 'pose', 'stand')
    );
  elsif clean_trigger = 'footprint_add' then
    fallback_decision := jsonb_build_object(
      'action', 'happy',
      'mood', '我记住这个地方啦',
      'bubble', '我记住啦',
      'state_delta', jsonb_build_object('fullness', 0, 'cleanliness', 0, 'affection', 2, 'energy', 0, 'boredom', -2, 'comfort', 2, 'growth_points', 1),
      'memory', jsonb_build_object('should_write', true, 'memory_type', 'footprint', 'memory_scope', 'short', 'importance', 62, 'summary', '你们记录了一处新的共同足迹'),
      'rig_cue', jsonb_build_object('gaze', 'partner', 'blink', 'normal', 'tail', 'fast', 'pose', 'bounce')
    );
  else
    fallback_decision := jsonb_build_object(
      'action', 'idle',
      'mood', '我在这里等你',
      'bubble', '我在这里呀',
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
      'error_code', 'fallback_spirit',
      'duration_ms', 0,
      'input_summary', jsonb_build_object('trigger_type', clean_trigger)
    )
  );
end;
$$;

grant execute on function public.apply_pet_brain_fallback(uuid, text) to authenticated;

update public.creation_spaces
set
  pet_name = case
    when pet_name ~ '(迪灵|奶霜|银纹|小金|柚柚|云猫|云狗|猫|狗)' then '云宠'
    else pet_name
  end,
  pet_mood = case
    when pet_mood ~ '(汪|喵|小猫|小狗|猫咪|狗狗|云猫|云狗|奶霜|银纹|小金|柚柚|洗澡|擦澡|洗完澡|擦完澡|刚擦完|毛茸茸|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光|叼这句话)' then '小窝干净啦，我想靠近你'
    else pet_mood
  end,
  last_ai_bubble = case
    when last_ai_bubble ~ '(汪|喵|小猫|小狗|猫咪|狗狗|云猫|云狗|奶霜|银纹|小金|柚柚|洗澡|擦澡|洗完澡|擦完澡|刚擦完|毛茸茸|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光|叼这句话)' then '小窝干净啦'
    else last_ai_bubble
  end,
  last_world_decision = case
    when last_world_decision::text ~ '(汪|喵|小猫|小狗|猫咪|狗狗|云猫|云狗|奶霜|银纹|小金|柚柚|洗澡|擦澡|洗完澡|擦完澡|刚擦完|毛茸茸|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光|叼这句话)' then
      jsonb_set(
        coalesce(nullif(last_world_decision, '{}'::jsonb), jsonb_build_object('intent', 'wander', 'target_surface', coalesce(pet_world_surface, 'pet_room'), 'mood', coalesce(pet_world_mood, 'calm'), 'animation', coalesce(pet_world_state, 'idle'))),
        '{bubble}',
        to_jsonb('小窝干净啦'::text),
        true
      )
    else last_world_decision
  end
where
  pet_name ~ '(奶霜|银纹|小金|柚柚|云猫|云狗|猫|狗)'
  or pet_mood ~ '(汪|喵|小猫|小狗|猫咪|狗狗|云猫|云狗|奶霜|银纹|小金|柚柚|洗澡|擦澡|洗完澡|擦完澡|刚擦完|毛茸茸|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光|叼这句话)'
  or last_ai_bubble ~ '(汪|喵|小猫|小狗|猫咪|狗狗|云猫|云狗|奶霜|银纹|小金|柚柚|洗澡|擦澡|洗完澡|擦完澡|刚擦完|毛茸茸|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光|叼这句话)'
  or last_world_decision::text ~ '(汪|喵|小猫|小狗|猫咪|狗狗|云猫|云狗|奶霜|银纹|小金|柚柚|洗澡|擦澡|洗完澡|擦完澡|刚擦完|毛茸茸|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光|叼这句话)';

update public.creation_actions
set action_label = '云宠回应了「小窝干净啦」'
where action_type = 'ai_brain'
  and action_label ~ '(汪|喵|小猫|小狗|猫咪|狗狗|云猫|云狗|云宠|奶霜|银纹|小金|柚柚|洗澡|擦澡|洗完澡|擦完澡|刚擦完|毛茸茸|棉花糖|小风扇|照镜子|亮晶晶|闪闪发光|叼这句话)';
