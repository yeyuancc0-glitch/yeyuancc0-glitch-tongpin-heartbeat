create or replace function public.send_quick_interaction(target_couple_id uuid, interaction_label text)
returns table (notification_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  partner_user_id uuid;
  clean_label text := nullif(trim(interaction_label), '');
  created_notification_id uuid;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if clean_label is null then
    raise exception 'interaction_label_required';
  end if;

  if not public.is_active_couple_member(target_couple_id, current_user_id) then
    raise exception 'active_couple_not_found';
  end if;

  select cm.user_id
  into partner_user_id
  from public.couple_members cm
  where cm.couple_id = target_couple_id
    and cm.user_id <> current_user_id
    and cm.left_at is null
  limit 1;

  if partner_user_id is null then
    raise exception 'partner_not_found';
  end if;

  if public.users_are_blocked(current_user_id, partner_user_id) then
    raise exception 'partner_blocked';
  end if;

  insert into public.notifications (
    couple_id,
    user_id,
    actor_id,
    type,
    title,
    body
  )
  values (
    target_couple_id,
    partner_user_id,
    current_user_id,
    'message',
    'TA 向你投递了一点心情',
    left(clean_label, 32)
  )
  returning id into created_notification_id;

  return query select created_notification_id;
end;
$$;

grant execute on function public.send_quick_interaction(uuid, text) to authenticated;
