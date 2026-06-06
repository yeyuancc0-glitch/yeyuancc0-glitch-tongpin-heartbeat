create extension if not exists pg_net;

create or replace function public.request_push_delivery_flush()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_url text;
  worker_secret text;
  request_id bigint;
begin
  select s.project_url, s.worker_secret
  into project_url, worker_secret
  from public.push_delivery_settings s
  where s.id = true;

  if nullif(trim(project_url), '') is null or nullif(trim(worker_secret), '') is null then
    raise warning 'push delivery immediate flush skipped: missing push_delivery_settings row';
    return new;
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := jsonb_build_object(
      'source', 'push_deliveries_insert',
      'delivery_id', new.id,
      'notification_id', new.notification_id,
      'requested_at', now()
    ),
    timeout_milliseconds := 5000
  )
  into request_id;

  return new;
end;
$$;

revoke execute on function public.request_push_delivery_flush() from public, anon, authenticated;

drop trigger if exists push_deliveries_immediate_flush on public.push_deliveries;
create trigger push_deliveries_immediate_flush
after insert on public.push_deliveries
for each row execute function public.request_push_delivery_flush();
