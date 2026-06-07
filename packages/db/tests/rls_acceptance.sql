-- V0.1B RLS acceptance checklist.
--
-- Run this against a disposable Supabase project after applying all SQL files in
-- packages/db/migrations by filename order.
--
-- These tests are written as an executable checklist because Supabase auth
-- sessions are normally injected by the platform. For local SQL-only testing,
-- use Supabase's local JWT helpers or pgtap with request.jwt.claims.

-- Required actors:
-- - User A and B are one couple.
-- - User C and D are another couple.

-- 1. Unauthenticated users cannot read couple data.
-- set role anon;
-- select count(*) from public.couples;          -- expect 0
-- select count(*) from public.checkins;         -- expect 0
-- select count(*) from public.messages;         -- expect 0
-- select count(*) from public.calendar_events;  -- expect 0

-- 2. User A can read only A+B couple data.
-- set local request.jwt.claims = '{"sub":"<USER_A_UUID>","role":"authenticated"}';
-- select * from public.couples;          -- expect only A+B active couple
-- select * from public.checkins;         -- expect only A+B rows
-- select * from public.messages;         -- expect only A+B rows
-- select * from public.calendar_events;  -- expect only A+B rows

-- 3. User A cannot read C+D couple data by direct filters.
-- select * from public.checkins where couple_id = '<COUPLE_CD_UUID>';         -- expect 0
-- select * from public.messages where couple_id = '<COUPLE_CD_UUID>';         -- expect 0
-- select * from public.calendar_events where couple_id = '<COUPLE_CD_UUID>';  -- expect 0

-- 4. User A can create only under A+B couple_id.
-- insert into public.checkins (couple_id, user_id, checkin_date, content)
-- values ('<COUPLE_AB_UUID>', '<USER_A_UUID>', current_date, 'ok'); -- expect success
-- insert into public.checkins (couple_id, user_id, checkin_date, content)
-- values ('<COUPLE_CD_UUID>', '<USER_A_UUID>', current_date, 'bad'); -- expect RLS failure

-- 5. After unlinking, users cannot continue writing old couple data.
-- select * from public.end_active_couple(); -- as User A
-- insert into public.messages (couple_id, sender_id, body)
-- values ('<COUPLE_AB_UUID>', '<USER_A_UUID>', 'after end'); -- expect RLS failure

-- 6. Message author can soft-delete their own message.
-- update public.messages
-- set deleted_at = now()
-- where id = '<USER_A_MESSAGE_ID>'; -- as User A, expect success

-- 7. Non-author cannot delete the partner's message.
-- update public.messages
-- set deleted_at = now()
-- where id = '<USER_B_MESSAGE_ID>'; -- as User A, expect RLS failure

-- 8. Letters before unlock_at do not expose body through the public RPC.
-- select * from public.list_letters()
-- where id = '<LOCKED_LETTER_ID>'; -- as non-author partner before unlock, expect row with body null and is_locked true

-- 9. Immediate letters expose body to recipient.
-- select * from public.list_letters()
-- where id = '<IMMEDIATE_LETTER_ID>'; -- as recipient, expect body not null and is_locked false

-- 10. media_files require couple member access.
-- select * from public.media_files where couple_id = '<COUPLE_CD_UUID>'; -- as User A, expect 0

-- 11. profile avatars are readable only by self or active partner.
-- select * from storage.objects
-- where bucket_id = 'profile-avatars'
--   and name like '<USER_C_UUID>/%'; -- as User A, expect 0

-- 12. Non-uploaders cannot delete couple media metadata.
-- delete from public.media_files
-- where id = '<USER_B_MEDIA_ID>'; -- as User A, expect RLS failure

-- 13. Blocking ends the active couple and prevents future binding between the same users.
-- select * from public.block_partner_and_end_couple('test block'); -- as User A, expect success
-- insert into public.messages (couple_id, sender_id, body)
-- values ('<COUPLE_AB_UUID>', '<USER_A_UUID>', 'after block'); -- expect RLS failure

-- 14. Account deletion request marks the profile and ends the active couple.
-- select * from public.request_account_deletion('test request'); -- as User A, expect success
-- select account_status from public.profiles where id = '<USER_A_UUID>'; -- expect deletion_requested

-- 15. Storage must use private buckets.
-- Verify buckets `profile-avatars` and `couple-media` are private and only accessible through RLS-controlled storage policies.

-- 16. Creation space is shared only inside the active couple.
-- select * from public.ensure_creation_space('<COUPLE_AB_UUID>'); -- as User A, expect one A+B shared row
-- select * from public.creation_spaces where couple_id = '<COUPLE_CD_UUID>'; -- as User A, expect 0

-- 17. Pet state changes must go through RPC and remain scoped to the active couple.
-- select * from public.interact_creation_pet('<COUPLE_AB_UUID>', 'feed'); -- as User A, expect success and growth/fullness changes
-- select * from public.interact_creation_pet('<COUPLE_AB_UUID>', 'play'); -- as User A, expect success and energy/current_action changes
-- select * from public.interact_creation_pet('<COUPLE_CD_UUID>', 'feed'); -- as User A, expect active_couple_not_found

