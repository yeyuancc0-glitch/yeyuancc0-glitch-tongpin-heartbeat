create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.push_delivery_settings (
  id boolean primary key default true,
  project_url text not null,
  worker_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_delivery_settings enable row level security;
revoke all on public.push_delivery_settings from anon, authenticated;

drop policy if exists "push_delivery_settings service only" on public.push_delivery_settings;
create policy "push_delivery_settings service only"
on public.push_delivery_settings
for all
to authenticated
using (false)
with check (false);

create or replace function public.invoke_push_delivery_worker()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  project_url text;
  worker_secret text;
  pending_count integer;
  request_id bigint;
begin
  select s.project_url, s.worker_secret
  into project_url, worker_secret
  from public.push_delivery_settings s
  where s.id = true;

  select count(*)
  into pending_count
  from public.push_deliveries
  where status in ('pending', 'failed')
    and attempt_count < 3;

  if pending_count = 0 then
    return null;
  end if;

  if nullif(trim(project_url), '') is null or nullif(trim(worker_secret), '') is null then
    raise warning 'push delivery worker skipped: missing push_delivery_settings row';
    return null;
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'pending_count', pending_count,
      'requested_at', now()
    ),
    timeout_milliseconds := 5000
  )
  into request_id;

  return request_id;
end;
$$;

revoke execute on function public.invoke_push_delivery_worker() from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'push-delivery-worker'
  ) then
    perform cron.unschedule('push-delivery-worker');
  end if;

  perform cron.schedule(
    'push-delivery-worker',
    '30 seconds',
    'select public.invoke_push_delivery_worker();'
  );
end;
$$;
