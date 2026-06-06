grant usage on schema public to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.pair_invites to authenticated;
grant select on public.couples to authenticated;
grant select on public.couple_members to authenticated;
grant select, insert, update, delete on public.checkins to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;
grant select on public.future_letters to authenticated;
grant select, insert on public.media_files to authenticated;
