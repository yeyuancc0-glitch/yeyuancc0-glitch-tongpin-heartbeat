const baseUrl = process.env.API_BASE_URL || process.env.EXPO_PUBLIC_SELF_HOST_API_URL || "https://api-staging.fancah.tech";
const suffix = Date.now();
const password = `App-Interactions-${suffix}-password`;

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
  const userA = await register(`codex-app-interactions-a-${suffix}@example.test`);
  const userB = await register(`codex-app-interactions-b-${suffix}@example.test`);

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

  const sent = await request("/api/interactions/quick", {
    method: "POST",
    token: userA,
    body: { coupleId, label: "一起听歌" },
  });
  assert(sent.response.status === 201, statusMessage("send quick interaction", sent));
  const notificationId = sent.json.notificationId || sent.json.notification_id || sent.json.notification?.id;
  assert(isUuid(notificationId), "quick interaction notification id missing");

  const listed = await request(`/api/notifications?coupleId=${coupleId}&limit=10`, { token: userB });
  assert(listed.response.status === 200, statusMessage("list notifications", listed));
  const notification = listed.json.notifications?.find((item) => item.id === notificationId);
  assert(notification, "partner notification missing");
  assert(notification.title === "TA 向你投递了一点心情", "notification title mismatch");
  assert(notification.body === "一起听歌", "notification body mismatch");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    notificationId,
    checks: ["register", "pair_invite", "quick_interaction", "partner_notification"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
