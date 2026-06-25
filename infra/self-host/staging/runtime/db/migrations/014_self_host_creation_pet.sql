create table if not exists public.creation_spaces (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null unique references public.couples(id) on delete cascade,
  pet_key text not null default 'cream_shorthair',
  pet_species text not null default 'cat',
  pet_name text not null default '小同频',
  pet_mood text not null default 'calm',
  pet_level integer not null default 1,
  growth_points integer not null default 0,
  fullness integer not null default 72,
  cleanliness integer not null default 76,
  affection integer not null default 68,
  energy integer not null default 80,
  boredom integer not null default 18,
  comfort integer not null default 70,
  curiosity integer not null default 60,
  current_action text not null default 'idle',
  personality_seed text not null default 'gentle',
  last_brain_tick_at timestamptz,
  last_ai_response_at timestamptz,
  last_ai_bubble text,
  last_rig_cue jsonb not null default '{}'::jsonb,
  treat_balance integer not null default 0,
  basic_food_count integer not null default 1,
  premium_food_count integer not null default 0,
  last_fed_food text,
  last_fed_at timestamptz,
  last_played_at timestamptz,
  home_theme text not null default 'cream',
  decor_slot_1 text not null default 'window',
  decor_slot_2 text not null default 'rug',
  decor_slot_3 text not null default 'plant',
  last_interaction_at timestamptz,
  last_world_decision jsonb not null default '{}'::jsonb,
  pet_world_surface text not null default 'pet_room',
  pet_world_state text not null default 'idle',
  pet_world_mood text not null default 'calm',
  pet_hidden boolean not null default false,
  pet_last_seen_at timestamptz,
  pet_last_found_at timestamptz,
  pet_last_surface_changed_at timestamptz,
  pet_sleep_started_at timestamptz,
  pet_sleep_recovered_energy integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pet_key in ('silver_tabby', 'golden_retriever', 'cream_shorthair', 'corgi')),
  check (pet_species in ('cat', 'dog')),
  check (char_length(trim(pet_name)) between 1 and 40),
  check (char_length(trim(pet_mood)) between 1 and 40),
  check (pet_level between 1 and 100),
  check (growth_points >= 0),
  check (fullness between 0 and 100),
  check (cleanliness between 0 and 100),
  check (affection between 0 and 100),
  check (energy between 0 and 100),
  check (boredom between 0 and 100),
  check (comfort between 0 and 100),
  check (curiosity between 0 and 100),
  check (current_action in ('idle', 'walk', 'eat', 'pet', 'clean', 'play', 'sleep', 'sad', 'happy')),
  check (jsonb_typeof(last_rig_cue) = 'object'),
  check (treat_balance >= 0),
  check (basic_food_count >= 0),
  check (premium_food_count >= 0),
  check (last_fed_food is null or last_fed_food in ('basic', 'premium')),
  check (jsonb_typeof(last_world_decision) = 'object'),
  check (pet_world_surface in ('home', 'share', 'memory', 'creation_hub', 'pet_room')),
  check (pet_world_state in ('idle', 'walk', 'run', 'hop', 'float', 'eat', 'pet', 'clean', 'play', 'sleep', 'sad', 'happy', 'curious', 'hide', 'peek', 'found', 'summon', 'return_home', 'inspect', 'visit_partner')),
  check (pet_world_mood in ('happy', 'curious', 'sleepy', 'lonely', 'excited', 'calm', 'hungry')),
  check (pet_sleep_recovered_energy between 0 and 100)
);

create index if not exists creation_spaces_couple_updated_idx
  on public.creation_spaces(couple_id, updated_at desc);

drop trigger if exists creation_spaces_set_updated_at on public.creation_spaces;
create trigger creation_spaces_set_updated_at
before update on public.creation_spaces
for each row execute function public.set_updated_at();

create table if not exists public.creation_actions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null,
  action_label text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (action_type in ('feed', 'pet', 'clean', 'play', 'sleep', 'rename', 'decorate', 'choose_pet', 'buy_food', 'game_reward', 'ai_brain', 'memory_update', 'footprint_add', 'footprint_update', 'footprint_delete')),
  check (char_length(trim(action_label)) between 1 and 120),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists creation_actions_couple_created_idx
  on public.creation_actions(couple_id, created_at desc);

create index if not exists creation_actions_actor_created_idx
  on public.creation_actions(actor_id, created_at desc);

create table if not exists public.pet_memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  memory_type text not null,
  memory_scope text not null default 'short',
  importance integer not null default 1,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (memory_type in ('preference', 'care_summary', 'event', 'footprint', 'online_together', 'milestone')),
  check (memory_scope in ('short', 'core')),
  check (importance between 0 and 10),
  check (char_length(trim(summary)) between 1 and 240),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists pet_memories_couple_active_created_idx
  on public.pet_memories(couple_id, created_at desc)
  where archived_at is null;

create index if not exists pet_memories_created_by_idx
  on public.pet_memories(created_by, created_at desc)
  where created_by is not null;
