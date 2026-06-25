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

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  provider text not null default 'expo',
  device_id text,
  platform text not null default 'unknown',
  app_version text,
  web_p256dh text,
  web_auth text,
  user_agent text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, token),
  check (provider in ('expo', 'web_push')),
  check (platform in ('ios', 'android', 'web', 'unknown')),
  check (length(trim(token)) between 1 and 4096),
  check (web_p256dh is null or length(trim(web_p256dh)) between 1 and 512),
  check (web_auth is null or length(trim(web_auth)) between 1 and 512),
  check (provider <> 'web_push' or (platform = 'web' and web_p256dh is not null and web_auth is not null))
);

create index if not exists push_tokens_user_enabled_idx
  on public.push_tokens(user_id, enabled, last_seen_at desc)
  where revoked_at is null;

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error text,
  provider text,
  provider_ticket_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id),
  check (status in ('pending', 'claimed', 'sent', 'skipped', 'failed')),
  check (attempt_count >= 0)
);

drop trigger if exists push_deliveries_set_updated_at on public.push_deliveries;
create trigger push_deliveries_set_updated_at
before update on public.push_deliveries
for each row execute function public.set_updated_at();

create index if not exists push_deliveries_status_created_idx
  on public.push_deliveries(status, created_at)
  where status in ('pending', 'failed');
