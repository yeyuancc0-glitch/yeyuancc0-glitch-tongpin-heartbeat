const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const suffix = Date.now();
const password = `Messages-${suffix}-password`;

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

async function main() {
  const userA = await register(`codex-messages-a-${suffix}@example.test`);
  const userB = await register(`codex-messages-b-${suffix}@example.test`);
  const userC = await register(`codex-messages-c-${suffix}@example.test`);

  const invite = await request("/api/pair-invites", {
    method: "POST",
    token: userA,
  });
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

  const empty = await request(`/api/messages?coupleId=${coupleId}`, {
    method: "POST",
    token: userA,
    body: { body: "   " },
  });
  assert(empty.response.status === 400, statusMessage("empty message", empty));

  const created = await request(`/api/messages?coupleId=${coupleId}`, {
    method: "POST",
    token: userA,
    body: { body: "hello from self-host messages" },
  });
  assert(created.response.status === 201, statusMessage("create message", created));
  const messageId = created.json.message?.id;
  assert(messageId, "message id missing");
  assert(created.json.message?.senderId, "message sender missing");

  const listedByPartner = await request(`/api/messages?coupleId=${coupleId}&limit=10`, {
    token: userB,
  });
  assert(listedByPartner.response.status === 200, statusMessage("partner list", listedByPartner));
  assert(listedByPartner.json.messages?.some((message) => message.id === messageId), "partner could not list message");

  const outsiderList = await request(`/api/messages?coupleId=${coupleId}`, {
    token: userC,
  });
  assert(outsiderList.response.status === 200, statusMessage("outsider list", outsiderList));
  assert((outsiderList.json.messages || []).length === 0, "outsider listed messages");

  const partnerDelete = await request("/api/messages/delete", {
    method: "POST",
    token: userB,
    body: { messageId },
  });
  assert(partnerDelete.response.status === 403, statusMessage("partner delete", partnerDelete));

  const deleted = await request("/api/messages/delete", {
    method: "POST",
    token: userA,
    body: { messageId },
  });
  assert(deleted.response.status === 200, statusMessage("sender delete", deleted));
  assert(deleted.json.message?.deletedAt, "deleted message missing deletedAt");

  const listAfterDelete = await request(`/api/messages?coupleId=${coupleId}`, {
    token: userB,
  });
  assert(listAfterDelete.response.status === 200, statusMessage("list after delete", listAfterDelete));
  assert(!listAfterDelete.json.messages?.some((message) => message.id === messageId), "deleted message still listed");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["pair_invite", "create", "partner_list", "outsider_empty", "delete_forbidden", "delete_sync"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
