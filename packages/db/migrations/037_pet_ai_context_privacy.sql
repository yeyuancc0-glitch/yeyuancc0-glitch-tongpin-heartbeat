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
  footprint_context jsonb := '{}'::jsonb;
  today_ai_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

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
      'metadata', metadata - 'latitude' - 'longitude' - 'note' - 'title' - 'caption' - 'body' - 'content'
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

  select jsonb_build_object(
    'count', count(*)::integer,
    'recent_months', coalesce(jsonb_agg(distinct to_char(date_trunc('month', visited_at), 'YYYY-MM')), '[]'::jsonb)
  )
  into footprint_context
  from public.couple_footprints
  where couple_id = target_couple_id
    and deleted_at is null
    and visited_at >= now() - interval '180 days';

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
    'footprints', coalesce(footprint_context, '{}'::jsonb),
    'recent_footprints', '[]'::jsonb,
    'privacy_note', 'Only low-sensitive pet state, pet actions, allowed pet memories, inventory, and footprint counts/month buckets are included. Messages, letters, capsule bodies, photos, footprint titles, captions, exact coordinates, and notes are not included.'
  );
end;
$$;

grant execute on function public.prepare_pet_ai_context(uuid, text) to authenticated;
