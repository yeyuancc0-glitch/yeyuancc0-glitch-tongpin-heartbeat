import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import webpush from "npm:web-push@3.6.7";

type NotificationRow = {
  id: string;
  couple_id: string | null;
  user_id: string;
  actor_id: string | null;
  type: "letter" | "message" | "checkin" | "calendar_event" | "system";
  title: string;
  body: string | null;
  related_table: string | null;
  related_id: string | null;
};

type PushDeliveryRow = {
  id: string;
  notification_id: string;
  user_id: string;
  attempt_count: number;
  created_at: string;
  notification: NotificationRow | null;
};

type PushTokenRow = {
  id: string;
  token: string;
  provider: "expo" | "web_push";
  web_p256dh: string | null;
  web_auth: string | null;
};

type PushDeliveryWindow = {
  sentAt: string;
  expiresAt: string;
  ttlSeconds: number;
};

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

const expoPushEndpoint = "https://exp.host/--/api/v2/push/send";
const pushTtlSeconds = 60 * 5;
const maxDeliveriesPerRun = 50;
const maxBodyLength = 90;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const pushDeliveryWorkerSecret = Deno.env.get("PUSH_DELIVERY_WORKER_SECRET");
const webPushVapidSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT") ?? "mailto:admin@fanch.tech";
const webPushVapidPublicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY");
const webPushVapidPrivateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});

if (webPushVapidPublicKey && webPushVapidPrivateKey) {
  webpush.setVapidDetails(webPushVapidSubject, webPushVapidPublicKey, webPushVapidPrivateKey);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authError = await authorizeRequest(request);
  if (authError) {
    return jsonResponse({ error: authError }, 401);
  }

  const { data: deliveries, error } = await supabase
    .from("push_deliveries")
    .select(
      "id, notification_id, user_id, attempt_count, created_at, notification:notifications(id, couple_id, user_id, actor_id, type, title, body, related_table, related_id)"
    )
    .in("status", ["pending", "failed"])
    .lt("attempt_count", 3)
    .order("created_at", { ascending: true })
    .limit(maxDeliveriesPerRun);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const delivery of (deliveries ?? []) as PushDeliveryRow[]) {
    const notification = delivery.notification;
    if (!notification) {
      await markDelivery(delivery.id, "skipped", delivery.attempt_count, "notification_missing");
      skipped += 1;
      continue;
    }

    if (isDeliveryExpired(delivery)) {
      await markDelivery(delivery.id, "skipped", delivery.attempt_count, "push_delivery_expired");
      skipped += 1;
      continue;
    }

    const { data: tokens, error: tokensError } = await supabase
      .from("push_tokens")
      .select("id, token, provider, web_p256dh, web_auth")
      .eq("user_id", delivery.user_id)
      .in("provider", ["expo", "web_push"])
      .eq("enabled", true)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(10);

    if (tokensError) {
      await markDelivery(delivery.id, "failed", delivery.attempt_count, tokensError.message);
      failed += 1;
      continue;
    }

    const pushTokens = (tokens ?? []) as PushTokenRow[];
    if (!pushTokens.length) {
      await markDelivery(delivery.id, "skipped", delivery.attempt_count, "no_active_push_tokens");
      skipped += 1;
      continue;
    }

    const payload = buildPushPayload(notification);
    const deliveryWindow = buildDeliveryWindow(delivery);
    const expoTokens = pushTokens.filter((token) => token.provider === "expo");
    const webPushTokens = pushTokens.filter((token) => token.provider === "web_push");
    const expoMessages = expoTokens.map((token) => ({
      to: token.token,
      sound: "default",
      title: payload.title,
      body: payload.body,
      ttl: deliveryWindow.ttlSeconds,
      priority: "high",
      data: {
        notificationId: notification.id,
        type: notification.type,
        relatedTable: notification.related_table,
        relatedId: notification.related_id,
        sentAt: deliveryWindow.sentAt,
        expiresAt: deliveryWindow.expiresAt,
      },
    }));

    const tokenErrors: string[] = [];
    let successfulDeliveries = 0;

    try {
      if (expoMessages.length) {
        const expoResult = await sendExpoPushMessages(expoMessages, expoTokens);
        successfulDeliveries += expoResult.sentCount;
        tokenErrors.push(...expoResult.errors);
      }

      if (webPushTokens.length) {
        const webResult = await sendWebPushMessages(webPushTokens, notification, payload, deliveryWindow);
        successfulDeliveries += webResult.sentCount;
        tokenErrors.push(...webResult.errors);
      }

      if (successfulDeliveries > 0) {
        await supabase
          .from("push_deliveries")
          .update({
            status: "sent",
            attempt_count: delivery.attempt_count + 1,
            expo_ticket_id: null,
            last_error: tokenErrors[0] ?? null,
            sent_at: new Date().toISOString(),
          })
          .eq("id", delivery.id);
        sent += 1;
      } else {
        await markDelivery(delivery.id, "failed", delivery.attempt_count, tokenErrors[0] ?? "push_delivery_failed");
        failed += 1;
      }
    } catch (error) {
      await markDelivery(delivery.id, "failed", delivery.attempt_count, error instanceof Error ? error.message : "expo_request_failed");
      failed += 1;
    }
  }

  return jsonResponse({ processed: deliveries?.length ?? 0, sent, skipped, failed });
});

