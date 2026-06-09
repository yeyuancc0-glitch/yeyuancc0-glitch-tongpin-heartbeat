alter table public.checkins
add column if not exists deleted_at timestamptz;

create index if not exists checkins_couple_date_active_idx
on public.checkins(couple_id, checkin_date desc)
where deleted_at is null;

alter table public.calendar_events
add column if not exists note text;

revoke delete on public.checkins from authenticated;

drop policy if exists "checkins delete own active couple" on public.checkins;
