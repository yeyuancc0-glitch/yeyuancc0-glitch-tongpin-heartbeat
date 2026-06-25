const baseUrl = process.env.API_BASE_URL || process.env.EXPO_PUBLIC_SELF_HOST_API_URL || "https://api-staging.fancah.tech";
const suffix = Date.now();
const password = `App-Checkins-${suffix}-password`;
const today = "2026-06-24";

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
  const userA = await register(`codex-app-checkins-a-${suffix}@example.test`);
  const userB = await register(`codex-app-checkins-b-${suffix}@example.test`);

  const invite = await request("/api/pair-invites", { method: "POST", token: userA });
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

  const created = await request("/api/checkins", {
    method: "POST",
    token: userA,
    body: { coupleId, checkinDate: today, content: "开心｜app self-host checkin smoke" },
  });
  assert(created.response.status === 201, statusMessage("create checkin", created));
  const checkinId = created.json.checkin?.id;
  assert(isUuid(checkinId), "checkin id missing");

  const mood = await request("/api/mood-status", {
    method: "POST",
    token: userA,
    body: { coupleId, mood: "开心", note: "app self-host checkin smoke" },
  });
  assert(mood.response.status === 200, statusMessage("create mood", mood));

  const listed = await request(`/api/checkins?coupleId=${coupleId}&limit=10`, { token: userB });
  assert(listed.response.status === 200, statusMessage("list checkins", listed));
  assert(listed.json.checkins?.some((checkin) => checkin.id === checkinId), "checkin missing from partner list");

  const listedMoods = await request(`/api/mood-status?coupleId=${coupleId}`, { token: userB });
  assert(listedMoods.response.status === 200, statusMessage("list moods", listedMoods));
  assert(listedMoods.json.moodStatuses?.some((item) => item.mood === "开心"), "mood missing from partner list");

  const deleted = await request("/api/checkins/delete", {
    method: "POST",
    token: userA,
    body: { checkinId },
  });
  assert(deleted.response.status === 200, statusMessage("delete", deleted));

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["register", "pair_invite", "checkin", "mood", "list", "delete"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) {
    console.error(error.cause);
  }
  process.exit(1);
});
