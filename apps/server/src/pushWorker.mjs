import os from "node:os";

import webpush from "web-push";

import { loadConfig } from "./config.mjs";
import { createDbPool } from "./db.mjs";

const expoPushBatchSize = 100;
const webPushConcurrency = 6;
const maxBodyLength = 90;
const workerId = `${os.hostname()}-${process.pid}`;

const config = loadConfig();
const pool = createDbPool(config);

if (config.push.vapidPublicKey && config.push.vapidPrivateKey) {
  webpush.setVapidDetails(config.push.vapidSubject, config.push.vapidPublicKey, config.push.vapidPrivateKey);
}

async function main() {
  if (!config.push.workerEnabled) {
    console.log({ event: "push_worker_disabled" });
    return;
  }

  console.log({
    event: "push_worker_started",
    environment: config.apiEnv,
    intervalMs: config.push.workerIntervalMs,
    workerId,
  });

  let stopping = false;
  const stop = async (signal) => {
    if (stopping) {
      return;
    }
    stopping = true;
    console.log({ event: "push_worker_shutdown_started", signal });
    await pool.end();
    console.log({ event: "push_worker_shutdown_complete" });
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));

  while (!stopping) {
    try {
      await processOnce();
    } catch (error) {
      console.error({
        event: "push_worker_run_failed",
        message: error instanceof Error ? error.message : "unknown push worker error",
      });
    }

    if (process.env.PUSH_WORKER_RUN_ONCE === "true") {
      break;
    }
    await sleep(config.push.workerIntervalMs);
  }

  await pool.end();
}

async function processOnce() {
  await requeueStaleClaims();
  const deliveries = await claimDeliveries();
  if (!deliveries.length) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const tokensByUserId = await loadPushTokensByUserId(deliveries);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    if (!delivery.notification) {
      await markDelivery(delivery, "skipped", "notification_missing");
      skipped += 1;
      continue;
    }

    if (isDeliveryExpired(delivery)) {
      await markDelivery(delivery, "skipped", "push_delivery_expired");
      skipped += 1;
      continue;
    }

    const pushTokens = tokensByUserId.get(delivery.userId) ?? [];
    if (!pushTokens.length) {
      await markDelivery(delivery, "skipped", "no_active_push_tokens");
      skipped += 1;
      continue;
    }

    const payload = buildPushPayload(delivery.notification);
    const deliveryWindow = buildDeliveryWindow(delivery);
    const expoTokens = pushTokens.filter((token) => token.provider === "expo");
    const webPushTokens = pushTokens.filter((token) => token.provider === "web_push");
    const errors = [];
    let successfulDeliveries = 0;

    try {
      if (expoTokens.length) {
        const result = await sendExpoPushMessages(expoTokens, delivery.notification, payload, deliveryWindow);
        successfulDeliveries += result.sentCount;
        errors.push(...result.errors);
      }

      if (webPushTokens.length) {
        const result = await sendWebPushMessages(webPushTokens, delivery.notification, payload, deliveryWindow);
        successfulDeliveries += result.sentCount;
        errors.push(...result.errors);
      }

      if (successfulDeliveries > 0) {
        await markDelivery(delivery, "sent", errors[0] ?? null);
        sent += 1;
      } else {
        await markDelivery(delivery, "failed", errors[0] ?? "push_delivery_failed");
        failed += 1;
      }
    } catch (error) {
      await markDelivery(delivery, "failed", error instanceof Error ? error.message : "push_delivery_failed");
      failed += 1;
    }
  }

  console.log({ event: "push_worker_run_complete", processed: deliveries.length, sent, skipped, failed });
  return { processed: deliveries.length, sent, skipped, failed };
}

async function requeueStaleClaims() {
  await pool.query(
    `
      update public.push_deliveries
         set status = 'failed',
             last_error = 'push_delivery_claim_stale',
             next_attempt_at = now(),
             updated_at = now()
       where status = 'claimed'
         and updated_at < now() - ($1::int * interval '1 second')
         and attempt_count < $2
    `,
    [config.push.staleClaimSeconds, config.push.maxDeliveryAttempts],
  );
}

