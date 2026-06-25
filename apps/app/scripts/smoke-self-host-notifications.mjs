const baseUrl = process.env.API_BASE_URL || process.env.EXPO_PUBLIC_SELF_HOST_API_URL || "https://api-staging.fancah.tech";
const suffix = Date.now();
const password = `App-Notifications-${suffix}-password`;

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
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

async function main() {
  const userA = await register(`codex-app-notifications-a-${suffix}@example.test`);
  const userB = await register(`codex-app-notifications-b-${suffix}@example.test`);

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

  const message = await request(`/api/messages?coupleId=${coupleId}`, {
    method: "POST",
    token: userA,
    body: { body: "app notification source message" },
  });
  assert(message.response.status === 201, statusMessage("create message", message));
  const messageId = message.json.message?.id;
  assert(isUuid(messageId), "message id missing");

  const listed = await request(`/api/notifications?coupleId=${coupleId}&limit=10`, { token: userB });
  assert(listed.response.status === 200, statusMessage("list notifications", listed));
  const notification = listed.json.notifications?.find((item) => item.relatedId === messageId);
  assert(notification, "notification missing");

  const extraMessageIds = [];
  for (let index = 0; index < 17; index += 1) {
    const extra = await request(`/api/messages?coupleId=${coupleId}`, {
      method: "POST",
      token: userA,
      body: { body: `app notification default limit source ${index}` },
    });
    assert(extra.response.status === 201, statusMessage(`create extra notification source ${index}`, extra));
    extraMessageIds.push(extra.json.message?.id);
  }

  const defaultListed = await request(`/api/notifications?coupleId=${coupleId}`, { token: userB });
  assert(defaultListed.response.status === 200, statusMessage("list notifications default limit", defaultListed));
  assert(defaultListed.json.notifications?.length >= 18, "default notification list should not be capped at the old 16-item preview limit");
  assert(extraMessageIds.every((id) => defaultListed.json.notifications?.some((item) => item.relatedId === id)), "default notification list missed recent notifications");

  const read = await request("/api/notifications/read", {
    method: "POST",
    token: userB,
    body: { notificationId: notification.id },
  });
  assert(read.response.status === 200, statusMessage("read notification", read));

  const dismissed = await request("/api/notifications/dismiss", {
    method: "POST",
    token: userB,
    body: { notificationId: notification.id },
  });
  assert(dismissed.response.status === 200, statusMessage("dismiss notification", dismissed));

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["register", "pair_invite", "create_source", "list", "default_limit_above_16", "read", "dismiss"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) {
    console.error(error.cause);
  }
  process.exit(1);
});
