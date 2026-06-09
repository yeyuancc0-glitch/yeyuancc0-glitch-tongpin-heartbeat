create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  couple_id uuid references public.couples(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_feedback_user_created_idx
on public.app_feedback(user_id, created_at desc);

alter table public.app_feedback enable row level security;

revoke all on public.app_feedback from anon, authenticated;
grant select on public.app_feedback to authenticated;

drop policy if exists "app_feedback select own" on public.app_feedback;
create policy "app_feedback select own"
on public.app_feedback for select
to authenticated
using (user_id = auth.uid());

create or replace function public.submit_feedback(feedback_body text, target_couple_id uuid default null, feedback_metadata jsonb default '{}'::jsonb)
returns public.app_feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_body text := left(coalesce(nullif(trim(feedback_body), ''), ''), 1000);
  clean_couple_id uuid := null;
  feedback_row public.app_feedback;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if clean_body = '' then
    raise exception 'feedback_body_required';
  end if;

  if target_couple_id is not null then
    if not public.is_active_couple_member(target_couple_id, current_user_id) then
      raise exception 'active_couple_not_found';
    end if;
    clean_couple_id := target_couple_id;
  end if;

  insert into public.app_feedback (user_id, couple_id, body, metadata)
  values (
    current_user_id,
    clean_couple_id,
    clean_body,
    case when jsonb_typeof(feedback_metadata) = 'object' then feedback_metadata else '{}'::jsonb end
  )
  returning *
  into feedback_row;

  return feedback_row;
end;
$$;

revoke execute on function public.submit_feedback(text, uuid, jsonb) from public, anon;
grant execute on function public.submit_feedback(text, uuid, jsonb) to authenticated;