-- 18. Footprints support manual privacy-preserving records and author-only edits.
-- insert into public.couple_footprints (couple_id, created_by, title, note, latitude, longitude)
-- values ('<COUPLE_AB_UUID>', '<USER_A_UUID>', '只记录地点名', '坐标可为空', null, null); -- as User A, expect success
-- select * from public.claim_creation_footprint_reward('<COUPLE_AB_UUID>', '<USER_A_FOOTPRINT_ID>'); -- as User A, expect basic_food_count +1 and treat_balance +10
-- select * from public.claim_creation_footprint_reward('<COUPLE_CD_UUID>', '<USER_A_FOOTPRINT_ID>'); -- as User A, expect active_couple_not_found
-- update public.couple_footprints
-- set title = '作者更新地点名'
-- where id = '<USER_A_FOOTPRINT_ID>'; -- as User A, expect success
-- update public.couple_footprints
-- set deleted_at = now()
-- where id = '<USER_A_FOOTPRINT_ID>'; -- as User B, expect RLS failure

-- 19. Selecting a pet updates the shared creation space only for active members.
-- select * from public.choose_creation_pet('<COUPLE_AB_UUID>', 'silver_tabby', '迪灵'); -- as User A, expect success and pet_key/pet_species compatibility update
-- select * from public.choose_creation_pet('<COUPLE_CD_UUID>', 'silver_tabby', '迪灵'); -- as User A, expect active_couple_not_found

-- 20. Buying food must consume shared rewards and increase the correct inventory bucket.
-- select * from public.buy_creation_food('<COUPLE_AB_UUID>', 'basic', 1); -- as User A, expect success when treat_balance is sufficient
-- select * from public.buy_creation_food('<COUPLE_AB_UUID>', 'premium', 1); -- as User A, expect success when treat_balance is sufficient
-- select * from public.buy_creation_food('<COUPLE_CD_UUID>', 'basic', 1); -- as User A, expect active_couple_not_found

-- 21. Feeding pets must consume the selected food type through RPC.
-- select * from public.feed_creation_pet('<COUPLE_AB_UUID>', 'basic'); -- as User A, expect success and basic_food_count decrement
-- select * from public.feed_creation_pet('<COUPLE_AB_UUID>', 'premium'); -- as User A, expect success and premium_food_count decrement
-- select * from public.feed_creation_pet('<COUPLE_CD_UUID>', 'basic'); -- as User A, expect active_couple_not_found

-- 22. Puzzle rewards should be claimable only once per puzzle per day.
-- select * from public.claim_creation_game_reward('<COUPLE_AB_UUID>', 'shadow-window', true); -- as User A, expect success, premium_food_count +1 and treat_balance +15
-- select * from public.claim_creation_game_reward('<COUPLE_AB_UUID>', 'shadow-window', true); -- as User A, expect puzzle_reward_already_claimed_today
-- select * from public.claim_creation_game_reward('<COUPLE_CD_UUID>', 'shadow-window', true); -- as User A, expect active_couple_not_found

-- 23. Word-plan pet compatibility views inherit active-couple visibility.
-- select * from public.pets where couple_id = '<COUPLE_AB_UUID>'; -- as User A, expect A+B shared pet row
-- select * from public.pets where couple_id = '<COUPLE_CD_UUID>'; -- as User A, expect 0
-- select * from public.pet_events where couple_id = '<COUPLE_AB_UUID>'; -- as User A, expect A+B pet action events
-- select * from public.pet_events where couple_id = '<COUPLE_CD_UUID>'; -- as User A, expect 0

-- 24. AI pet memories and generation logs are visible only inside the active couple.
-- select * from public.pet_memories where couple_id = '<COUPLE_AB_UUID>'; -- as User A, expect A+B rows
-- select * from public.pet_memories where couple_id = '<COUPLE_CD_UUID>'; -- as User A, expect 0
-- select * from public.pet_ai_generations where couple_id = '<COUPLE_AB_UUID>'; -- as User A, expect A+B rows
-- select * from public.pet_ai_generations where couple_id = '<COUPLE_CD_UUID>'; -- as User A, expect 0

-- 25. AI context is low-sensitive and respects the 7-day memory window.
-- select public.prepare_pet_ai_context('<COUPLE_AB_UUID>', 'pet'); -- as User A, expect no messages/letters/checkin bodies/photos/coordinates
-- Insert or prepare one short memory older than 7 days and one core memory older than 7 days.
-- select public.archive_expired_pet_memories(); -- expect expired short memories archived only
-- select public.prepare_pet_ai_context('<COUPLE_AB_UUID>', 'pet') -> 'memories'; -- expect old short memory absent and old core memory present

