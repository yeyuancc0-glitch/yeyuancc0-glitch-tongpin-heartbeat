create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  birthdate date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table if not exists public.pair_invites (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  accepted_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists pair_invites_created_by_idx on public.pair_invites(created_by);
create index if not exists pair_invites_code_status_idx on public.pair_invites(code, status);

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  started_at date not null default current_date,
  anniversary_date date,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists couples_status_idx on public.couples(status);

create table if not exists public.couple_members (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (couple_id, user_id)
);

create index if not exists couple_members_user_id_idx on public.couple_members(user_id);
create index if not exists couple_members_couple_id_idx on public.couple_members(couple_id);
create unique index if not exists one_active_couple_per_user_idx
on public.couple_members(user_id)
where left_at is null;

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  checkin_date date not null,
  content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (couple_id, user_id, checkin_date)
);

drop trigger if exists checkins_set_updated_at on public.checkins;
create trigger checkins_set_updated_at
before update on public.checkins
for each row execute function public.set_updated_at();

create index if not exists checkins_couple_date_idx on public.checkins(couple_id, checkin_date desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

create index if not exists messages_couple_created_idx on public.messages(couple_id, created_at desc);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  event_date date not null,
  type text not null default 'other' check (type in ('anniversary', 'date', 'todo', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

create index if not exists calendar_events_couple_date_idx on public.calendar_events(couple_id, event_date asc);

create table if not exists public.future_letters (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  unlock_at timestamptz not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.media_files (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create or replace function public.is_active_couple_member(target_couple_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.couple_members cm
    join public.couples c on c.id = cm.couple_id
    where cm.couple_id = target_couple_id
      and cm.user_id = target_user_id
      and cm.left_at is null
      and c.status = 'active'
  );
$$;

create or replace function public.user_has_active_couple(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.couple_members cm
    join public.couples c on c.id = cm.couple_id
    where cm.user_id = target_user_id
      and cm.left_at is null
      and c.status = 'active'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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

create or replace function public.end_active_couple()
returns table (couple_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_couple_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'login_required';
  end if;

  select cm.couple_id
  into target_couple_id
  from public.couple_members cm
  join public.couples c on c.id = cm.couple_id
  where cm.user_id = current_user_id
    and cm.left_at is null
    and c.status = 'active'
  limit 1
  for update of cm;

  if target_couple_id is null then
    raise exception 'active_couple_not_found';
  end if;

  update public.couples
  set status = 'ended',
      ended_at = now()
  where id = target_couple_id;

  update public.couple_members
  set left_at = now()
  where couple_members.couple_id = target_couple_id
    and left_at is null;

  return query select target_couple_id;
end;
$$;

create or replace function public.update_active_couple_dates(relationship_started_at date)
returns table (couple_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_couple_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'login_required';
  end if;

  if relationship_started_at is null then
    raise exception 'relationship_started_at_required';
  end if;

  select cm.couple_id
  into target_couple_id
  from public.couple_members cm
  join public.couples c on c.id = cm.couple_id
  where cm.user_id = current_user_id
    and cm.left_at is null
    and c.status = 'active'
  limit 1;

  if target_couple_id is null then
    raise exception 'active_couple_not_found';
  end if;

  update public.couples
  set started_at = relationship_started_at,
      anniversary_date = relationship_started_at
  where id = target_couple_id;

  return query select target_couple_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.pair_invites enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.checkins enable row level security;
alter table public.messages enable row level security;
alter table public.calendar_events enable row level security;
alter table public.future_letters enable row level security;
alter table public.media_files enable row level security;

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

drop policy if exists "profiles select self or active partner" on public.profiles;
create policy "profiles select self or active partner"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.couple_members self_member
    join public.couple_members target_member on target_member.couple_id = self_member.couple_id
    join public.couples c on c.id = self_member.couple_id
    where self_member.user_id = auth.uid()
      and self_member.left_at is null
      and target_member.user_id = profiles.id
      and target_member.left_at is null
      and c.status = 'active'
  )
);

drop policy if exists "profiles insert self" on public.profiles;
create policy "profiles insert self"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "pair_invites select own or pending by code" on public.pair_invites;
create policy "pair_invites select own or pending by code"
on public.pair_invites for select
to authenticated
using (
  created_by = auth.uid()
  or accepted_by = auth.uid()
  or (status = 'pending' and expires_at > now())
);

drop policy if exists "pair_invites insert own pending without active couple" on public.pair_invites;
create policy "pair_invites insert own pending without active couple"
on public.pair_invites for insert
to authenticated
with check (
  created_by = auth.uid()
  and status = 'pending'
  and expires_at > now()
  and not public.user_has_active_couple(auth.uid())
);

drop policy if exists "pair_invites creator can cancel" on public.pair_invites;
create policy "pair_invites creator can cancel"
on public.pair_invites for update
to authenticated
using (created_by = auth.uid() and status = 'pending')
with check (created_by = auth.uid() and status in ('pending', 'cancelled'));

drop policy if exists "couples select active members" on public.couples;
create policy "couples select active members"
on public.couples for select
to authenticated
using (public.is_active_couple_member(id));

drop policy if exists "couple_members select same active couple" on public.couple_members;
create policy "couple_members select same active couple"
on public.couple_members for select
to authenticated
using (public.is_active_couple_member(couple_id));

drop policy if exists "checkins select active members" on public.checkins;
create policy "checkins select active members"
on public.checkins for select
to authenticated
using (public.is_active_couple_member(couple_id));

drop policy if exists "checkins insert own active couple" on public.checkins;
create policy "checkins insert own active couple"
on public.checkins for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "checkins update own active couple" on public.checkins;
create policy "checkins update own active couple"
on public.checkins for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_active_couple_member(couple_id)
)
with check (
  user_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "checkins delete own active couple" on public.checkins;
create policy "checkins delete own active couple"
on public.checkins for delete
to authenticated
using (
  user_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "messages select active members" on public.messages;
create policy "messages select active members"
on public.messages for select
to authenticated
using (public.is_active_couple_member(couple_id));

drop policy if exists "messages insert own active couple" on public.messages;
create policy "messages insert own active couple"
on public.messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "messages update own active couple" on public.messages;
create policy "messages update own active couple"
on public.messages for update
to authenticated
using (
  sender_id = auth.uid()
  and public.is_active_couple_member(couple_id)
)
with check (
  sender_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "calendar_events select active members" on public.calendar_events;
create policy "calendar_events select active members"
on public.calendar_events for select
to authenticated
using (public.is_active_couple_member(couple_id));

drop policy if exists "calendar_events insert active members" on public.calendar_events;
create policy "calendar_events insert active members"
on public.calendar_events for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_active_couple_member(couple_id)
);

drop policy if exists "calendar_events update active members" on public.calendar_events;
create policy "calendar_events update active members"
on public.calendar_events for update
to authenticated
using (public.is_active_couple_member(couple_id))
with check (public.is_active_couple_member(couple_id));

drop policy if exists "future_letters select author or unlocked active member" on public.future_letters;
create policy "future_letters select author or unlocked active member"
on public.future_letters for select
to authenticated
using (
  public.is_active_couple_member(couple_id)
  and (
    author_id = auth.uid()
    or unlock_at <= now()
  )
);

drop policy if exists "media_files select active members" on public.media_files;
create policy "media_files select active members"
on public.media_files for select
to authenticated
using (public.is_active_couple_member(couple_id));

drop policy if exists "media_files insert uploader active member" on public.media_files;
create policy "media_files insert uploader active member"
on public.media_files for insert
to authenticated
with check (
  uploader_id = auth.uid()
  and public.is_active_couple_member(couple_id)
);

grant execute on function public.accept_pair_invite(text, date) to authenticated;
grant execute on function public.end_active_couple() to authenticated;
grant execute on function public.update_active_couple_dates(date) to authenticated;
grant execute on function public.is_active_couple_member(uuid, uuid) to authenticated;
grant execute on function public.user_has_active_couple(uuid) to authenticated;
