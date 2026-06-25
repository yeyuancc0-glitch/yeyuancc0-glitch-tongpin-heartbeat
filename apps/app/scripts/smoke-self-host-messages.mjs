const baseUrl = process.env.API_BASE_URL || process.env.EXPO_PUBLIC_SELF_HOST_API_URL || "https://api-staging.fancah.tech";
const suffix = Date.now();
const password = `App-Messages-${suffix}-password`;

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
  const userA = await register(`codex-app-messages-a-${suffix}@example.test`);
  const userB = await register(`codex-app-messages-b-${suffix}@example.test`);

  const invite = await request("/api/pair-invites", { method: "POST", token: userA });
  assert(invite.response.status === 201, `create invite returned ${invite.response.status}`);

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

  const created = await request(`/api/messages?coupleId=${coupleId}`, {
    method: "POST",
    token: userA,
    body: { body: "app self-host message smoke" },
  });
  assert(created.response.status === 201, statusMessage("create message", created));
  const messageId = created.json.message?.id;
  assert(messageId, "message id missing");

  const listed = await request(`/api/messages?coupleId=${coupleId}&limit=10`, { token: userB });
  assert(listed.response.status === 200, statusMessage("list messages", listed));
  assert(listed.json.messages?.some((message) => message.id === messageId), "message missing from partner list");

  const notifications = await request(`/api/notifications?coupleId=${coupleId}&limit=10`, { token: userB });
  assert(notifications.response.status === 200, statusMessage("list notifications", notifications));
  assert(notifications.json.notifications?.some((notification) => notification.relatedId === messageId), "message notification missing from partner list");

  const deleted = await request("/api/messages/delete", {
    method: "POST",
    token: userA,
    body: { messageId },
  });
  assert(deleted.response.status === 200, statusMessage("delete", deleted));

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["register", "pair_invite", "create", "list", "notification", "delete"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) {
    console.error(error.cause);
  }
  process.exit(1);
});