async function claimDeliveries() {
  const result = await pool.query(
    `
      with candidates as (
        select pd.id
          from public.push_deliveries pd
         where pd.status in ('pending', 'failed')
           and pd.attempt_count < $1
           and pd.next_attempt_at <= now()
         order by pd.created_at asc
         for update skip locked
         limit $2
      ),
      claimed as (
        update public.push_deliveries pd
           set status = 'claimed',
               attempt_count = pd.attempt_count + 1,
               claimed_at = now(),
               claimed_by = $3,
               updated_at = now()
          from candidates
         where pd.id = candidates.id
        returning pd.*
      )
      select
        c.id,
        c.notification_id,
        c.user_id,
        c.status,
        c.attempt_count,
        c.last_error,
        c.created_at,
        c.updated_at,
        n.id as n_id,
        n.couple_id as n_couple_id,
        n.user_id as n_user_id,
        n.actor_id as n_actor_id,
        n.type as n_type,
        n.title as n_title,
        n.body as n_body,
        n.related_table as n_related_table,
        n.related_id as n_related_id
      from claimed c
      left join public.notifications n on n.id = c.notification_id
    `,
    [config.push.maxDeliveryAttempts, config.push.maxDeliveriesPerRun, workerId],
  );

  return result.rows.map(publicDelivery);
}

function publicDelivery(row) {
  return {
    id: row.id,
    notificationId: row.notification_id,
    userId: row.user_id,
    attemptCount: Number(row.attempt_count || 0),
    createdAt: row.created_at,
    notification: row.n_id
      ? {
          id: row.n_id,
          coupleId: row.n_couple_id,
          userId: row.n_user_id,
          actorId: row.n_actor_id,
          type: row.n_type,
          title: row.n_title,
          body: row.n_body,
          relatedTable: row.n_related_table,
          relatedId: row.n_related_id,
        }
      : null,
  };
}

async function loadPushTokensByUserId(deliveries) {
  const userIds = Array.from(new Set(deliveries.map((delivery) => delivery.userId).filter(Boolean)));
  if (!userIds.length) {
    return new Map();
  }

  const result = await pool.query(
    `
      select id, user_id, token, provider, web_p256dh, web_auth
        from public.push_tokens
       where user_id = any($1::uuid[])
         and provider in ('expo', 'web_push')
         and enabled = true
         and revoked_at is null
       order by user_id, last_seen_at desc
    `,
    [userIds],
  );

  const tokensByUserId = new Map();
  for (const row of result.rows) {
    const tokens = tokensByUserId.get(row.user_id) ?? [];
    if (tokens.length >= config.push.maxTokensPerUser) {
      continue;
    }
    tokens.push({
      id: row.id,
      userId: row.user_id,
      token: row.token,
      provider: row.provider,
      webP256dh: row.web_p256dh,
      webAuth: row.web_auth,
    });
    tokensByUserId.set(row.user_id, tokens);
  }

  return tokensByUserId;
}

async function sendExpoPushMessages(pushTokens, notification, payload, deliveryWindow) {
  let sentCount = 0;
  const errors = [];
  const invalidTokenIds = [];
  const messages = pushTokens.map((token) => ({
    to: token.token,
    sound: "default",
    title: payload.title,
    body: payload.body,
    ttl: deliveryWindow.ttlSeconds,
    priority: "high",
    data: {
      notificationId: notification.id,
      type: notification.type,
      relatedTable: notification.relatedTable,
      relatedId: notification.relatedId,
      sentAt: deliveryWindow.sentAt,
      expiresAt: deliveryWindow.expiresAt,
    },
  }));

  for (const batch of chunkWithIndexes(messages, expoPushBatchSize)) {
    const response = await fetch(config.push.expoEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
      },
      body: JSON.stringify(batch.items),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      errors.push(`expo_http_${response.status}`);
      continue;
    }

    const tickets = Array.isArray(body?.data) ? body.data : [];
    tickets.forEach((ticket, batchIndex) => {
      const originalIndex = batch.startIndex + batchIndex;
      if (ticket?.status === "ok") {
        sentCount += 1;
        return;
      }
      if (ticket?.details?.error === "DeviceNotRegistered" && pushTokens[originalIndex]) {
        invalidTokenIds.push(pushTokens[originalIndex].id);
      }
      errors.push(ticket?.message || ticket?.details?.error || "expo_ticket_error");
    });
  }

  await disableInvalidTokens(invalidTokenIds);
  return { sentCount, errors };
}

