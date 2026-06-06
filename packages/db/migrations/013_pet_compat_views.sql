create or replace view public.pets as
select
  id,
  couple_id,
  pet_name as name,
  pet_level as level,
  greatest(0, least(100, 100 - fullness)) as hunger,
  fullness,
  pet_mood as mood,
  energy,
  affection,
  pet_key as skin,
  current_action,
  last_fed_at,
  last_played_at,
  last_interaction_at,
  created_at,
  updated_at
from public.creation_spaces;

create or replace view public.pet_events as
select
  id,
  couple_id,
  couple_id as pet_id,
  actor_id as user_id,
  action_type as type,
  action_label as label,
  metadata,
  created_at
from public.creation_actions;

grant select on public.pets to authenticated;
grant select on public.pet_events to authenticated;
