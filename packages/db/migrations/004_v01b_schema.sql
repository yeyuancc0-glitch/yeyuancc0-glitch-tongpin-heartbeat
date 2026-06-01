create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-avatars', 'profile-avatars', false, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('couple-media', 'couple-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.profiles
add column if not exists account_status text not null default 'active',
add column if not exists deletion_requested_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_account_status_check'
  ) then
    alter table public.profiles
    add constraint profiles_account_status_check
    check (account_status in ('active', 'deletion_requested', 'frozen'));
  end if;
end;
$$;

alter table public.future_letters
add column if not exists title text not null default '一封写给你的信',
add column if not exists recipient_id uuid references public.profiles(id) on delete cascade,
add column if not exists read_at timestamptz,
add column if not exists dismissed_at timestamptz,
add column if not exists updated_at timestamptz not null default now();

drop trigger if exists future_letters_set_updated_at on public.future_letters;
create trigger future_letters_set_updated_at
before update on public.future_letters
for each row execute function public.set_updated_at();

create index if not exists future_letters_couple_deliver_idx
on public.future_letters(couple_id, unlock_at desc)
where deleted_at is null;

create index if not exists future_letters_recipient_idx
on public.future_letters(recipient_id, unlock_at desc)
where deleted_at is null;

alter table public.media_files
add column if not exists caption text,
add column if not exists updated_at timestamptz not null default now();

drop trigger if exists media_files_set_updated_at on public.media_files;
create trigger media_files_set_updated_at
before update on public.media_files
for each row execute function public.set_updated_at();

create index if not exists media_files_couple_created_idx
on public.media_files(couple_id, created_at desc)
where deleted_at is null;

create table if not exists public.mood_status (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mood text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (couple_id, user_id)
);

drop trigger if exists mood_status_set_updated_at on public.mood_status;
create trigger mood_status_set_updated_at
before update on public.mood_status
for each row execute function public.set_updated_at();

create index if not exists mood_status_couple_idx on public.mood_status(couple_id, updated_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('letter', 'message', 'checkin', 'calendar_event', 'system')),
  title text not null,
  body text,
  related_table text,
  related_id uuid,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
on public.notifications(user_id, created_at desc)
where dismissed_at is null;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete set null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists reports_reporter_created_idx on public.reports(reporter_id, created_at desc);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  couple_id uuid references public.couples(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_user_id)
);

create index if not exists blocks_blocked_user_idx on public.blocks(blocked_user_id);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  status text not null default 'requested' check (status in ('requested', 'processing', 'cancelled', 'completed')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, status)
);

alter table public.mood_status enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.account_deletion_requests enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.media_files to authenticated;
revoke select on public.future_letters from authenticated;
grant insert, update, delete on public.future_letters to authenticated;
grant select, insert, update on public.mood_status to authenticated;
grant select, insert, update on public.notifications to authenticated;
grant select, insert on public.reports to authenticated;
grant select, insert on public.blocks to authenticated;
grant select, insert on public.account_deletion_requests to authenticated;

create or replace function public.active_partner_id(target_couple_id uuid, target_user_id uuid default auth.uid())
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select partner.user_id
  from public.couple_members self_member
  join public.couple_members partner on partner.couple_id = self_member.couple_id
  join public.couples c on c.id = self_member.couple_id
  where self_member.couple_id = target_couple_id
    and self_member.user_id = target_user_id
    and self_member.left_at is null
    and partner.user_id <> target_user_id
    and partner.left_at is null
    and c.status = 'active'
  limit 1;
$$;

create or replace function public.users_are_blocked(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.blocks b
    where (b.blocker_id = user_a and b.blocked_user_id = user_b)
       or (b.blocker_id = user_b and b.blocked_user_id = user_a)
  );
$$;

drop policy if exists "future_letters select author or unlocked active member" on public.future_letters;
drop policy if exists "future_letters insert own active couple" on public.future_letters;
create policy "future_letters insert own active couple"
on public.future_letters for insert
to authenticated
with check (
  author_id = auth.uid()
  and recipient_id is not null
  and recipient_id <> auth.uid()
  and public.is_active_couple_member(couple_id)
  and public.is_active_couple_member(couple_id, recipient_id)
);

