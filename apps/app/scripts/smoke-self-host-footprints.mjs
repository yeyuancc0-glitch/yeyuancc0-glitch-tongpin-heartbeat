const baseUrl = process.env.API_BASE_URL || process.env.EXPO_PUBLIC_SELF_HOST_API_URL || "https://api-staging.fancah.tech";
const suffix = Date.now();
const password = `App-Footprints-${suffix}-password`;

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
  const userA = await register(`codex-app-footprints-a-${suffix}@example.test`);
  const userB = await register(`codex-app-footprints-b-${suffix}@example.test`);

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

  const created = await request("/api/footprints", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      title: "app self-host footprint smoke",
      note: "privacy safe note",
      visitedAt: "2026-07-06",
    },
  });
  assert(created.response.status === 201, statusMessage("create footprint", created));
  const footprintId = created.json.footprint?.id;
  assert(isUuid(footprintId), "footprint id missing");

  const listed = await request(`/api/footprints?coupleId=${coupleId}&limit=10`, { token: userB });
  assert(listed.response.status === 200, statusMessage("list footprints", listed));
  assert(listed.json.footprints?.some((footprint) => footprint.id === footprintId), "footprint missing from partner list");

  const partnerDelete = await request("/api/footprints/delete", {
    method: "POST",
    token: userB,
    body: { footprintId },
  });
  assert(partnerDelete.response.status === 403, statusMessage("partner delete", partnerDelete));

  const deleted = await request("/api/footprints/delete", {
    method: "POST",
    token: userA,
    body: { footprintId },
  });
  assert(deleted.response.status === 200, statusMessage("delete", deleted));

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["register", "pair_invite", "create", "list", "creator_only_delete"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) {
    console.error(error.cause);
  }
  process.exit(1);
});
