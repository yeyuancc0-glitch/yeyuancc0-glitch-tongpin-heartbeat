create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app_auth;

create table if not exists app_auth.accounts (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text not null,
  password_hash_algorithm text not null default 'argon2id',
  email_verified_at timestamptz,
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email::text = lower(email::text)),
  check (password_hash_algorithm = 'argon2id')
);

create table if not exists public.profiles (
  id uuid primary key references app_auth.accounts(id) on delete cascade,
  display_name text,
  avatar_storage_path text,
  avatar_thumbnail_storage_path text,
  birthday date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_auth.refresh_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_auth.accounts(id) on delete cascade,
  token_family_id uuid not null,
  refresh_token_hash text not null unique,
  rotated_from_session_id uuid references app_auth.refresh_sessions(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  reuse_detected_at timestamptz,
  user_agent_hash text,
  ip_prefix text,
  check (status in ('active', 'rotated', 'revoked', 'reused')),
  check (expires_at > created_at)
);

create index if not exists refresh_sessions_user_active_idx
  on app_auth.refresh_sessions(user_id, expires_at)
  where status = 'active';

create table if not exists app_auth.email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_auth.accounts(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > created_at)
);

create table if not exists app_auth.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_auth.accounts(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > created_at)
);

create table if not exists app_auth.login_attempts (
  id bigint generated always as identity primary key,
  email citext,
  ip_prefix text,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_email_created_idx
  on app_auth.login_attempts(email, created_at desc);

create index if not exists login_attempts_ip_created_idx
  on app_auth.login_attempts(ip_prefix, created_at desc);

create table if not exists app_auth.jwt_key_registry (
  id uuid primary key default gen_random_uuid(),
  key_id text not null unique,
  algorithm text not null,
  public_key_pem text not null,
  encrypted_private_key_ref text,
  status text not null default 'active',
  not_before timestamptz not null default now(),
  expires_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  check (status in ('active', 'retiring', 'retired')),
  check (algorithm in ('EdDSA', 'RS256'))
);

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active',
  relationship_started_at date,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (status in ('active', 'ended')),
  check ((status = 'active' and ended_at is null) or (status = 'ended' and ended_at is not null))
);

create table if not exists public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'partner',
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (couple_id, user_id),
  check (role in ('partner')),
  check (status in ('active', 'left')),
  check ((status = 'active' and left_at is null) or (status = 'left' and left_at is not null))
);

create unique index if not exists couple_members_one_active_couple_per_user_idx
  on public.couple_members(user_id)
  where status = 'active';

create table if not exists public.pair_invites (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  accepted_by_user_id uuid references public.profiles(id) on delete set null,
  couple_id uuid references public.couples(id) on delete set null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  check (invite_code = upper(trim(invite_code))),
  check (accepted_by_user_id is null or accepted_by_user_id <> inviter_user_id),
  check (
    (status = 'accepted' and accepted_by_user_id is not null and couple_id is not null and accepted_at is not null)
    or (status <> 'accepted')
  )
);

create index if not exists pair_invites_inviter_status_idx
  on public.pair_invites(inviter_user_id, status, created_at desc);

create index if not exists pair_invites_accepted_by_idx
  on public.pair_invites(accepted_by_user_id, created_at desc)
  where accepted_by_user_id is not null;

create or replace function public.accept_pair_invite(
  p_invite_code text,
  p_accepting_user_id uuid,
  p_relationship_started_at date default null
)
returns uuid
language plpgsql
as $$
declare
  v_invite public.pair_invites%rowtype;
  v_couple_id uuid;
begin
  select *
    into v_invite
    from public.pair_invites
   where invite_code = upper(trim(p_invite_code))
   for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite_not_pending' using errcode = 'P0001';
  end if;

  if v_invite.expires_at <= now() then
    update public.pair_invites
       set status = 'expired'
     where id = v_invite.id;
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  if v_invite.inviter_user_id = p_accepting_user_id then
    raise exception 'cannot_accept_own_invite' using errcode = 'P0001';
  end if;

  if exists (
    select 1
      from public.couple_members
     where user_id in (v_invite.inviter_user_id, p_accepting_user_id)
       and status = 'active'
     for update
  ) then
    raise exception 'active_couple_exists' using errcode = 'P0001';
  end if;

  insert into public.couples (relationship_started_at, created_by_user_id)
  values (p_relationship_started_at, v_invite.inviter_user_id)
  returning id into v_couple_id;

  insert into public.couple_members (couple_id, user_id)
  values
    (v_couple_id, v_invite.inviter_user_id),
    (v_couple_id, p_accepting_user_id);

  update public.pair_invites
     set status = 'accepted',
         accepted_by_user_id = p_accepting_user_id,
         couple_id = v_couple_id,
         accepted_at = now()
   where id = v_invite.id;

  return v_couple_id;
end;
$$;
