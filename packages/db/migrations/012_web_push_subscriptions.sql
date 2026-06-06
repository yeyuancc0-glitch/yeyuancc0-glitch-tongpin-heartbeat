alter table public.push_tokens
drop constraint if exists push_tokens_provider_check;

alter table public.push_tokens
add constraint push_tokens_provider_check
check (provider in ('expo', 'web_push'));

alter table public.push_tokens
add column if not exists web_p256dh text,
add column if not exists web_auth text,
add column if not exists user_agent text;

create or replace function public.register_web_push_subscription(
  push_endpoint text,
  push_p256dh text,
  push_auth text,
  push_user_agent text default null
)
returns public.push_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_endpoint text := nullif(trim(push_endpoint), '');
  clean_p256dh text := nullif(trim(push_p256dh), '');
  clean_auth text := nullif(trim(push_auth), '');
  token_row public.push_tokens;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if clean_endpoint is null or clean_p256dh is null or clean_auth is null then
    raise exception 'web_push_subscription_required';
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
    web_p256dh,
    web_auth,
    user_agent,
    enabled,
    revoked_at,
    last_seen_at
  )
  values (
    current_user_id,
    clean_endpoint,
    'web_push',
    null,
    'web',
    null,
    clean_p256dh,
    clean_auth,
    nullif(trim(push_user_agent), ''),
    true,
    null,
    now()
  )
  on conflict (user_id, token) do update
  set provider = 'web_push',
      platform = 'web',
      web_p256dh = excluded.web_p256dh,
      web_auth = excluded.web_auth,
      user_agent = excluded.user_agent,
      enabled = true,
      revoked_at = null,
      last_seen_at = now()
  returning * into token_row;

  return token_row;
end;
$$;

grant execute on function public.register_web_push_subscription(text, text, text, text) to authenticated;
