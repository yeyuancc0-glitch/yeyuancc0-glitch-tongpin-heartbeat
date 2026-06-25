create table if not exists public.future_letters (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '一封写给你的信',
  body text not null,
  unlock_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (author_id <> recipient_id),
  check (length(trim(title)) between 1 and 80),
  check (length(trim(body)) between 1 and 10000)
);

create index if not exists future_letters_couple_deliver_idx
  on public.future_letters(couple_id, unlock_at desc, created_at desc)
  where deleted_at is null;

create index if not exists future_letters_author_idx
  on public.future_letters(author_id, unlock_at desc)
  where deleted_at is null;

create index if not exists future_letters_recipient_idx
  on public.future_letters(recipient_id, unlock_at desc)
  where deleted_at is null;

drop trigger if exists future_letters_set_updated_at on public.future_letters;
create trigger future_letters_set_updated_at
before update on public.future_letters
for each row execute function public.set_updated_at();