-- 26. AI pet decisions must go through server validation.
-- select * from public.apply_pet_ai_decision(
--   '<COUPLE_AB_UUID>',
--   'pet',
--   '{"action":"happy","mood":"它轻轻贴近你","bubble":"再摸摸也可以","state_delta":{"affection":3,"comfort":3},"memory":{"should_write":true,"memory_type":"care_summary","memory_scope":"core","importance":50,"summary":"一次普通摸摸"},"rig_cue":{"gaze":"user","blink":"slow","tail":"soft","pose":"sit"}}'::jsonb,
--   '{"model":"test","fallback_used":false,"duration_ms":10,"input_summary":{"trigger_type":"pet"}}'::jsonb
-- ); -- as User A, expect success; memory is downgraded to short because core rules are not met
-- select * from public.apply_pet_ai_decision('<COUPLE_CD_UUID>', 'pet', '{}'::jsonb, '{}'::jsonb); -- as User A, expect active_couple_not_found

-- 27. Users can manually promote or demote their active-couple pet memory.
-- select * from public.toggle_pet_memory_core('<PET_MEMORY_ID>', true); -- as User A, expect memory_scope core, importance >= 95
-- select * from public.toggle_pet_memory_core('<PET_MEMORY_ID>', false); -- as User A, expect memory_scope short and expires_at restored
-- select * from public.archive_pet_memory('<PET_MEMORY_ID>'); -- as User A, expect archived_at set and row disappears from active UI query
-- select * from public.archive_pet_memory('<OTHER_COUPLE_PET_MEMORY_ID>'); -- as User A, expect active_couple_not_found

-- 28. Global pet world RPCs validate active couple membership and surface allowlists.
-- select * from public.apply_pet_world_decision(
--   '<COUPLE_AB_UUID>',
--   '{"intent":"wander","target_surface":"home","mood":"calm","animation":"walk","expression":"soft","symbol":"heart","sound_cue":"soft_chime","speech":"我在你旁边慢慢走","prop":"none","state_delta":{"affection":1},"memory_policy":{"should_write":false,"importance":0,"summary":""}}'::jsonb,
--   '{"source":"rls_acceptance"}'::jsonb
-- ); -- as User A, expect success, Step 8 world fields preserved in last_world_decision, and one pet_world_events decision row
-- select * from public.apply_pet_world_decision(
--   '<COUPLE_AB_UUID>',
--   '{"intent":"visit_partner","target_surface":"share","mood":"happy","animation":"run","expression":"happy","symbol":"letter","sound_cue":"letter","speech":"我叼着信来找你啦","prop":"letter","memory_policy":{"should_write":true,"memory_type":"milestone","memory_scope":"core","importance":98,"summary":"第一次帮你们送出一封信","dedupe_key":"first_letter_delivery"}}'::jsonb,
--   '{"source":"rls_acceptance","trigger":"letter_delivery"}'::jsonb
-- ); -- as User A, expect success and at most one core milestone memory with dedupe_key first_letter_delivery
-- select * from public.apply_pet_world_decision(
--   '<COUPLE_AB_UUID>',
--   '{"intent":"wander","target_surface":"profile","mood":"calm","animation":"walk","bubble":"","memory_policy":{"should_write":false,"importance":0,"summary":""}}'::jsonb,
--   '{}'::jsonb
-- ); -- as User A, expect unsupported_surface
-- select * from public.apply_pet_world_decision(
--   '<COUPLE_AB_UUID>',
--   '{"intent":"wander","target_surface":"footprints","mood":"calm","animation":"walk","speech":"我去足迹页看看","memory_policy":{"should_write":false,"importance":0,"summary":""}}'::jsonb,
--   '{}'::jsonb
-- ); -- as User A, expect target_surface normalized to pet_room, not footprints
-- select * from public.find_creation_pet('<COUPLE_AB_UUID>', 'memory'); -- as User A, expect success, pet_hidden false, current_action happy, affection +4, boredom -8, comfort +5, and found event metadata.state_delta
-- select * from public.find_creation_pet('<COUPLE_AB_UUID>', 'settings'); -- as User A, expect unsupported_surface
-- select * from public.mark_pet_surface_seen('<COUPLE_AB_UUID>', 'share'); -- as User A, expect success, surface_seen event, and pet_world_surface unchanged
-- select * from public.mark_pet_surface_seen('<COUPLE_AB_UUID>', 'profile'); -- as User A, expect unsupported_surface
-- select * from public.summon_creation_pet('<COUPLE_AB_UUID>', 'share'); -- as User A, expect success, current_action happy, affection +1, boredom -3, and summon event metadata.state_delta on share
-- select * from public.summon_creation_pet('<COUPLE_AB_UUID>', 'settings'); -- as User A, expect unsupported_surface
-- select * from public.apply_pet_world_decision(
--   '<COUPLE_CD_UUID>',
--   '{"intent":"wander","target_surface":"home","mood":"calm","animation":"walk","bubble":"","memory_policy":{"should_write":false,"importance":0,"summary":""}}'::jsonb,
--   '{}'::jsonb
-- ); -- as User A, expect active_couple_not_found