drop policy if exists "future_letters update author active couple" on public.future_letters;
create policy "future_letters update author active couple"
on public.future_letters for update
to authenticated
using (
  author_id = auth.uid()
  and public.is_active_couple_member(couple_id)
)
with check (
  author_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "future_letters delete author active couple" on public.future_letters;
create policy "future_letters delete author active couple"
on public.future_letters for delete
to authenticated
using (
  author_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "media_files select active members" on public.media_files;
create policy "media_files select active members"
on public.media_files for select
to authenticated
using (
  deleted_at is null
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "media_files insert uploader active member" on public.media_files;
create policy "media_files insert uploader active member"
on public.media_files for insert
to authenticated
with check (
  uploader_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "media_files update uploader active member" on public.media_files;
create policy "media_files update uploader active member"
on public.media_files for update
to authenticated
using (
  uploader_id = auth.uid()
  and public.is_active_couple_member(couple_id)
)
with check (
  uploader_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "media_files delete uploader active member" on public.media_files;
create policy "media_files delete uploader active member"
on public.media_files for delete
to authenticated
using (
  uploader_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "mood_status select active members" on public.mood_status;
create policy "mood_status select active members"
on public.mood_status for select
to authenticated
using (public.is_active_couple_member(couple_id));

drop policy if exists "mood_status insert own active couple" on public.mood_status;
create policy "mood_status insert own active couple"
on public.mood_status for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "mood_status update own active couple" on public.mood_status;
create policy "mood_status update own active couple"
on public.mood_status for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_active_couple_member(couple_id)
)
with check (
  user_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "notifications select own" on public.notifications;
create policy "notifications select own"
on public.notifications for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "notifications insert active couple recipient" on public.notifications;
create policy "notifications insert active couple recipient"
on public.notifications for insert
to authenticated
with check (
  actor_id = auth.uid()
  and (
    user_id = auth.uid()
    or (
      couple_id is not null
      and public.is_active_couple_member(couple_id)
      and public.is_active_couple_member(couple_id, user_id)
    )
  )
);

drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "reports select own" on public.reports;
create policy "reports select own"
on public.reports for select
to authenticated
using (reporter_id = auth.uid());

drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own"
on public.reports for insert
to authenticated
with check (
  reporter_id = auth.uid()
  and (
    couple_id is null
    or public.is_active_couple_member(couple_id)
  )
);

drop policy if exists "blocks select own" on public.blocks;
create policy "blocks select own"
on public.blocks for select
to authenticated
using (blocker_id = auth.uid() or blocked_user_id = auth.uid());

drop policy if exists "blocks insert own" on public.blocks;
create policy "blocks insert own"
on public.blocks for insert
to authenticated
with check (
  blocker_id = auth.uid()
  and blocked_user_id <> auth.uid()
);

drop policy if exists "account_deletion_requests select own" on public.account_deletion_requests;
create policy "account_deletion_requests select own"
on public.account_deletion_requests for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "account_deletion_requests insert own" on public.account_deletion_requests;
create policy "account_deletion_requests insert own"
on public.account_deletion_requests for insert
to authenticated
with check (user_id = auth.uid());

create or replace function public.list_letters()
returns table (
  id uuid,
  couple_id uuid,
  author_id uuid,
  recipient_id uuid,
  author_display_name text,
  title text,
  body text,
  deliver_at timestamptz,
  unlock_at timestamptz,
  is_locked boolean,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz,
  deleted_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    fl.id,
    fl.couple_id,
    fl.author_id,
    fl.recipient_id,
    p.display_name,
    fl.title,
    case
      when fl.author_id = auth.uid() or fl.unlock_at <= now() then fl.body
      else null
    end as body,
    fl.unlock_at as deliver_at,
    fl.unlock_at,
    (fl.author_id <> auth.uid() and fl.unlock_at > now()) as is_locked,
    fl.read_at,
    fl.dismissed_at,
    fl.created_at,
    fl.deleted_at
  from public.future_letters fl
  left join public.profiles p on p.id = fl.author_id
  where fl.deleted_at is null
    and fl.recipient_id is not null
    and (fl.author_id = auth.uid() or fl.recipient_id = auth.uid())
    and public.is_active_couple_member(fl.couple_id)
  order by fl.unlock_at desc, fl.created_at desc;
$$;

create or replace function public.mark_letter_read(letter_id uuid)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.future_letters fl
  set read_at = coalesce(fl.read_at, now())
  where fl.id = letter_id
    and fl.recipient_id = auth.uid()
    and fl.unlock_at <= now()
    and fl.deleted_at is null
    and public.is_active_couple_member(fl.couple_id);

  if not found then
    raise exception 'letter_not_readable';
  end if;

  return query select letter_id;
end;
$$;

create or replace function public.dismiss_letter(letter_id uuid)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.future_letters fl
  set dismissed_at = coalesce(fl.dismissed_at, now())
  where fl.id = letter_id
    and fl.recipient_id = auth.uid()
    and fl.deleted_at is null
    and public.is_active_couple_member(fl.couple_id);

  if not found then
    raise exception 'letter_not_found';
  end if;

  return query select letter_id;
end;
$$;

create or replace function public.mark_notification_read(notification_id uuid)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.id = notification_id
    and n.user_id = auth.uid();

  if not found then
    raise exception 'notification_not_found';
  end if;

  return query select notification_id;
end;
$$;

create or replace function public.dismiss_notification(notification_id uuid)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications n
  set dismissed_at = coalesce(n.dismissed_at, now())
  where n.id = notification_id
    and n.user_id = auth.uid();

  if not found then
    raise exception 'notification_not_found';
  end if;

  return query select notification_id;
end;
$$;

create or replace function public.block_partner_and_end_couple(reason text default null)
returns table (couple_id uuid, blocked_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_couple_id uuid;
  partner_user_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'login_required';
  end if;

  select cm.couple_id, public.active_partner_id(cm.couple_id, current_user_id)
  into target_couple_id, partner_user_id
  from public.couple_members cm
  join public.couples c on c.id = cm.couple_id
  where cm.user_id = current_user_id
    and cm.left_at is null
    and c.status = 'active'
  limit 1
  for update of cm;

  if target_couple_id is null or partner_user_id is null then
    raise exception 'active_partner_not_found';
  end if;

  insert into public.blocks (blocker_id, blocked_user_id, couple_id, reason)
  values (current_user_id, partner_user_id, target_couple_id, nullif(trim(reason), ''))
  on conflict (blocker_id, blocked_user_id) do update
  set reason = excluded.reason,
      couple_id = excluded.couple_id,
      created_at = now();

  update public.couples
  set status = 'ended',
      ended_at = now()
  where id = target_couple_id;

  update public.couple_members
  set left_at = now()
  where couple_members.couple_id = target_couple_id
    and left_at is null;

  return query select target_couple_id, partner_user_id;
end;
$$;

create or replace function public.request_account_deletion(reason text default null)
returns table (request_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_request_id uuid;
  target_couple_id uuid;
begin
  if current_user_id is null then
    raise exception 'login_required';
  end if;

  insert into public.account_deletion_requests (user_id, reason)
  values (current_user_id, nullif(trim(reason), ''))
  on conflict (user_id, status) do update
  set reason = excluded.reason,
      requested_at = now()
  returning id into new_request_id;

  update public.profiles
  set account_status = 'deletion_requested',
      deletion_requested_at = now()
  where id = current_user_id;

  select cm.couple_id
  into target_couple_id
  from public.couple_members cm
  join public.couples c on c.id = cm.couple_id
  where cm.user_id = current_user_id
    and cm.left_at is null
    and c.status = 'active'
  limit 1;

  if target_couple_id is not null then
    update public.couples
    set status = 'ended',
        ended_at = now()
    where id = target_couple_id;

    update public.couple_members
    set left_at = now()
    where couple_members.couple_id = target_couple_id
      and left_at is null;
  end if;

  return query select new_request_id;
end;
$$;

drop function if exists public.accept_pair_invite(text);

create or replace function public.accept_pair_invite(invite_code text, relationship_started_at date default current_date)
returns table (couple_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text := upper(trim(invite_code));
  invite_row public.pair_invites%rowtype;
  new_couple_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'login_required';
  end if;

  select *
  into invite_row
  from public.pair_invites
  where code = normalized_code
  for update;

  if not found then
    raise exception 'invite_not_found';
  end if;

  if invite_row.status <> 'pending' then
    raise exception 'invite_not_pending';
  end if;

  if invite_row.expires_at <= now() then
    update public.pair_invites set status = 'expired' where id = invite_row.id;
    raise exception 'invite_expired';
  end if;

  if invite_row.created_by = current_user_id then
    raise exception 'cannot_accept_own_invite';
  end if;

  if public.users_are_blocked(invite_row.created_by, current_user_id) then
    raise exception 'pair_blocked';
  end if;

  if public.user_has_active_couple(invite_row.created_by) then
    raise exception 'inviter_already_has_active_couple';
  end if;

  if public.user_has_active_couple(current_user_id) then
    raise exception 'acceptor_already_has_active_couple';
  end if;

  insert into public.couples (created_by, started_at, anniversary_date)
  values (invite_row.created_by, coalesce(relationship_started_at, current_date), coalesce(relationship_started_at, current_date))
  returning id into new_couple_id;

  insert into public.couple_members (couple_id, user_id)
  values
    (new_couple_id, invite_row.created_by),
    (new_couple_id, current_user_id);

  update public.pair_invites
  set status = 'accepted',
      accepted_by = current_user_id,
      accepted_at = now()
  where id = invite_row.id;

  return query select new_couple_id;
end;
$$;

drop policy if exists "profile avatars read self or active partner" on storage.objects;
create policy "profile avatars read self or active partner"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or exists (
      select 1
      from public.profiles p
      join public.couple_members target_member on target_member.user_id = p.id
      join public.couple_members self_member on self_member.couple_id = target_member.couple_id
      join public.couples c on c.id = self_member.couple_id
      where p.id::text = split_part(storage.objects.name, '/', 1)
        and p.avatar_url = storage.objects.name
        and self_member.user_id = auth.uid()
        and self_member.left_at is null
        and target_member.left_at is null
        and c.status = 'active'
    )
  )
);

drop policy if exists "profile avatars insert own folder" on storage.objects;
create policy "profile avatars insert own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile avatars delete own folder" on storage.objects;
create policy "profile avatars delete own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "couple media read active members" on storage.objects;
create policy "couple media read active members"
on storage.objects for select
to authenticated
using (
  bucket_id = 'couple-media'
  and exists (
    select 1
    from public.media_files mf
    where mf.storage_path = storage.objects.name
      and mf.deleted_at is null
      and public.is_active_couple_member(mf.couple_id)
  )
);

drop policy if exists "couple media insert active member folder" on storage.objects;
create policy "couple media insert active member folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'couple-media'
  and split_part(name, '/', 2) = auth.uid()::text
  and exists (
    select 1
    from public.couple_members cm
    join public.couples c on c.id = cm.couple_id
    where c.id::text = split_part(storage.objects.name, '/', 1)
      and cm.user_id = auth.uid()
      and cm.left_at is null
      and c.status = 'active'
  )
);

drop policy if exists "couple media delete uploader object" on storage.objects;
create policy "couple media delete uploader object"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'couple-media'
  and exists (
    select 1
    from public.media_files mf
    where mf.storage_path = storage.objects.name
      and mf.uploader_id = auth.uid()
      and public.is_active_couple_member(mf.couple_id)
  )
);

grant execute on function public.active_partner_id(uuid, uuid) to authenticated;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;
grant execute on function public.list_letters() to authenticated;
grant execute on function public.mark_letter_read(uuid) to authenticated;
grant execute on function public.dismiss_letter(uuid) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.dismiss_notification(uuid) to authenticated;
grant execute on function public.block_partner_and_end_couple(text) to authenticated;
grant execute on function public.request_account_deletion(text) to authenticated;
grant execute on function public.accept_pair_invite(text, date) to authenticated;
