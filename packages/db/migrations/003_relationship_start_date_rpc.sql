drop function if exists public.accept_pair_invite(text);

create or replace function public.accept_pair_invite(invite_code text, relationship_started_at date default current_date)
returns table (couple_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text := upper(trim(invite_code));
  invite_row public.pair_invites%rowtype;
  new_couple_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'login_required';
  end if;

  select *
  into invite_row
  from public.pair_invites
  where code = normalized_code
  for update;

  if not found then
    raise exception 'invite_not_found';
  end if;

  if invite_row.status <> 'pending' then
    raise exception 'invite_not_pending';
  end if;

  if invite_row.expires_at <= now() then
    update public.pair_invites set status = 'expired' where id = invite_row.id;
    raise exception 'invite_expired';
  end if;

  if invite_row.created_by = current_user_id then
    raise exception 'cannot_accept_own_invite';
  end if;

  if public.user_has_active_couple(invite_row.created_by) then
    raise exception 'inviter_already_has_active_couple';
  end if;

  if public.user_has_active_couple(current_user_id) then
    raise exception 'acceptor_already_has_active_couple';
  end if;

  insert into public.couples (created_by, started_at, anniversary_date)
  values (invite_row.created_by, coalesce(relationship_started_at, current_date), coalesce(relationship_started_at, current_date))
  returning id into new_couple_id;

  insert into public.couple_members (couple_id, user_id)
  values
    (new_couple_id, invite_row.created_by),
    (new_couple_id, current_user_id);

  update public.pair_invites
  set status = 'accepted',
      accepted_by = current_user_id,
      accepted_at = now()
  where id = invite_row.id;

  return query select new_couple_id;
end;
$$;

create or replace function public.update_active_couple_dates(relationship_started_at date)
returns table (couple_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_couple_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'login_required';
  end if;

  if relationship_started_at is null then
    raise exception 'relationship_started_at_required';
  end if;

  select cm.couple_id
  into target_couple_id
  from public.couple_members cm
  join public.couples c on c.id = cm.couple_id
  where cm.user_id = current_user_id
    and cm.left_at is null
    and c.status = 'active'
  limit 1;

  if target_couple_id is null then
    raise exception 'active_couple_not_found';
  end if;

  update public.couples
  set started_at = relationship_started_at,
      anniversary_date = relationship_started_at
  where id = target_couple_id;

  return query select target_couple_id;
end;
$$;

grant execute on function public.accept_pair_invite(text, date) to authenticated;
grant execute on function public.update_active_couple_dates(date) to authenticated;