async function sendExpoPushMessages(messages: unknown[], pushTokens: PushTokenRow[]) {
  const response = await fetch(expoPushEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  });

  const body = await response.json().catch(() => null) as { data?: ExpoTicket[]; errors?: unknown[] } | null;
  if (!response.ok) {
    return { sentCount: 0, errors: [`expo_http_${response.status}`] };
  }

  const tickets = body?.data ?? [];
  const invalidTokenIds: string[] = [];
  const errors = tickets
    .map((ticket, index) => {
      if (ticket.status === "ok") {
        return null;
      }
      if (ticket.details?.error === "DeviceNotRegistered" && pushTokens[index]) {
        invalidTokenIds.push(pushTokens[index].id);
      }
      return ticket.message || ticket.details?.error || "expo_ticket_error";
    })
    .filter(Boolean) as string[];

  if (invalidTokenIds.length) {
    await supabase
      .from("push_tokens")
      .update({ enabled: false, revoked_at: new Date().toISOString() })
      .in("id", invalidTokenIds);
  }

  return {
    sentCount: tickets.filter((ticket) => ticket.status === "ok").length,
    errors,
  };
}

async function sendWebPushMessages(
  pushTokens: PushTokenRow[],
  notification: NotificationRow,
  payload: { title: string; body: string },
  deliveryWindow: PushDeliveryWindow
) {
  if (!webPushVapidPublicKey || !webPushVapidPrivateKey) {
    return { sentCount: 0, errors: ["missing_web_push_vapid_keys"] };
  }

  const invalidTokenIds: string[] = [];
  const errors: string[] = [];
  let sentCount = 0;

  for (const token of pushTokens) {
    if (!token.web_p256dh || !token.web_auth) {
      errors.push("web_push_subscription_incomplete");
      continue;
    }

    const result = await sendWebPushMessage(token, notification, payload, deliveryWindow);
    if (result.ok) {
      sentCount += 1;
      continue;
    }

    errors.push(result.error);
    if (result.revoke) {
      invalidTokenIds.push(token.id);
    }
  }

  if (invalidTokenIds.length) {
    await supabase
      .from("push_tokens")
      .update({ enabled: false, revoked_at: new Date().toISOString() })
      .in("id", invalidTokenIds);
  }

  return { sentCount, errors };
}

