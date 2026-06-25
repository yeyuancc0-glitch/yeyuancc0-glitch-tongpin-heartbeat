import { buildSelfHostUrl, selfHostRequest } from "./apiClient";
import type { Notification } from "@/lib/supabase/database.types";

type SelfHostNotification = {
  id: string;
  coupleId: string | null;
  userId: string;
  actorId: string | null;
  type: Notification["type"];
  title: string;
  body: string | null;
  relatedTable: string | null;
  relatedId: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
};

function mapSelfHostNotification(notification: SelfHostNotification): Notification {
  return {
    id: notification.id,
    couple_id: notification.coupleId,
    user_id: notification.userId,
    actor_id: notification.actorId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    related_table: notification.relatedTable,
    related_id: notification.relatedId,
    read_at: notification.readAt,
    dismissed_at: notification.dismissedAt,
    created_at: notification.createdAt,
  };
}

export async function listSelfHostNotifications(input: {
  accessToken: string;
  coupleId: string;
  limit?: number;
}) {
  const response = await selfHostRequest<{ notifications: SelfHostNotification[] }>("/api/notifications", {
    accessToken: input.accessToken,
    query: {
      coupleId: input.coupleId,
      limit: input.limit ?? 100,
    },
  });
  return response.notifications.map(mapSelfHostNotification);
}

export async function markSelfHostNotificationRead(input: {
  accessToken: string;
  notificationId: string;
}) {
  const response = await selfHostRequest<{ notification: SelfHostNotification }>("/api/notifications/read", {
    method: "POST",
    accessToken: input.accessToken,
    body: { notificationId: input.notificationId },
  });
  return mapSelfHostNotification(response.notification);
}

export async function dismissSelfHostNotification(input: {
  accessToken: string;
  notificationId: string;
}) {
  const response = await selfHostRequest<{ notification: SelfHostNotification }>("/api/notifications/dismiss", {
    method: "POST",
    accessToken: input.accessToken,
    body: { notificationId: input.notificationId },
  });
  return mapSelfHostNotification(response.notification);
}

type NotificationStreamInput = {
  accessToken: string;
  coupleId: string;
  onNotification: (event: { notificationId: string; createdAt: string }) => void;
  onError?: (error: Error) => void;
};

function parseSseMessage(raw: string) {
  let event = "message";
  let id = "";
  const dataLines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) {
      continue;
    }
    const separator = line.indexOf(":");
    const field = separator >= 0 ? line.slice(0, separator) : line;
    const value = separator >= 0 ? line.slice(separator + 1).replace(/^ /, "") : "";
    if (field === "event") {
      event = value || "message";
    } else if (field === "id") {
      id = value;
    } else if (field === "data") {
      dataLines.push(value);
    }
  }
  return {
    event,
    id,
    data: dataLines.join("\n"),
  };
}

export function subscribeSelfHostNotificationEvents(input: NotificationStreamInput) {
  const controller = new AbortController();
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let afterCreatedAt: string | null = null;
  let afterNotificationId: string | null = null;

  const scheduleReconnect = () => {
    if (stopped) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, 5000);
  };

  const handleMessage = (raw: string) => {
    const message = parseSseMessage(raw);
    if (!message.data) {
      return;
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(message.data) as Record<string, unknown>;
    } catch {
      return;
    }
    if (message.event === "ready") {
      afterCreatedAt = typeof payload.latestCreatedAt === "string" ? payload.latestCreatedAt : afterCreatedAt;
      afterNotificationId = typeof payload.latestNotificationId === "string" ? payload.latestNotificationId : afterNotificationId;
      return;
    }
    if (message.event !== "notification") {
      return;
    }
    const notificationId = typeof payload.notificationId === "string" ? payload.notificationId : message.id;
    const createdAt = typeof payload.createdAt === "string" ? payload.createdAt : "";
    if (!notificationId || !createdAt) {
      return;
    }
    afterCreatedAt = createdAt;
    afterNotificationId = notificationId;
    input.onNotification({ notificationId, createdAt });
  };

  async function connect() {
    if (stopped) {
      return;
    }
    try {
      const response = await fetch(
        buildSelfHostUrl("/api/notifications/stream", {
          coupleId: input.coupleId,
          afterCreatedAt,
          afterNotificationId,
        }),
        {
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${input.accessToken}`,
          },
          signal: controller.signal,
        },
      );
      if (!response.ok || !response.body) {
        throw new Error(`Notification stream returned ${response.status}.`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          handleMessage(part);
        }
      }
    } catch (error) {
      const errorName = typeof error === "object" && error && "name" in error ? String(error.name) : "";
      if (!stopped && errorName !== "AbortError") {
        input.onError?.(error instanceof Error ? error : new Error("Notification stream failed."));
      }
    }
    scheduleReconnect();
  }

  void connect();

  return () => {
    stopped = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    controller.abort();
  };
}
