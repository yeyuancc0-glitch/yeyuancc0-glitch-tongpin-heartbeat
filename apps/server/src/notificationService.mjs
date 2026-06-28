import { AuthError } from "./authService.mjs";
import { withTransaction } from "./db.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedTypes = new Set(["letter", "message", "checkin", "calendar_event", "system"]);
const allowedTables = new Set(["messages", "checkins", "future_letters", "calendar_events", "system"]);
const allowedPreferenceKeys = new Set([
  "push_enabled",
  "message_enabled",
  "interaction_enabled",
  "checkin_enabled",
  "letter_enabled",
  "calendar_enabled",
  "quiet_hours_enabled",
]);
const defaultNotificationListLimit = 1000;
const maxNotificationListLimit = 5000;
const allowedPlatforms = new Set(["ios", "android", "web", "unknown"]);

function assertUuid(value, code, message) {
  if (!uuidPattern.test(String(value || ""))) {
    throw new AuthError(code, 400, message);
  }
}

function publicNotification(row) {
  return {
    id: row.id,
    coupleId: row.couple_id,
    userId: row.user_id,
    actorId: row.actor_id,
    type: row.type,
    title: row.title,
    body: row.body,
    relatedTable: row.related_table,
    relatedId: row.related_id,
    readAt: row.read_at,
    dismissedAt: row.dismissed_at,
    createdAt: row.created_at,
  };
}

