-- Live2D Step 0-7 uses home, share, memory, creation hub, and the pet room.
-- Legacy creation subpage values are normalized back to the room so the pet body
-- cannot be pinned to footprints/playground by old clients or old RPC paths.

create or replace function public.normalize_creation_pet_world_surface()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.pet_world_surface in ('footprints', 'playground') then
    new.pet_world_surface := 'pet_room';
    new.last_world_decision := jsonb_set(
      coalesce(new.last_world_decision, '{}'::jsonb),
      '{target_surface}',
      to_jsonb('pet_room'::text),
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists creation_spaces_normalize_pet_world_surface on public.creation_spaces;
create trigger creation_spaces_normalize_pet_world_surface
before insert or update of pet_world_surface, last_world_decision
on public.creation_spaces
for each row
execute function public.normalize_creation_pet_world_surface();

update public.creation_spaces
set
  pet_world_surface = 'pet_room',
  pet_hidden = false,
  last_world_decision = jsonb_build_object(
    'intent', 'return_home',
    'target_surface', 'pet_room',
    'mood', 'calm',
    'animation', 'return_home',
    'bubble', '我回小窝等你',
    'memory_policy', jsonb_build_object('should_write', false, 'importance', 0, 'summary', '')
  ),
  last_ai_bubble = '我回小窝等你',
  pet_last_surface_changed_at = now(),
  last_interaction_at = now()
where pet_world_surface in ('footprints', 'playground');

alter table public.creation_spaces
  drop constraint if exists creation_spaces_pet_world_surface_check,
  add constraint creation_spaces_pet_world_surface_check
  check (pet_world_surface in ('home', 'share', 'memory', 'creation_hub', 'pet_room'));

create or replace function public.summon_creation_pet(target_couple_id uuid)
returns setof public.creation_spaces
language sql
security definer
set search_path = public
as $$
  select * from public.summon_creation_pet(target_couple_id, 'pet_room');
$$;

grant execute on function public.summon_creation_pet(uuid) to authenticated;
