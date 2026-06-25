create table if not exists public.creation_game_reward_claims (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  puzzle_id text not null,
  reward_date date not null default current_date,
  claimed_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (couple_id, puzzle_id, reward_date),
  check (char_length(trim(puzzle_id)) between 1 and 80)
);

create index if not exists creation_game_reward_claims_claimed_by_idx
  on public.creation_game_reward_claims(claimed_by, created_at desc);
