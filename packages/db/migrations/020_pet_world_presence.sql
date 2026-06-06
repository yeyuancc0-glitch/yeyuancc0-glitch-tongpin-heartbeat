alter table public.creation_spaces
  add column if not exists last_world_decision jsonb not null default '{}'::jsonb,
  add column if not exists pet_world_surface text not null default 'pet_room',
  add column if not exists pet_world_state text not null default 'idle',
  add column if not exists pet_world_mood text not null default 'calm',
  add column if not exists pet_hidden boolean not null default false,
  add column if not exists pet_last_seen_at timestamptz,
  add column if not exists pet_last_found_at timestamptz,
  add column if not exists pet_last_surface_changed_at timestamptz;

alter table public.creation_spaces
  drop constraint if exists creation_spaces_pet_world_surface_check,
  add constraint creation_spaces_pet_world_surface_check
  check (pet_world_surface in ('home', 'share', 'memory', 'creation_hub', 'pet_room', 'footprints', 'playground'));

alter table public.creation_spaces
  drop constraint if exists creation_spaces_pet_world_state_check,
  add constraint creation_spaces_pet_world_state_check
  check (pet_world_state in ('idle', 'walk', 'run', 'hop', 'float', 'eat', 'pet', 'clean', 'play', 'sleep', 'sad', 'happy', 'curious', 'hide', 'peek', 'found', 'summon', 'return_home', 'inspect', 'visit_partner'));

alter table public.creation_spaces
  drop constraint if exists creation_spaces_pet_world_mood_check,
  add constraint creation_spaces_pet_world_mood_check
  check (pet_world_mood in ('happy', 'curious', 'sleepy', 'lonely', 'excited', 'calm', 'hungry'));

create table if not exists public.pet_world_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  surface text not null,
  intent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pet_world_events_couple_created_idx
on public.pet_world_events(couple_id, created_at desc);

alter table public.pet_world_events enable row level security;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'pet_world_events'
    ) then
    alter publication supabase_realtime add table public.pet_world_events;
  end if;
end;
$$;

revoke all on public.pet_world_events from anon, authenticated;
grant select on public.pet_world_events to authenticated;

drop policy if exists "pet_world_events select active members" on public.pet_world_events;
create policy "pet_world_events select active members"
on public.pet_world_events for select
to authenticated
using (public.is_active_couple_member(couple_id));

