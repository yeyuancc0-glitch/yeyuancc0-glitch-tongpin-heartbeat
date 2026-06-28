import http from "node:http";
import https from "node:https";

const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const suffix = Date.now();
const password = `Notifications-${suffix}-password`;

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

function requestOnFreshSocket(path, { method = "GET", token, body } = {}) {
  const target = new URL(path, baseUrl);
  const transport = target.protocol === "https:" ? https : http;
  const payload = body ? JSON.stringify(body) : undefined;
  const agent = target.protocol === "https:"
    ? new https.Agent({ keepAlive: false, maxSockets: 1 })
    : new http.Agent({ keepAlive: false, maxSockets: 1 });

  return new Promise((resolve, reject) => {
    const req = transport.request(target, {
      method,
      agent,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Connection: "close",
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          json = {};
        }
        resolve({
          response: {
            status: res.statusCode || 0,
            ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
          },
          json,
        });
      });
    });
    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  }).finally(() => {
    agent.destroy();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function statusMessage(label, result) {
  return `${label} returned ${result.response.status}: ${JSON.stringify(result.json)}`;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function parseSseMessage(raw) {
  let event = "message";
  let id = "";
  const dataLines = [];
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
  return { event, id, data: dataLines.join("\n") };
}

async function openNotificationStream({ coupleId, token }) {
  const controller = new AbortController();
  const events = [];
  let buffer = "";
  let readyResolve;
  let eventResolve;
  let eventReject;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });
  const nextNotification = new Promise((resolve, reject) => {
    eventResolve = resolve;
    eventReject = reject;
  });
  const timeout = setTimeout(() => {
    controller.abort();
    eventReject(new Error("notification stream timed out"));
  }, 15000);

  fetch(`${baseUrl}/api/notifications/stream?coupleId=${coupleId}`, {
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok || !response.body) {
      throw new Error(`notification stream returned ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (!controller.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const message = parseSseMessage(part);
        if (!message.data) {
          continue;
        }
        const payload = JSON.parse(message.data);
        events.push({ ...message, payload });
        if (message.event === "ready") {
          readyResolve(payload);
        }
        if (message.event === "notification") {
          clearTimeout(timeout);
          eventResolve(payload);
        }
      }
    }
  }).catch((error) => {
    if (!controller.signal.aborted) {
      clearTimeout(timeout);
      eventReject(error);
    }
  });

  return {
    events,
    ready,
    nextNotification,
    close: () => {
      clearTimeout(timeout);
      controller.abort();
    },
  };
}

async function assertLegacyCursorNotificationStream({ coupleId, token }) {
  const legacyCursor = new Date(Date.UTC(2026, 5, 21, 3, 49, 42)).toString();
  const response = await fetch(`${baseUrl}/api/notifications/stream?coupleId=${coupleId}&afterCreatedAt=${encodeURIComponent(legacyCursor)}`, {
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(5000),
  });
  assert(response.ok && response.body, `legacy cursor notification stream returned ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!buffer.includes("event: ready")) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      assert(!buffer.includes("event: error"), `legacy cursor notification stream errored: ${buffer}`);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  assert(buffer.includes("event: ready"), `legacy cursor notification stream did not become ready: ${buffer}`);
}

async function register(email) {
  const result = await request("/api/auth/register", {
    method: "POST",
    body: { email, password, displayName: email.split("@")[0] },
  });
  assert(result.response.status === 201, `register ${email} returned ${result.response.status}`);
  return result.json.session.accessToken;
}

async function main() {
  const userA = await register(`codex-notifications-a-${suffix}@example.test`);
  const userB = await register(`codex-notifications-b-${suffix}@example.test`);
  const userC = await register(`codex-notifications-c-${suffix}@example.test`);

  const invite = await request("/api/pair-invites", { method: "POST", token: userA });
  assert(invite.response.status === 201, statusMessage("create invite", invite));
  const accepted = await request("/api/pair-invites/accept", {
    method: "POST",
    token: userB,
    body: {
      inviteCode: invite.json.invite.inviteCode,
      relationshipStartedAt: "2026-06-24",
    },
  });
  assert(accepted.response.status === 200, statusMessage("accept invite", accepted));
  const coupleId = accepted.json.couple?.id;
  assert(isUuid(coupleId), `couple id invalid: ${JSON.stringify(accepted.json)}`);

  const stream = await openNotificationStream({ coupleId, token: userB });
  await stream.ready;
  await assertLegacyCursorNotificationStream({ coupleId, token: userB });

  const secretBody = `secret-body-${suffix}`;
  const created = await requestOnFreshSocket(`/api/messages?coupleId=${coupleId}`, {
    method: "POST",
    token: userA,
    body: { body: secretBody },
  });
  assert(created.response.status === 201, statusMessage("create message", created));
  const messageId = created.json.message?.id;
  assert(isUuid(messageId), "message id missing");

  const streamEvent = await stream.nextNotification;
  stream.close();
  assert(isUuid(streamEvent.notificationId), `stream notification id invalid: ${JSON.stringify(streamEvent)}`);

  const listed = await request(`/api/notifications?coupleId=${coupleId}&limit=10`, { token: userB });
  assert(listed.response.status === 200, statusMessage("list notifications", listed));
  const notification = listed.json.notifications?.find((item) => item.relatedId === messageId);
  assert(notification, "message notification missing");
  assert(streamEvent.notificationId === notification.id, "stream notification id mismatch");
  assert(notification.type === "message", "notification type mismatch");
  assert(notification.body && !notification.body.includes(secretBody), "notification leaked message body");

  const outsider = await request(`/api/notifications?coupleId=${coupleId}&limit=10`, { token: userC });
  assert(outsider.response.status === 200, statusMessage("outsider notifications", outsider));
  assert((outsider.json.notifications || []).length === 0, "outsider listed notifications");

  const read = await request("/api/notifications/read", {
    method: "POST",
    token: userB,
    body: { notificationId: notification.id },
  });
  assert(read.response.status === 200, statusMessage("mark read", read));
  assert(read.json.notification?.readAt, "notification missing readAt");

  const dismiss = await request("/api/notifications/dismiss", {
    method: "POST",
    token: userB,
    body: { notificationId: notification.id },
  });
  assert(dismiss.response.status === 200, statusMessage("dismiss", dismiss));
  assert(dismiss.json.notification?.dismissedAt, "notification missing dismissedAt");

  const afterDismiss = await request(`/api/notifications?coupleId=${coupleId}&limit=10`, { token: userB });
  assert(afterDismiss.response.status === 200, statusMessage("after dismiss", afterDismiss));
  assert(!afterDismiss.json.notifications?.some((item) => item.id === notification.id), "dismissed notification still listed");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["message_create_notification", "notification_sse", "legacy_cursor_sse", "low_sensitive_body", "outsider_empty", "mark_read", "dismiss"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
