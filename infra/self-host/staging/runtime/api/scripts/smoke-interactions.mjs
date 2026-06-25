const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const suffix = Date.now();
const password = `Interactions-${suffix}-password`;

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

async function pair(userA, userB) {
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

async function main() {
  const userA = await register(`codex-interactions-a-${suffix}@example.test`);
  const userB = await register(`codex-interactions-b-${suffix}@example.test`);
  const userC = await register(`codex-interactions-c-${suffix}@example.test`);
  const coupleId = await pair(userA, userB);

  const sent = await request("/api/interactions/quick", {
    method: "POST",
    token: userA,
    body: { coupleId, label: "晚安抱抱" },
  });
  assert(sent.response.status === 201, statusMessage("send quick interaction", sent));
  const notificationId = sent.json.notificationId || sent.json.notification_id || sent.json.notification?.id;
  assert(isUuid(notificationId), "quick interaction notification id missing");
  assert(sent.json.notification?.title === "TA 向你投递了一点心情", "quick interaction title mismatch");
  assert(sent.json.notification?.body === "晚安抱抱", "quick interaction body mismatch");

  const listed = await request(`/api/notifications?coupleId=${coupleId}&limit=10`, { token: userB });
  assert(listed.response.status === 200, statusMessage("list notifications", listed));
  const notification = listed.json.notifications?.find((item) => item.id === notificationId);
  assert(notification, "partner notification missing");
  assert(notification.type === "message", "notification type mismatch");
  assert(notification.actorId, "notification actor missing");

  const outsider = await request("/api/interactions/quick", {
    method: "POST",
    token: userC,
    body: { coupleId, label: "想你" },
  });
  assert(outsider.response.status === 403, statusMessage("outsider quick interaction", outsider));

  const emptyLabel = await request("/api/interactions/quick", {
    method: "POST",
    token: userA,
    body: { coupleId, label: "   " },
  });
  assert(emptyLabel.response.status === 400, statusMessage("empty quick label", emptyLabel));

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    notificationId,
    checks: ["quick_interaction_notification", "partner_list", "outsider_forbidden", "empty_label_rejected"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
