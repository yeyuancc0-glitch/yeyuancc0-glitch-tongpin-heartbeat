const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const suffix = Date.now();
const password = `Checkins-${suffix}-password`;
const today = "2026-06-24";

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
  const userA = await register(`codex-checkins-a-${suffix}@example.test`);
  const userB = await register(`codex-checkins-b-${suffix}@example.test`);
  const userC = await register(`codex-checkins-c-${suffix}@example.test`);

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
      relationshipStartedAt: today,
    },
  });
  assert(accepted.response.status === 200, statusMessage("accept invite", accepted));
  const coupleId = accepted.json.couple?.id;
  assert(isUuid(coupleId), `couple id invalid: ${JSON.stringify(accepted.json)}`);

  const empty = await request("/api/checkins", {
    method: "POST",
    token: userA,
    body: { coupleId, checkinDate: today, content: "x".repeat(2001) },
  });
  assert(empty.response.status === 400, statusMessage("too long checkin", empty));

  const created = await request("/api/checkins", {
    method: "POST",
    token: userA,
    body: { coupleId, checkinDate: today, content: "开心｜hello from checkins" },
  });
  assert(created.response.status === 201, statusMessage("create checkin", created));
  const checkinId = created.json.checkin?.id;
  assert(isUuid(checkinId), `checkin id invalid: ${JSON.stringify(created.json)}`);

  const updated = await request("/api/checkins", {
    method: "POST",
    token: userA,
    body: { coupleId, checkinDate: today, content: "想你｜updated checkin" },
  });
  assert(updated.response.status === 201, statusMessage("update checkin", updated));
  assert(updated.json.checkin?.id === checkinId, "same-day upsert created a second checkin");
  assert(updated.json.checkin?.content === "想你｜updated checkin", "checkin content was not updated");

  const mood = await request("/api/mood-status", {
    method: "POST",
    token: userA,
    body: { coupleId, mood: "想你", note: "updated checkin" },
  });
  assert(mood.response.status === 200, statusMessage("upsert mood", mood));
  assert(mood.json.moodStatus?.mood === "想你", "mood was not saved");

  const listedByPartner = await request(`/api/checkins?coupleId=${coupleId}&limit=10`, {
    token: userB,
  });
  assert(listedByPartner.response.status === 200, statusMessage("partner list checkins", listedByPartner));
  assert(listedByPartner.json.checkins?.some((checkin) => checkin.id === checkinId), "partner could not list checkin");

  const moodByPartner = await request(`/api/mood-status?coupleId=${coupleId}`, {
    token: userB,
  });
  assert(moodByPartner.response.status === 200, statusMessage("partner list moods", moodByPartner));
  assert(moodByPartner.json.moodStatuses?.some((item) => item.mood === "想你"), "partner could not list mood");

  const outsiderList = await request(`/api/checkins?coupleId=${coupleId}`, {
    token: userC,
  });
  assert(outsiderList.response.status === 200, statusMessage("outsider list", outsiderList));
  assert((outsiderList.json.checkins || []).length === 0, "outsider listed checkins");

  const partnerDelete = await request("/api/checkins/delete", {
    method: "POST",
    token: userB,
    body: { checkinId },
  });
  assert(partnerDelete.response.status === 403, statusMessage("partner delete", partnerDelete));

  const deleted = await request("/api/checkins/delete", {
    method: "POST",
    token: userA,
    body: { checkinId },
  });
  assert(deleted.response.status === 200, statusMessage("author delete", deleted));
  assert(deleted.json.checkin?.deletedAt, "deleted checkin missing deletedAt");

  const listAfterDelete = await request(`/api/checkins?coupleId=${coupleId}`, {
    token: userB,
  });
  assert(listAfterDelete.response.status === 200, statusMessage("list after delete", listAfterDelete));
  assert(!listAfterDelete.json.checkins?.some((checkin) => checkin.id === checkinId), "deleted checkin still listed");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["pair_invite", "upsert_checkin", "upsert_mood", "partner_list", "outsider_empty", "delete_forbidden", "soft_delete"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