create or replace function public.apply_pet_world_decision(
  target_couple_id uuid,
  decision jsonb,
  generation_meta jsonb default '{}'::jsonb
)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_surface text := lower(coalesce(decision ->> 'target_surface', 'pet_room'));
  clean_intent text := lower(coalesce(decision ->> 'intent', 'wander'));
  clean_animation text := lower(coalesce(decision ->> 'animation', 'idle'));
  clean_mood text := lower(coalesce(decision ->> 'mood', 'calm'));
  clean_bubble text := left(coalesce(decision ->> 'bubble', ''), 64);
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if clean_surface not in ('home', 'share', 'memory', 'creation_hub', 'pet_room', 'footprints', 'playground') then
    raise exception 'unsupported_surface';
  end if;

  if clean_intent not in ('wander', 'hide', 'seek_attention', 'inspect_memory', 'visit_partner', 'return_home', 'rest', 'play', 'ask_food', 'comfort_user') then
    raise exception 'unsupported_intent';
  end if;

  if clean_animation not in ('idle', 'walk', 'run', 'hop', 'float', 'hide', 'peek', 'found', 'summon', 'sleep', 'happy', 'sad', 'eat', 'pet', 'clean', 'play', 'curious', 'return_home', 'inspect', 'visit_partner') then
    raise exception 'unsupported_animation';
  end if;

  if clean_mood not in ('happy', 'curious', 'sleepy', 'lonely', 'excited', 'calm', 'hungry') then
    raise exception 'unsupported_mood';
  end if;

  insert into public.creation_spaces (couple_id)
  values (target_couple_id)
  on conflict (couple_id) do nothing;

  update public.creation_spaces
  set
    last_world_decision = coalesce(decision, '{}'::jsonb),
    pet_world_surface = clean_surface,
    pet_world_state = clean_animation,
    pet_world_mood = clean_mood,
    pet_hidden = clean_intent = 'hide',
    pet_last_seen_at = case when clean_intent in ('seek_attention', 'comfort_user', 'visit_partner', 'found') then now() else pet_last_seen_at end,
    pet_last_found_at = case when clean_intent = 'found' then now() else pet_last_found_at end,
    pet_last_surface_changed_at = case when pet_world_surface is distinct from clean_surface then now() else pet_last_surface_changed_at end,
    last_ai_bubble = case when clean_bubble <> '' then clean_bubble else last_ai_bubble end,
    last_interaction_at = now(),
    last_ai_response_at = now()
  where couple_id = target_couple_id;

  insert into public.creation_actions (couple_id, actor_id, action_type, action_label, metadata)
  values (
    target_couple_id,
    current_user_id,
    'ai_brain',
    left(coalesce(clean_intent, 'world_decision'), 48),
    coalesce(generation_meta, '{}'::jsonb) || jsonb_build_object(
      'surface', clean_surface,
      'intent', clean_intent,
      'animation', clean_animation,
      'mood', clean_mood
    )
  );

  insert into public.pet_world_events (couple_id, actor_id, event_type, surface, intent, metadata)
  values (
    target_couple_id,
    current_user_id,
    'decision',
    clean_surface,
    clean_intent,
    coalesce(generation_meta, '{}'::jsonb) || jsonb_build_object('decision', coalesce(decision, '{}'::jsonb))
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

create or replace function public.find_creation_pet(target_couple_id uuid, surface text)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_surface text := lower(coalesce(nullif(trim(surface), ''), 'pet_room'));
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if clean_surface not in ('home', 'share', 'memory', 'creation_hub', 'pet_room', 'footprints', 'playground') then
    raise exception 'unsupported_surface';
  end if;

  update public.creation_spaces
  set
    pet_hidden = false,
    pet_world_surface = clean_surface,
    pet_world_state = 'found',
    pet_world_mood = 'happy',
    last_world_decision = jsonb_build_object(
      'intent', 'seek_attention',
      'target_surface', clean_surface,
      'mood', 'happy',
      'animation', 'found',
      'bubble', '你找到我啦。',
      'memory_policy', jsonb_build_object('should_write', false, 'importance', 0, 'summary', '')
    ),
    last_ai_bubble = '你找到我啦。',
    affection = greatest(0, least(100, affection + 4)),
    boredom = greatest(0, least(100, boredom - 8)),
    comfort = greatest(0, least(100, comfort + 5)),
    current_action = 'happy',
    pet_last_found_at = now(),
    pet_last_seen_at = now(),
    last_interaction_at = now()
  where couple_id = target_couple_id;

  insert into public.pet_world_events (couple_id, actor_id, event_type, surface, intent, metadata)
  values (
    target_couple_id,
    current_user_id,
    'found',
    clean_surface,
    'found',
    jsonb_build_object(
      'state_delta',
      jsonb_build_object('affection', 4, 'boredom', -8, 'comfort', 5),
      'decision',
      jsonb_build_object(
        'intent', 'seek_attention',
        'target_surface', clean_surface,
        'mood', 'happy',
        'animation', 'found',
        'bubble', '你找到我啦。'
      )
    )
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

create or replace function public.summon_creation_pet(target_couple_id uuid, surface text default 'home')
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_surface text := lower(coalesce(nullif(trim(surface), ''), 'home'));
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if clean_surface not in ('home', 'share', 'memory', 'creation_hub', 'pet_room', 'footprints', 'playground') then
    raise exception 'unsupported_surface';
  end if;

  update public.creation_spaces
  set
    pet_hidden = false,
    pet_world_state = 'summon',
    pet_world_surface = clean_surface,
    pet_world_mood = 'excited',
    last_world_decision = jsonb_build_object(
      'intent', 'seek_attention',
      'target_surface', clean_surface,
      'mood', 'excited',
      'animation', 'summon',
      'bubble', '我来啦。',
      'memory_policy', jsonb_build_object('should_write', false, 'importance', 0, 'summary', '')
    ),
    last_ai_bubble = '我来啦。',
    affection = greatest(0, least(100, affection + 1)),
    boredom = greatest(0, least(100, boredom - 3)),
    current_action = 'happy',
    pet_last_seen_at = now(),
    last_interaction_at = now()
  where couple_id = target_couple_id;

  insert into public.pet_world_events (couple_id, actor_id, event_type, surface, intent, metadata)
  values (
    target_couple_id,
    current_user_id,
    'summon',
    clean_surface,
    'summon',
    jsonb_build_object(
      'state_delta',
      jsonb_build_object('affection', 1, 'boredom', -3),
      'decision',
      jsonb_build_object(
        'intent', 'seek_attention',
        'target_surface', clean_surface,
        'mood', 'excited',
        'animation', 'summon',
        'bubble', '我来啦。'
      )
    )
  );

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

create or replace function public.summon_creation_pet(target_couple_id uuid)
returns setof public.creation_spaces
language sql
security definer
set search_path = public
as $$
  select * from public.summon_creation_pet(target_couple_id, 'home');
$$;

create or replace function public.mark_pet_surface_seen(target_couple_id uuid, surface text)
returns setof public.creation_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_surface text := lower(coalesce(nullif(trim(surface), ''), 'pet_room'));
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  if clean_surface not in ('home', 'share', 'memory', 'creation_hub', 'pet_room', 'footprints', 'playground') then
    raise exception 'unsupported_surface';
  end if;

  update public.creation_spaces
  set
    pet_world_surface = clean_surface,
    last_world_decision = jsonb_set(
      jsonb_set(coalesce(last_world_decision, '{}'::jsonb), '{target_surface}', to_jsonb(clean_surface), true),
      '{animation}',
      to_jsonb('peek'::text),
      true
    ),
    pet_last_seen_at = now(),
    last_interaction_at = now()
  where couple_id = target_couple_id;

  insert into public.pet_world_events (couple_id, actor_id, event_type, surface, intent)
  values (target_couple_id, current_user_id, 'surface_seen', clean_surface, 'wander');

  return query
  select *
  from public.creation_spaces
  where couple_id = target_couple_id;
end;
$$;

grant execute on function public.apply_pet_world_decision(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.find_creation_pet(uuid, text) to authenticated;
grant execute on function public.summon_creation_pet(uuid, text) to authenticated;
grant execute on function public.summon_creation_pet(uuid) to authenticated;
grant execute on function public.mark_pet_surface_seen(uuid, text) to authenticated;
