create extension if not exists pgcrypto;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  provider text not null default 'expo' check (provider in ('expo')),
  device_id text,
  platform text not null check (platform in ('ios', 'android', 'web', 'unknown')),
  app_version text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists push_tokens_user_enabled_idx
on public.push_tokens(user_id, enabled, last_seen_at desc)
where revoked_at is null;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default true,
  message_enabled boolean not null default true,
  interaction_enabled boolean not null default true,
  checkin_enabled boolean not null default true,
  letter_enabled boolean not null default true,
  calendar_enabled boolean not null default false,
  quiet_hours_enabled boolean not null default false,
  quiet_start time not null default time '23:00',
  quiet_end time not null default time '08:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempt_count integer not null default 0,
  last_error text,
  expo_ticket_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id)
);

drop trigger if exists push_deliveries_set_updated_at on public.push_deliveries;
create trigger push_deliveries_set_updated_at
before update on public.push_deliveries
for each row execute function public.set_updated_at();

create index if not exists push_deliveries_status_created_idx
on public.push_deliveries(status, created_at)
where status in ('pending', 'failed');

alter table public.push_tokens enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_deliveries enable row level security;

grant select, insert, update on public.push_tokens to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select on public.push_deliveries to authenticated;

drop policy if exists "push_tokens select own" on public.push_tokens;
create policy "push_tokens select own"
on public.push_tokens for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "push_tokens insert own" on public.push_tokens;
create policy "push_tokens insert own"
on public.push_tokens for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "push_tokens update own" on public.push_tokens;
create policy "push_tokens update own"
on public.push_tokens for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "notification_preferences select own" on public.notification_preferences;
create policy "notification_preferences select own"
on public.notification_preferences for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "notification_preferences insert own" on public.notification_preferences;
create policy "notification_preferences insert own"
on public.notification_preferences for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "notification_preferences update own" on public.notification_preferences;
create policy "notification_preferences update own"
on public.notification_preferences for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "push_deliveries select own" on public.push_deliveries;
create policy "push_deliveries select own"
on public.push_deliveries for select
to authenticated
using (user_id = auth.uid());

create or replace function public.current_user_notification_preferences()
returns public.notification_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  preferences public.notification_preferences;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.notification_preferences (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  select *
  into preferences
  from public.notification_preferences
  where user_id = current_user_id;

  return preferences;
end;
$$;

grant execute on function public.current_user_notification_preferences() to authenticated;

create or replace function public.register_push_token(
  push_token text,
  push_platform text,
  push_device_id text default null,
  push_app_version text default null
)
returns public.push_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_token text := nullif(trim(push_token), '');
  clean_platform text := coalesce(nullif(trim(push_platform), ''), 'unknown');
  token_row public.push_tokens;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if clean_token is null then
    raise exception 'push_token_required';
  end if;

  if clean_platform not in ('ios', 'android', 'web', 'unknown') then
    clean_platform := 'unknown';
  end if;

  insert into public.notification_preferences (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  insert into public.push_tokens (
    user_id,
    token,
    provider,
    device_id,
    platform,
    app_version,
    enabled,
    revoked_at,
    last_seen_at
  )
  values (
    current_user_id,
    clean_token,
    'expo',
    nullif(trim(push_device_id), ''),
    clean_platform,
    nullif(trim(push_app_version), ''),
    true,
    null,
    now()
  )
  on conflict (user_id, token) do update
  set device_id = excluded.device_id,
      platform = excluded.platform,
      app_version = excluded.app_version,
      enabled = true,
      revoked_at = null,
      last_seen_at = now()
  returning * into token_row;

  return token_row;
end;
$$;

grant execute on function public.register_push_token(text, text, text, text) to authenticated;

create or replace function public.disable_current_push_token(push_token text)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  return query
  update public.push_tokens
  set enabled = false,
      revoked_at = now(),
      last_seen_at = now()
  where user_id = current_user_id
    and token = push_token
  returning push_tokens.id;
end;
$$;

grant execute on function public.disable_current_push_token(text) to authenticated;

create or replace function public.is_notification_push_allowed(notification_row public.notifications)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  preferences public.notification_preferences;
  body_text text := coalesce(notification_row.body, '');
  local_time time := (now() at time zone 'Asia/Shanghai')::time;
begin
  if notification_row.user_id is null then
    return false;
  end if;

  if notification_row.actor_id is null or notification_row.actor_id = notification_row.user_id then
    return false;
  end if;

  if notification_row.dismissed_at is not null then
    return false;
  end if;

  insert into public.notification_preferences (user_id)
  values (notification_row.user_id)
  on conflict (user_id) do nothing;

  select *
  into preferences
  from public.notification_preferences
  where user_id = notification_row.user_id;

  if preferences.push_enabled is not true then
    return false;
  end if;

  if preferences.quiet_hours_enabled then
    if preferences.quiet_start < preferences.quiet_end then
      if local_time >= preferences.quiet_start and local_time < preferences.quiet_end then
        return false;
      end if;
    elsif local_time >= preferences.quiet_start or local_time < preferences.quiet_end then
      return false;
    end if;
  end if;

  if notification_row.type = 'letter' then
    return preferences.letter_enabled;
  end if;

  if notification_row.type = 'checkin' then
    return preferences.checkin_enabled;
  end if;

  if notification_row.type = 'calendar_event' then
    return preferences.calendar_enabled;
  end if;

  if notification_row.type = 'message' and notification_row.title in ('TA 投递了一点心情', 'TA 向你投递了一点心情') then
    return preferences.interaction_enabled;
  end if;

  if notification_row.type = 'message' then
    return preferences.message_enabled and body_text !~ '^投递了「.*」$';
  end if;

  return false;
end;
$$;

revoke execute on function public.is_notification_push_allowed(public.notifications) from public, anon, authenticated;

create or replace function public.enqueue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_notification_push_allowed(new) then
    insert into public.push_deliveries (notification_id, user_id)
    values (new.id, new.user_id)
    on conflict (notification_id) do nothing;
  end if;

  return new;
end;
$$;

revoke execute on function public.enqueue_notification_push() from public, anon, authenticated;

drop trigger if exists notifications_enqueue_push on public.notifications;
create trigger notifications_enqueue_push
after insert on public.notifications
for each row execute function public.enqueue_notification_push();
