# RLS Policies

`packages/db/migrations/001_v01a_schema.sql` contains the first V0.1A schema and RLS policies.

Core rule:

- Public app clients never create `couples` or `couple_members` directly.
- Pairing must call `public.accept_pair_invite(invite_code text, relationship_started_at date)`.
- Couple-scoped reads and writes must pass `public.is_active_couple_member(couple_id)`.
- Ended couples are no longer writable because active member checks require `couples.status = 'active'` and `couple_members.left_at is null`.

Storage policy for V0.1B:

- Use private buckets for couple media.
- Store every object path in `media_files`.
- Gate object access by checking the owning `media_files.couple_id` against active membership.