function publicPreference(row) {
  return {
    user_id: row.user_id,
    push_enabled: row.push_enabled,
    message_enabled: row.message_enabled,
    interaction_enabled: row.interaction_enabled,
    checkin_enabled: row.checkin_enabled,
    letter_enabled: row.letter_enabled,
    calendar_enabled: row.calendar_enabled,
    quiet_hours_enabled: row.quiet_hours_enabled,
    quiet_start: row.quiet_start,
    quiet_end: row.quiet_end,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function publicPushSummary(row) {
  return {
    activeTokens: Number(row.active_tokens || 0),
    activeWebPushTokens: Number(row.active_web_push_tokens || 0),
    activeExpoTokens: Number(row.active_expo_tokens || 0),
  };
}

async function ensureActiveCoupleMember(client, coupleId, userId) {
  const result = await client.query("select public.is_active_couple_member($1, $2) as allowed", [coupleId, userId]);
  if (!result.rows[0]?.allowed) {
    throw new AuthError("forbidden", 403, "You do not have access to this couple.");
  }
}

async function activePartnerId(client, coupleId, currentUserId) {
  const result = await client.query(
    `
      select user_id
      from public.couple_members
      where couple_id = $1
        and status = 'active'
        and user_id <> $2
      order by joined_at asc
      limit 1
    `,
    [coupleId, currentUserId],
  );
  return result.rows[0]?.user_id ?? null;
}

function cleanNotificationInput(input) {
  const type = String(input.type || "system").trim().toLowerCase();
  const title = String(input.title || "你有一条新提醒").trim().slice(0, 80);
  const rawBody = typeof input.body === "string" ? input.body.trim() : "";
  const relatedTable = typeof input.relatedTable === "string" ? input.relatedTable.trim() : null;
  if (!allowedTypes.has(type)) {
    throw new AuthError("invalid_notification_type", 400, "Notification type is not supported.");
  }
  if (!title) {
    throw new AuthError("invalid_notification_title", 400, "Notification title is required.");
  }
  if (relatedTable && !allowedTables.has(relatedTable)) {
    throw new AuthError("invalid_related_table", 400, "Related table is not supported.");
  }
  return {
    type,
    title,
    body: rawBody ? rawBody.slice(0, 160) : null,
    relatedTable,
    relatedId: input.relatedId || null,
  };
}

async function ensureNotificationPreferences(client, userId) {
  const result = await client.query(
    `
      insert into public.notification_preferences (user_id)
      values ($1)
      on conflict (user_id) do update
         set user_id = excluded.user_id
      returning *
    `,
    [userId],
  );
  return result.rows[0];
}

async function pushSummary(client, userId) {
  const result = await client.query(
    `
      select
        count(*) filter (where enabled and revoked_at is null) as active_tokens,
        count(*) filter (where enabled and revoked_at is null and provider = 'web_push') as active_web_push_tokens,
        count(*) filter (where enabled and revoked_at is null and provider = 'expo') as active_expo_tokens
      from public.push_tokens
      where user_id = $1
    `,
    [userId],
  );
  return publicPushSummary(result.rows[0] || {});
}

function notificationPushPreferenceKey(notification) {
  if (notification.type === "letter") {
    return "letter_enabled";
  }
  if (notification.type === "checkin") {
    return "checkin_enabled";
  }
  if (notification.type === "calendar_event") {
    return "calendar_enabled";
  }
  if (notification.type === "message" && (notification.title === "TA 投递了一点心情" || notification.title === "TA 向你投递了一点心情")) {
    return "interaction_enabled";
  }
  if (notification.type === "message") {
    return "message_enabled";
  }
  return null;
}

function isQuietNow(preferences, now = new Date()) {
  if (!preferences.quiet_hours_enabled) {
    return false;
  }
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
  const current = formatter.format(now);
  const start = String(preferences.quiet_start || "23:00").slice(0, 5);
  const end = String(preferences.quiet_end || "08:00").slice(0, 5);
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
}

async function maybeEnqueuePushDelivery(client, notification) {
  if (!notification.user_id || !notification.actor_id || notification.actor_id === notification.user_id || notification.dismissed_at) {
    return false;
  }
  const preferenceRow = await ensureNotificationPreferences(client, notification.user_id);
  const key = notificationPushPreferenceKey(notification);
  if (!key || !preferenceRow.push_enabled || !preferenceRow[key] || isQuietNow(preferenceRow)) {
    return false;
  }
  await client.query(
    `
      insert into public.push_deliveries (notification_id, user_id, status)
      values ($1, $2, 'pending')
      on conflict (notification_id) do nothing
    `,
    [notification.id, notification.user_id],
  );
  return true;
}

function cleanWebPushSubscription(input) {
  const endpoint = String(input.endpoint || input.pushEndpoint || input.push_endpoint || "").trim();
  const p256dh = String(input.p256dh || input.pushP256dh || input.push_p256dh || "").trim();
  const auth = String(input.auth || input.pushAuth || input.push_auth || "").trim();
  const userAgent = typeof input.userAgent === "string" ? input.userAgent.trim().slice(0, 512) : null;
  if (!endpoint || endpoint.length > 4096 || !p256dh || p256dh.length > 512 || !auth || auth.length > 512) {
    throw new AuthError("invalid_web_push_subscription", 400, "Web push subscription is invalid.");
  }
  if (!/^https:\/\//i.test(endpoint)) {
    throw new AuthError("invalid_web_push_endpoint", 400, "Web push endpoint must be HTTPS.");
  }
  return { endpoint, p256dh, auth, userAgent };
}

function cleanExpoPushToken(input) {
  const token = String(input.token || input.pushToken || input.push_token || "").trim();
  const platform = allowedPlatforms.has(String(input.platform || "").trim()) ? String(input.platform).trim() : "unknown";
  const deviceId = typeof input.deviceId === "string" ? input.deviceId.trim().slice(0, 256) : null;
  const appVersion = typeof input.appVersion === "string" ? input.appVersion.trim().slice(0, 80) : null;
  if (!token || token.length > 4096) {
    throw new AuthError("invalid_push_token", 400, "Push token is invalid.");
  }
  return { token, platform, deviceId, appVersion };
}

export function createNotificationService({ pool, logger = console }) {
  async function createPartnerNotification(client, input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    await ensureActiveCoupleMember(client, coupleId, current.user.id);
    const partnerId = await activePartnerId(client, coupleId, current.user.id);
    if (!partnerId) {
      throw new AuthError("partner_not_found", 404, "Active partner was not found.");
    }
    const clean = cleanNotificationInput(input);
    if (clean.relatedId) {
      assertUuid(clean.relatedId, "invalid_related_id", "A valid related id is required.");
    }
    const result = await client.query(
      `
        insert into public.notifications (
          couple_id,
          user_id,
          actor_id,
          type,
          title,
          body,
          related_table,
          related_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning *
      `,
      [
        coupleId,
        partnerId,
        current.user.id,
        clean.type,
        clean.title,
        clean.body,
        clean.relatedTable,
        clean.relatedId,
      ],
    );
    await maybeEnqueuePushDelivery(client, result.rows[0]);
    return publicNotification(result.rows[0]);
  }

  async function tryCreatePartnerNotification(poolOrClient, input, current) {
    try {
      return await withTransaction(pool, (client) => createPartnerNotification(client, input, current));
    } catch (error) {
      logger.warn?.({
        event: "notification_create_failed",
        type: input.type,
        coupleId: input.coupleId || input.couple_id,
        message: error instanceof Error ? error.message : "unknown notification error",
      });
      return null;
    }
  }

  async function getPreferences(current) {
    const result = await withTransaction(pool, async (client) => {
      const preferences = await ensureNotificationPreferences(client, current.user.id);
      const summary = await pushSummary(client, current.user.id);
      return { preferences: publicPreference(preferences), push: summary };
    });
    return result;
  }

  async function updatePreferences(input, current) {
    const updates = [];
    const values = [current.user.id];
    for (const key of allowedPreferenceKeys) {
      if (typeof input[key] === "boolean") {
        values.push(input[key]);
        updates.push(`${key} = $${values.length}`);
      }
    }
    if (updates.length === 0) {
      return getPreferences(current);
    }

    const result = await withTransaction(pool, async (client) => {
      await ensureNotificationPreferences(client, current.user.id);
      const updated = await client.query(
        `
          update public.notification_preferences
             set ${updates.join(", ")}
           where user_id = $1
          returning *
        `,
        values,
      );
      const summary = await pushSummary(client, current.user.id);
      return { preferences: publicPreference(updated.rows[0]), push: summary };
    });
    return result;
  }

  async function registerWebPush(input, current) {
    const clean = cleanWebPushSubscription(input);
    const result = await withTransaction(pool, async (client) => {
      await ensureNotificationPreferences(client, current.user.id);
      await client.query(
        `
          insert into public.push_tokens (
            user_id,
            token,
            provider,
            platform,
            web_p256dh,
            web_auth,
            user_agent,
            enabled,
            revoked_at,
            last_seen_at
          )
          values ($1, $2, 'web_push', 'web', $3, $4, $5, true, null, now())
          on conflict (user_id, token) do update
             set provider = 'web_push',
                 platform = 'web',
                 web_p256dh = excluded.web_p256dh,
                 web_auth = excluded.web_auth,
                 user_agent = excluded.user_agent,
                 enabled = true,
                 revoked_at = null,
                 last_seen_at = now()
        `,
        [current.user.id, clean.endpoint, clean.p256dh, clean.auth, clean.userAgent],
      );
      return { push: await pushSummary(client, current.user.id) };
    });
    return result;
  }

  async function registerExpoPush(input, current) {
    const clean = cleanExpoPushToken(input);
    const result = await withTransaction(pool, async (client) => {
      await ensureNotificationPreferences(client, current.user.id);
      await client.query(
        `
          insert into public.push_tokens (
            user_id,
            token,
            provider,
            device_id,
            platform,
            app_version,
            enabled,
            revoked_at,
            last_seen_at
          )
          values ($1, $2, 'expo', $3, $4, $5, true, null, now())
          on conflict (user_id, token) do update
             set provider = 'expo',
                 device_id = excluded.device_id,
                 platform = excluded.platform,
                 app_version = excluded.app_version,
                 enabled = true,
                 revoked_at = null,
                 last_seen_at = now()
        `,
        [current.user.id, clean.token, clean.deviceId, clean.platform, clean.appVersion],
      );
      return { push: await pushSummary(client, current.user.id) };
    });
    return result;
  }

  async function disablePushToken(input, current) {
    const token = String(input.token || input.pushToken || input.push_token || input.endpoint || "").trim();
    if (!token) {
      return { push: await withTransaction(pool, (client) => pushSummary(client, current.user.id)) };
    }
    const result = await withTransaction(pool, async (client) => {
      await client.query(
        `
          update public.push_tokens
             set enabled = false,
                 revoked_at = coalesce(revoked_at, now()),
                 last_seen_at = now()
           where user_id = $1
             and token = $2
        `,
        [current.user.id, token],
      );
      return { push: await pushSummary(client, current.user.id) };
    });
    return result;
  }

  async function pushDeliverySummary(current) {
    const result = await pool.query(
      `
        select
          count(*) filter (where status = 'pending') as pending,
          count(*) filter (where status = 'claimed') as claimed,
          count(*) filter (where status = 'sent') as sent,
          count(*) filter (where status = 'skipped') as skipped,
          count(*) filter (where status = 'failed') as failed,
          count(*) as total
        from public.push_deliveries
        where user_id = $1
      `,
      [current.user.id],
    );
    const row = result.rows[0] || {};
    return {
      deliveries: {
        pending: Number(row.pending || 0),
        claimed: Number(row.claimed || 0),
        sent: Number(row.sent || 0),
        skipped: Number(row.skipped || 0),
        failed: Number(row.failed || 0),
        total: Number(row.total || 0),
      },
    };
  }

  async function listNotifications(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const limit = Math.min(Math.max(Number(input.limit || defaultNotificationListLimit), 1), maxNotificationListLimit);
    const result = await pool.query(
      `
        select *
        from public.notifications
        where user_id = $1
          and dismissed_at is null
          and (couple_id is null or public.is_active_couple_member(couple_id, $1))
          and ($2::uuid is null or couple_id = $2::uuid)
        order by created_at desc
        limit $3
      `,
      [current.user.id, coupleId, limit],
    );
    return { notifications: result.rows.map(publicNotification) };
  }

  async function latestNotificationCursor(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const result = await pool.query(
      `
        select id, created_at
        from public.notifications
        where user_id = $1
          and dismissed_at is null
          and couple_id = $2::uuid
          and public.is_active_couple_member(couple_id, $1)
        order by created_at desc, id desc
        limit 1
      `,
      [current.user.id, coupleId],
    );
    const row = result.rows[0];
    return {
      notificationId: row?.id ?? null,
      createdAt: row?.created_at ?? null,
    };
  }

  async function listNotificationEvents(input, current) {
    const coupleId = String(input.coupleId || input.couple_id || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const afterCreatedAt = String(input.afterCreatedAt || input.after_created_at || "").trim();
    const afterNotificationId = String(input.afterNotificationId || input.after_notification_id || "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(input.limit || 20), 1), 50);
    if (afterNotificationId) {
      assertUuid(afterNotificationId, "invalid_notification_cursor", "A valid notification cursor is required.");
    }
    const result = await pool.query(
      `
        select *
        from public.notifications
        where user_id = $1
          and dismissed_at is null
          and couple_id = $2::uuid
          and public.is_active_couple_member(couple_id, $1)
          and (
            $3::timestamptz is null
            or created_at > $3::timestamptz
            or (created_at = $3::timestamptz and ($4::uuid is null or id > $4::uuid))
          )
        order by created_at asc, id asc
        limit $5
      `,
      [current.user.id, coupleId, afterCreatedAt || null, afterNotificationId || null, limit],
    );
    return { notifications: result.rows.map(publicNotification) };
  }

  async function markRead(input, current) {
    const notificationId = String(input.notificationId || input.notification_id || "");
    assertUuid(notificationId, "invalid_notification_id", "A valid notification id is required.");
    const notification = await withTransaction(pool, async (client) => {
      const result = await client.query(
        `
          update public.notifications
             set read_at = coalesce(read_at, now())
           where id = $1
             and user_id = $2
          returning *
        `,
        [notificationId, current.user.id],
      );
      if (!result.rows[0]) {
        throw new AuthError("notification_not_found", 404, "Notification was not found.");
      }
      return publicNotification(result.rows[0]);
    });
    return { notification };
  }

  async function dismiss(input, current) {
    const notificationId = String(input.notificationId || input.notification_id || "");
    assertUuid(notificationId, "invalid_notification_id", "A valid notification id is required.");
    const notification = await withTransaction(pool, async (client) => {
      const result = await client.query(
        `
          update public.notifications
             set dismissed_at = coalesce(dismissed_at, now())
           where id = $1
             and user_id = $2
          returning *
        `,
        [notificationId, current.user.id],
      );
      if (!result.rows[0]) {
        throw new AuthError("notification_not_found", 404, "Notification was not found.");
      }
      return publicNotification(result.rows[0]);
    });
    return { notification };
  }

  return {
    createPartnerNotification,
    dismiss,
    disablePushToken,
    getPreferences,
    latestNotificationCursor,
    listNotificationEvents,
    listNotifications,
    markRead,
    pushDeliverySummary,
    registerExpoPush,
    registerWebPush,
    tryCreatePartnerNotification,
    updatePreferences,
  };
}
