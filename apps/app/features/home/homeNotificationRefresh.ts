import type { Notification } from "@/lib/supabase/database.types";

export function notificationsMatch(left: Notification[], right: Notification[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((notification, index) => {
    const next = right[index];
    return Boolean(
      next &&
        notification.id === next.id &&
        notification.read_at === next.read_at &&
        notification.dismissed_at === next.dismissed_at &&
        notification.created_at === next.created_at
    );
  });
}
