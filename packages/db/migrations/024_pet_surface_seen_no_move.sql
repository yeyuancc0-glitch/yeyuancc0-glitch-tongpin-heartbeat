-- Marking that the pet was seen must not move the pet to the user's current surface.
-- Movement is handled only by explicit world decisions, find, and summon RPCs.

create or replace function public.mark_pet_surface_seen(target_couple_id uuid, surface text)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_surface text := lower(coalesce(nullif(trim(surface), ''), 'pet_room'));
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if clean_surface not in ('home', 'share', 'memory', 'creation_hub', 'pet_room', 'footprints', 'playground') then
    raise exception 'unsupported_surface';
  end if;

  update public.creation_spaces
  set
    pet_last_seen_at = now(),
    last_interaction_at = now()
  where couple_id = target_couple_id;

  insert into public.pet_world_events (couple_id, actor_id, event_type, surface, intent)
  values (target_couple_id, current_user_id, 'surface_seen', clean_surface, 'wander');

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

grant execute on function public.mark_pet_surface_seen(uuid, text) to authenticated;
