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

type ClaimedPushDeliveryRow = Omit<PushDeliveryRow, "notification"> & {
  notification: NotificationRow | Record<string, unknown> | null;
};

type PushTokenRow = {
  id: string;
  user_id: string;
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
const maxPushTokensPerUser = 10;
const expoPushBatchSize = 100;
const webPushConcurrency = 6;
const deliveryConcurrency = 8;
const maxBodyLength = 90;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const pushDeliveryWorkerSecret = Deno.env.get("PUSH_DELIVERY_WORKER_SECRET");
const webPushVapidSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT") ?? "mailto:admin@fancah.tech";
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

  await supabase.rpc("requeue_stale_push_deliveries", {});

  const { data: deliveries, error } = await supabase.rpc("claim_push_deliveries", {
    max_count: maxDeliveriesPerRun,
  });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  const claimedDeliveries = normalizeClaimedDeliveries(deliveries as ClaimedPushDeliveryRow[] | null);
  const deliveriesNeedingTokens: PushDeliveryRow[] = [];

  await runWithConcurrency(claimedDeliveries, deliveryConcurrency, async (delivery) => {
    if (!delivery.notification) {
      await markDelivery(delivery.id, "skipped", delivery.attempt_count, "notification_missing");
      skipped += 1;
      return;
    }

    if (isDeliveryExpired(delivery)) {
      await markDelivery(delivery.id, "skipped", delivery.attempt_count, "push_delivery_expired");
      skipped += 1;
      return;
    }

    deliveriesNeedingTokens.push(delivery);
  });

  let tokensByUserId: Map<string, PushTokenRow[]>;
  try {
    tokensByUserId = await loadPushTokensByUserId(deliveriesNeedingTokens);
  } catch (error) {
    await runWithConcurrency(deliveriesNeedingTokens, deliveryConcurrency, async (delivery) => {
      await markDelivery(delivery.id, "failed", delivery.attempt_count, error instanceof Error ? error.message : "push_token_query_failed");
    });
    failed = deliveriesNeedingTokens.length;
    return jsonResponse({
      processed: claimedDeliveries.length,
      sent,
      skipped,
      failed,
      error: error instanceof Error ? error.message : "push_token_query_failed",
    }, 500);
  }

  await runWithConcurrency(deliveriesNeedingTokens, deliveryConcurrency, async (delivery) => {
    const notification = delivery.notification as NotificationRow;
    const pushTokens = tokensByUserId.get(delivery.user_id) ?? [];
    if (!pushTokens.length) {
      await markDelivery(delivery.id, "skipped", delivery.attempt_count, "no_active_push_tokens");
      skipped += 1;
      return;
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
        await supabase.rpc("mark_push_delivery_result", {
          delivery_id: delivery.id,
          next_status: "sent",
          previous_attempt_count: delivery.attempt_count,
          error_message: tokenErrors[0] ?? null,
        });
        sent += 1;
      } else {
        await markDelivery(delivery.id, "failed", delivery.attempt_count, tokenErrors[0] ?? "push_delivery_failed");
        failed += 1;
      }
    } catch (error) {
      await markDelivery(delivery.id, "failed", delivery.attempt_count, error instanceof Error ? error.message : "expo_request_failed");
      failed += 1;
    }
  });

  return jsonResponse({ processed: claimedDeliveries.length, sent, skipped, failed });
});

function normalizeClaimedDeliveries(deliveries: ClaimedPushDeliveryRow[] | null): PushDeliveryRow[] {
  return (deliveries ?? []).map((delivery) => ({
    ...delivery,
    notification: normalizeNotificationRow(delivery.notification),
  }));
}

function normalizeNotificationRow(value: ClaimedPushDeliveryRow["notification"]): NotificationRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    couple_id: typeof row.couple_id === "string" ? row.couple_id : null,
    user_id: String(row.user_id ?? ""),
    actor_id: typeof row.actor_id === "string" ? row.actor_id : null,
    type: normalizeNotificationType(row.type),
    title: String(row.title ?? ""),
    body: typeof row.body === "string" ? row.body : null,
    related_table: typeof row.related_table === "string" ? row.related_table : null,
    related_id: typeof row.related_id === "string" ? row.related_id : null,
  };
}

