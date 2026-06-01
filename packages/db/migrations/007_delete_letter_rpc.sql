create or replace function public.list_letters()
returns table (
  id uuid,
  couple_id uuid,
  author_id uuid,
  recipient_id uuid,
  author_display_name text,
  title text,
  body text,
  deliver_at timestamptz,
  unlock_at timestamptz,
  is_locked boolean,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz,
  deleted_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    fl.id,
    fl.couple_id,
    fl.author_id,
    fl.recipient_id,
    p.display_name,
    fl.title,
    case
      when fl.author_id = auth.uid() or fl.unlock_at <= now() then fl.body
      else null
    end as body,
    fl.unlock_at as deliver_at,
    fl.unlock_at,
    (fl.author_id <> auth.uid() and fl.unlock_at > now()) as is_locked,
    fl.read_at,
    fl.dismissed_at,
    fl.created_at,
    fl.deleted_at
  from public.future_letters fl
  left join public.profiles p on p.id = fl.author_id
  where fl.deleted_at is null
    and fl.recipient_id is not null
    and (fl.author_id = auth.uid() or fl.recipient_id = auth.uid())
    and (fl.author_id = auth.uid() or fl.dismissed_at is null)
    and public.is_active_couple_member(fl.couple_id)
  order by fl.unlock_at desc, fl.created_at desc;
$$;

create or replace function public.delete_letter(letter_id uuid)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
begin
  update public.future_letters fl
  set deleted_at = coalesce(fl.deleted_at, now())
  where fl.id = letter_id
    and fl.author_id = auth.uid()
    and fl.deleted_at is null
    and public.is_active_couple_member(fl.couple_id);

  get diagnostics affected_count = row_count;

  if affected_count = 0 then
    update public.future_letters fl
    set dismissed_at = coalesce(fl.dismissed_at, now())
    where fl.id = letter_id
      and fl.recipient_id = auth.uid()
      and fl.deleted_at is null
      and public.is_active_couple_member(fl.couple_id);

    get diagnostics affected_count = row_count;
  end if;

  if affected_count = 0 then
    raise exception 'letter_not_found';
  end if;

  update public.notifications n
  set dismissed_at = coalesce(n.dismissed_at, now())
  where n.related_table = 'future_letters'
    and n.related_id = letter_id
    and (n.actor_id = auth.uid() or n.user_id = auth.uid());

  return query select letter_id;
end;
$$;

grant execute on function public.list_letters() to authenticated;
grant execute on function public.delete_letter(uuid) to authenticated;
