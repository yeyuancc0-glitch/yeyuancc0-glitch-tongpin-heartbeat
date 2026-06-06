create or replace function public.is_notification_push_allowed(notification_row public.notifications)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  preferences public.notification_preferences;
  body_text text := coalesce(notification_row.body, '');
  local_time time := (now() at time zone 'Asia/Shanghai')::time;
  blocked_related_tables text[] := array[
    'creation_spaces',
    'creation_actions',
    'creation_games',
    'creation_game_sessions',
    'creation_game_rewards',
    'creation_puzzles',
    'couple_footprints'
  ];
begin
  if notification_row.user_id is null then
    return false;
  end if;

  if notification_row.actor_id is null or notification_row.actor_id = notification_row.user_id then
    return false;
  end if;

  if notification_row.dismissed_at is not null then
    return false;
  end if;

  if notification_row.related_table = any(blocked_related_tables) then
    return false;
  end if;

  if notification_row.title ~ '(宠物|云宠|小屋|共创|解谜|游戏|足迹)' then
    return false;
  end if;

  insert into public.notification_preferences (user_id)
  values (notification_row.user_id)
  on conflict (user_id) do nothing;

  select *
  into preferences
  from public.notification_preferences
  where user_id = notification_row.user_id;

  if preferences.push_enabled is not true then
    return false;
  end if;

  if preferences.quiet_hours_enabled then
    if preferences.quiet_start < preferences.quiet_end then
      if local_time >= preferences.quiet_start and local_time < preferences.quiet_end then
        return false;
      end if;
    elsif local_time >= preferences.quiet_start or local_time < preferences.quiet_end then
      return false;
    end if;
  end if;

  if notification_row.type = 'letter' then
    return preferences.letter_enabled;
  end if;

  if notification_row.type = 'checkin' then
    return preferences.checkin_enabled;
  end if;

  if notification_row.type = 'calendar_event' then
    return preferences.calendar_enabled;
  end if;

  if notification_row.type = 'message' and notification_row.title in ('TA 投递了一点心情', 'TA 向你投递了一点心情') then
    return preferences.interaction_enabled;
  end if;

  if notification_row.type = 'message' then
    return preferences.message_enabled and body_text !~ '^投递了「.*」$';
  end if;

  return false;
end;
$$;

revoke execute on function public.is_notification_push_allowed(public.notifications) from public, anon, authenticated;
