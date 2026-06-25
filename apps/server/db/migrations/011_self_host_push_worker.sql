alter table public.push_deliveries
add column if not exists next_attempt_at timestamptz not null default now(),
add column if not exists claimed_at timestamptz,
add column if not exists claimed_by text;

drop index if exists push_deliveries_status_created_idx;
create index if not exists push_deliveries_claimable_idx
  on public.push_deliveries(status, next_attempt_at, created_at)
  where status in ('pending', 'failed');
