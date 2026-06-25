create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (length(trim(body)) between 1 and 2000)
);

create index if not exists messages_couple_created_idx
  on public.messages(couple_id, created_at desc)
  where deleted_at is null;

create index if not exists messages_sender_created_idx
  on public.messages(sender_id, created_at desc)
  where deleted_at is null;

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
before update on public.messages
for each row execute function public.set_updated_at();
