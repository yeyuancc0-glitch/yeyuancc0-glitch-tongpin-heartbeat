const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const suffix = Date.now();
const password = `Push-${suffix}-password`;

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

async function register(email) {
  const result = await request("/api/auth/register", {
    method: "POST",
    body: { email, password, displayName: email.split("@")[0] },
  });
  assert(result.response.status === 201, `register ${email} returned ${result.response.status}`);
  return result.json.session.accessToken;
}

async function createPair(userA, userB) {
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
  return coupleId;
}

async function createMessage(token, coupleId, body) {
  const result = await request(`/api/messages?coupleId=${coupleId}`, {
    method: "POST",
    token,
    body: { body },
  });
  assert(result.response.status === 201, statusMessage("create message", result));
  const messageId = result.json.message?.id;
  assert(isUuid(messageId), "message id missing");
  return messageId;
}

async function deliverySummary(token) {
  const result = await request("/api/push-deliveries/summary", { token });
  assert(result.response.status === 200, statusMessage("delivery summary", result));
  return result.json.deliveries || {};
}

async function waitForWorkerToProcessDelivery(token, initialTotal) {
  let lastSummary = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const summary = await deliverySummary(token);
    lastSummary = summary;
    const total = Number(summary.total || 0);
    const pending = Number(summary.pending || 0);
    const claimed = Number(summary.claimed || 0);
    const terminal = Number(summary.sent || 0) + Number(summary.skipped || 0) + Number(summary.failed || 0);
    if (total > initialTotal && pending === 0 && claimed === 0 && terminal > 0) {
      return summary;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`push worker did not process queued delivery in time: ${JSON.stringify(lastSummary)}`);
}

async function main() {
  const userA = await register(`codex-push-a-${suffix}@example.test`);
  const userB = await register(`codex-push-b-${suffix}@example.test`);
  const coupleId = await createPair(userA, userB);

  const initial = await request("/api/notification-preferences", { token: userB });
  assert(initial.response.status === 200, statusMessage("initial preferences", initial));
  assert(initial.json.preferences?.push_enabled === true, "push should default to enabled");
  assert(initial.json.push?.activeTokens === 0, "new user should have no active push tokens");
  const initialDeliveries = await deliverySummary(userB);
  const initialDeliveryTotal = Number(initialDeliveries.total || 0);

  const disabled = await request("/api/notification-preferences", {
    method: "POST",
    token: userB,
    body: { push_enabled: false },
  });
  assert(disabled.response.status === 200, statusMessage("disable push", disabled));
  assert(disabled.json.preferences?.push_enabled === false, "push preference was not disabled");

  const endpoint = `https://push.example.test/self-host/${suffix}`;
  const registered = await request("/api/push-tokens/web", {
    method: "POST",
    token: userB,
    body: {
      endpoint,
      p256dh: `p256dh-${suffix}`,
      auth: `auth-${suffix}`,
      userAgent: "codex-smoke-web-push",
    },
  });
  assert(registered.response.status === 201, statusMessage("register web push", registered));
  assert(registered.json.push?.activeTokens === 1, "web push token was not counted");
  assert(!JSON.stringify(registered.json).includes("p256dh"), "response leaked web push p256dh");
  assert(!JSON.stringify(registered.json).includes("auth-"), "response leaked web push auth secret");

  const skippedMessageId = await createMessage(userA, coupleId, `push-disabled-${suffix}`);
  const skippedNotifications = await request(`/api/notifications?coupleId=${coupleId}&limit=10`, { token: userB });
  assert(skippedNotifications.response.status === 200, statusMessage("list skipped notifications", skippedNotifications));
  const skippedNotification = skippedNotifications.json.notifications?.find((item) => item.relatedId === skippedMessageId);
  assert(skippedNotification, "notification missing while push disabled");

  const enabled = await request("/api/notification-preferences", {
    method: "POST",
    token: userB,
    body: { push_enabled: true, message_enabled: true },
  });
  assert(enabled.response.status === 200, statusMessage("enable push", enabled));
  assert(enabled.json.preferences?.push_enabled === true, "push preference was not enabled");

  const queuedMessageId = await createMessage(userA, coupleId, `push-enabled-${suffix}`);
  const queuedNotifications = await request(`/api/notifications?coupleId=${coupleId}&limit=10`, { token: userB });
  assert(queuedNotifications.response.status === 200, statusMessage("list queued notifications", queuedNotifications));
  const queuedNotification = queuedNotifications.json.notifications?.find((item) => item.relatedId === queuedMessageId);
  assert(queuedNotification, "notification missing while push enabled");
  const processedSummary = await waitForWorkerToProcessDelivery(userB, initialDeliveryTotal);
  assert(Number(processedSummary.total || 0) > initialDeliveryTotal, "push delivery was not queued");

  const disabledToken = await request("/api/push-tokens/disable", {
    method: "POST",
    token: userB,
    body: { token: endpoint },
  });
  assert(disabledToken.response.status === 200, statusMessage("disable token", disabledToken));
  assert(disabledToken.json.push?.activeTokens === 0, "web push token was not disabled");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: [
      "preferences_default",
      "web_push_register_no_secret_echo",
      "push_disabled_keeps_station_notification",
      "push_enabled_queues_candidate",
      "worker_processes_delivery",
      "disable_token",
    ],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