function normalizeNotificationType(value: unknown): NotificationRow["type"] {
  return typeof value === "string" && ["letter", "message", "checkin", "calendar_event", "system"].includes(value)
    ? value as NotificationRow["type"]
    : "system";
}

async function loadPushTokensByUserId(deliveries: PushDeliveryRow[]) {
  const userIds = Array.from(new Set(deliveries.map((delivery) => delivery.user_id).filter(Boolean)));
  if (!userIds.length) {
    return new Map<string, PushTokenRow[]>();
  }

  const { data, error } = await supabase
    .from("push_tokens")
    .select("id, user_id, token, provider, web_p256dh, web_auth")
    .in("user_id", userIds)
    .in("provider", ["expo", "web_push"])
    .eq("enabled", true)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const tokensByUserId = new Map<string, PushTokenRow[]>();
  for (const token of (data ?? []) as PushTokenRow[]) {
    const tokens = tokensByUserId.get(token.user_id) ?? [];
    if (tokens.length >= maxPushTokensPerUser) {
      continue;
    }
    tokens.push(token);
    tokensByUserId.set(token.user_id, tokens);
  }

  return tokensByUserId;
}

async function sendExpoPushMessages(messages: unknown[], pushTokens: PushTokenRow[]) {
  let sentCount = 0;
  const errors: string[] = [];
  const invalidTokenIds: string[] = [];

  for (const batch of chunkWithIndexes(messages, expoPushBatchSize)) {
    const response = await fetch(expoPushEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
      },
      body: JSON.stringify(batch.items),
    });

    const body = await response.json().catch(() => null) as { data?: ExpoTicket[]; errors?: unknown[] } | null;
    if (!response.ok) {
      errors.push(`expo_http_${response.status}`);
      continue;
    }

    const tickets = body?.data ?? [];
    tickets.forEach((ticket, batchIndex) => {
      const originalIndex = batch.startIndex + batchIndex;
      if (ticket.status === "ok") {
        sentCount += 1;
        return;
      }
      if (ticket.details?.error === "DeviceNotRegistered" && pushTokens[originalIndex]) {
        invalidTokenIds.push(pushTokens[originalIndex].id);
      }
      errors.push(ticket.message || ticket.details?.error || "expo_ticket_error");
    });
  }

  if (invalidTokenIds.length) {
    await supabase
      .from("push_tokens")
      .update({ enabled: false, revoked_at: new Date().toISOString() })
      .in("id", invalidTokenIds);
  }

  return { sentCount, errors };
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

  await runWithConcurrency(pushTokens, webPushConcurrency, async (token) => {
    if (!token.web_p256dh || !token.web_auth) {
      errors.push("web_push_subscription_incomplete");
      return;
    }

    const result = await sendWebPushMessage(token, notification, payload, deliveryWindow);
    if (result.ok) {
      sentCount += 1;
      return;
    }

    errors.push(result.error);
    if (result.revoke) {
      invalidTokenIds.push(token.id);
    }
  });

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
      body: body && !looksLikePrivateBody(body) ? body : "有一颗新的心情胶囊等你查看。",
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
      body: "打开看看这条留言。",
    };
  }

  return {
    title: notification.title,
    body: body || "同频跳动有一条新提醒。",
  };
}

function looksLikePrivateBody(value: string) {
  return value.includes("｜") || value.length > 36;
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

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async (_, workerIndex) => {
    for (let index = workerIndex; index < items.length; index += concurrency) {
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

function chunkWithIndexes<T>(items: T[], size: number) {
  const chunks: Array<{ startIndex: number; items: T[] }> = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push({ startIndex: index, items: items.slice(index, index + size) });
  }
  return chunks;
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

  return "invalid_authorization";
}

async function markDelivery(id: string, status: "skipped" | "failed", attemptCount: number, error: string) {
  await supabase.rpc("mark_push_delivery_result", {
    delivery_id: id,
    next_status: status,
    previous_attempt_count: attemptCount,
    error_message: error.slice(0, 240),
  });
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