async function sendWebPushMessage(
  token: PushTokenRow,
  notification: NotificationRow,
  payload: { title: string; body: string },
  deliveryWindow: PushDeliveryWindow
): Promise<{ ok: true } | { ok: false; error: string; revoke?: boolean }> {
  try {
    await webpush.sendNotification(
      {
        endpoint: token.token,
        keys: {
          p256dh: token.web_p256dh ?? "",
          auth: token.web_auth ?? "",
        },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: "/",
        notificationId: notification.id,
        type: notification.type,
        relatedTable: notification.related_table,
        relatedId: notification.related_id,
        sentAt: deliveryWindow.sentAt,
        expiresAt: deliveryWindow.expiresAt,
      }),
      {
        TTL: deliveryWindow.ttlSeconds,
        urgency: "high",
      }
    );
    return { ok: true };
  } catch (error) {
    const statusCode = getWebPushErrorStatusCode(error);
    return {
      ok: false,
      error: statusCode ? `web_push_http_${statusCode}` : error instanceof Error ? error.message : "web_push_send_failed",
      revoke: statusCode === 404 || statusCode === 410,
    };
  }
}

function getWebPushErrorStatusCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }
  const maybeStatusCode = (error as { statusCode?: unknown; status?: unknown }).statusCode ?? (error as { status?: unknown }).status;
  return typeof maybeStatusCode === "number" ? maybeStatusCode : null;
}

function buildPushPayload(notification: NotificationRow) {
  const actor = "TA";
  const body = truncate(notification.body?.trim() || "");

  if (notification.type === "letter") {
    return {
      title: "你收到一封胶囊信",
      body: notification.title === "一封信已经寄到未来" ? "TA 把一封信寄到了未来。" : "TA 写了一封信给你，打开看看吧。",
    };
  }

  if (notification.type === "checkin") {
    return {
      title: "TA 存下了今日胶囊",
      body: body || "有一颗新的心情胶囊等你查看。",
    };
  }

  if (notification.type === "calendar_event") {
    return {
      title: "你们有一条新的记忆",
      body: body || "TA 刚刚保存了一个纪念事件。",
    };
  }

  if (notification.type === "message" && ["TA 投递了一点心情", "TA 向你投递了一点心情"].includes(notification.title)) {
    return {
      title: "TA 向你投递了一点心情",
      body: body ? `「${body}」` : "去看看这次的小互动。",
    };
  }

  if (notification.type === "message") {
    return {
      title: `${actor} 给你留了一句话`,
      body: body || "打开看看这条留言。",
    };
  }

  return {
    title: notification.title,
    body: body || "同频跳动有一条新提醒。",
  };
}

function truncate(value: string) {
  if (value.length <= maxBodyLength) {
    return value;
  }
  return `${value.slice(0, maxBodyLength - 1)}...`;
}

function buildDeliveryWindow(delivery: PushDeliveryRow): PushDeliveryWindow {
  const queuedAtMs = Date.parse(delivery.created_at);
  const sentAt = Number.isFinite(queuedAtMs) ? new Date(queuedAtMs).toISOString() : new Date().toISOString();
  const baseMs = Number.isFinite(queuedAtMs) ? queuedAtMs : Date.now();

  return {
    sentAt,
    expiresAt: new Date(baseMs + pushTtlSeconds * 1000).toISOString(),
    ttlSeconds: Math.max(1, Math.ceil((baseMs + pushTtlSeconds * 1000 - Date.now()) / 1000)),
  };
}

function isDeliveryExpired(delivery: PushDeliveryRow) {
  const queuedAtMs = Date.parse(delivery.created_at);
  if (!Number.isFinite(queuedAtMs)) {
    return false;
  }

  return Date.now() - queuedAtMs > pushTtlSeconds * 1000;
}

async function authorizeRequest(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");

  if (!token) {
    return "missing_authorization";
  }

  if (token === serviceRoleKey) {
    return null;
  }

  if (pushDeliveryWorkerSecret && token === pushDeliveryWorkerSecret) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return "invalid_authorization";
  }

  return null;
}

async function markDelivery(id: string, status: "skipped" | "failed", attemptCount: number, error: string) {
  await supabase
    .from("push_deliveries")
    .update({
      status,
      attempt_count: attemptCount + 1,
      last_error: error.slice(0, 240),
    })
    .eq("id", id);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}
