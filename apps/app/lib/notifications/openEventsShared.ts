export type NotificationOpenEvent = {
  notificationId?: string | null;
  type?: string | null;
  relatedTable?: string | null;
  relatedId?: string | null;
};

type Listener = (event: NotificationOpenEvent) => void;

const listeners = new Set<Listener>();

export function subscribeNotificationOpen(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyNotificationOpen(event: NotificationOpenEvent = {}) {
  listeners.forEach((listener) => listener(event));
}

export function toNotificationOpenEvent(value: unknown): NotificationOpenEvent {
  if (!value || typeof value !== "object") {
    return {};
  }
  const data = value as Record<string, unknown>;
  return {
    notificationId: nullableString(data.notificationId),
    type: nullableString(data.type),
    relatedTable: nullableString(data.relatedTable),
    relatedId: nullableString(data.relatedId),
  };
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}
