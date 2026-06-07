-- Live2D cloud pet final verification hardening.
-- Keep pet compatibility views and pet-world RPCs scoped to authenticated active-couple users.

alter view if exists public.pets set (security_invoker = true);
alter view if exists public.pet_events set (security_invoker = true);

revoke all on public.pets from anon;
revoke all on public.pet_events from anon;
grant select on public.pets to authenticated;
grant select on public.pet_events to authenticated;

revoke execute on function public.ensure_creation_space(uuid) from public, anon;
revoke execute on function public.interact_creation_pet(uuid, text) from public, anon;
revoke execute on function public.update_creation_home(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.choose_creation_pet(uuid, text, text) from public, anon;
revoke execute on function public.buy_creation_food(uuid, text, integer) from public, anon;
revoke execute on function public.feed_creation_pet(uuid, text) from public, anon;
revoke execute on function public.claim_creation_footprint_reward(uuid, uuid) from public, anon;
revoke execute on function public.claim_creation_game_reward(uuid, text, boolean) from public, anon;

revoke execute on function public.archive_expired_pet_memories() from public, anon;
revoke execute on function public.prepare_pet_ai_context(uuid, text) from public, anon;
revoke execute on function public.apply_pet_ai_decision(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.apply_pet_brain_fallback(uuid, text) from public, anon;
revoke execute on function public.toggle_pet_memory_core(uuid, boolean) from public, anon;
revoke execute on function public.archive_pet_memory(uuid) from public, anon;

revoke execute on function public.apply_pet_world_decision(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.find_creation_pet(uuid, text) from public, anon;
revoke execute on function public.summon_creation_pet(uuid, text) from public, anon;
revoke execute on function public.summon_creation_pet(uuid) from public, anon;
revoke execute on function public.mark_pet_surface_seen(uuid, text) from public, anon;

grant execute on function public.ensure_creation_space(uuid) to authenticated;
grant execute on function public.interact_creation_pet(uuid, text) to authenticated;
grant execute on function public.update_creation_home(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.choose_creation_pet(uuid, text, text) to authenticated;
grant execute on function public.buy_creation_food(uuid, text, integer) to authenticated;
grant execute on function public.feed_creation_pet(uuid, text) to authenticated;
grant execute on function public.claim_creation_footprint_reward(uuid, uuid) to authenticated;
grant execute on function public.claim_creation_game_reward(uuid, text, boolean) to authenticated;

grant execute on function public.archive_expired_pet_memories() to authenticated;
grant execute on function public.prepare_pet_ai_context(uuid, text) to authenticated;
grant execute on function public.apply_pet_ai_decision(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.apply_pet_brain_fallback(uuid, text) to authenticated;
grant execute on function public.toggle_pet_memory_core(uuid, boolean) to authenticated;
grant execute on function public.archive_pet_memory(uuid) to authenticated;

grant execute on function public.apply_pet_world_decision(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.find_creation_pet(uuid, text) to authenticated;
grant execute on function public.summon_creation_pet(uuid, text) to authenticated;
grant execute on function public.summon_creation_pet(uuid) to authenticated;
grant execute on function public.mark_pet_surface_seen(uuid, text) to authenticated;

revoke execute on function public.insert_pet_memory_if_allowed(uuid, uuid, text, text, integer, text, jsonb) from public, anon, authenticated;
revoke execute on function public.record_pet_memory_from_creation_action() from public, anon, authenticated;
revoke execute on function public.record_pet_memory_from_world_event() from public, anon, authenticated;