async function sendWebPushMessages(pushTokens, notification, payload, deliveryWindow) {
  if (!config.push.vapidPublicKey || !config.push.vapidPrivateKey) {
    return { sentCount: 0, errors: ["missing_web_push_vapid_keys"] };
  }

  const invalidTokenIds = [];
  const errors = [];
  let sentCount = 0;

  await runWithConcurrency(pushTokens, webPushConcurrency, async (token) => {
    if (!token.webP256dh || !token.webAuth) {
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

  await disableInvalidTokens(invalidTokenIds);
  return { sentCount, errors };
}

async function sendWebPushMessage(token, notification, payload, deliveryWindow) {
  try {
    await webpush.sendNotification(
      {
        endpoint: token.token,
        keys: {
          p256dh: token.webP256dh,
          auth: token.webAuth,
        },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: "/",
        notificationId: notification.id,
        type: notification.type,
        relatedTable: notification.relatedTable,
        relatedId: notification.relatedId,
        sentAt: deliveryWindow.sentAt,
        expiresAt: deliveryWindow.expiresAt,
      }),
      {
        TTL: deliveryWindow.ttlSeconds,
        urgency: "high",
      },
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

function getWebPushErrorStatusCode(error) {
  if (!error || typeof error !== "object") {
    return null;
  }
  const statusCode = error.statusCode ?? error.status;
  return typeof statusCode === "number" ? statusCode : null;
}

async function disableInvalidTokens(tokenIds) {
  if (!tokenIds.length) {
    return;
  }
  await pool.query(
    `
      update public.push_tokens
         set enabled = false,
             revoked_at = coalesce(revoked_at, now()),
             last_seen_at = now()
       where id = any($1::uuid[])
    `,
    [Array.from(new Set(tokenIds))],
  );
}

async function markDelivery(delivery, status, error = null) {
  const retrySeconds = config.push.retryBaseSeconds * Math.max(1, delivery.attemptCount);
  await pool.query(
    `
      update public.push_deliveries
         set status = $2,
             last_error = left($3, 240),
             sent_at = case when $2 = 'sent' then now() else sent_at end,
             next_attempt_at = case
               when $2 = 'failed' and attempt_count < $4 then now() + ($5::int * interval '1 second')
               else now()
             end,
             updated_at = now()
       where id = $1
    `,
    [delivery.id, status, error, config.push.maxDeliveryAttempts, retrySeconds],
  );
}

function buildPushPayload(notification) {
  const body = truncate(String(notification.body || "").trim());

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
      title: "TA 给你留了一句话",
      body: "打开看看这条留言。",
    };
  }

  return {
    title: notification.title,
    body: body || "同频跳动有一条新提醒。",
  };
}

function looksLikePrivateBody(value) {
  return value.includes("｜") || value.length > 36;
}

function truncate(value) {
  if (value.length <= maxBodyLength) {
    return value;
  }
  return `${value.slice(0, maxBodyLength - 1)}...`;
}

function buildDeliveryWindow(delivery) {
  const queuedAtMs = Date.parse(delivery.createdAt);
  const baseMs = Number.isFinite(queuedAtMs) ? queuedAtMs : Date.now();
  const expiresAtMs = baseMs + config.push.deliveryTtlSeconds * 1000;

  return {
    sentAt: new Date().toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    ttlSeconds: Math.max(1, Math.ceil((expiresAtMs - Date.now()) / 1000)),
  };
}

function isDeliveryExpired(delivery) {
  const queuedAtMs = Date.parse(delivery.createdAt);
  return Number.isFinite(queuedAtMs) && Date.now() - queuedAtMs > config.push.deliveryTtlSeconds * 1000;
}

async function runWithConcurrency(items, concurrency, worker) {
  const count = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: count }, async (_, workerIndex) => {
    for (let index = workerIndex; index < items.length; index += count) {
      await worker(items[index], index);
    }
  }));
}

function chunkWithIndexes(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push({ startIndex: index, items: items.slice(index, index + size) });
  }
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error({
    event: "push_worker_fatal",
    message: error instanceof Error ? error.message : "unknown push worker fatal error",
  });
  process.exit(1);
});
