const baseUrl = process.env.API_BASE_URL || process.env.EXPO_PUBLIC_SELF_HOST_API_URL || "https://api-staging.fancah.tech";
const suffix = Date.now();
const password = `App-Creation-${suffix}-password`;

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
  const userA = await register(`codex-app-creation-a-${suffix}@example.test`);
  const userB = await register(`codex-app-creation-b-${suffix}@example.test`);

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
  assert(isUuid(coupleId), "couple id missing");

  const space = await request("/api/creation/space", {
    method: "POST",
    token: userA,
    body: { coupleId },
  });
  assert(space.response.status === 201, statusMessage("ensure creation space", space));
  assert(space.json.creationSpace?.coupleId === coupleId, "creation space couple mismatch");

  const footprint = await request("/api/footprints", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      title: "自建家园足迹",
      note: "front-end contract smoke",
      visitedAt: "2026-06-24",
    },
  });
  assert(footprint.response.status === 201, statusMessage("create footprint", footprint));
  const footprintId = footprint.json.footprint?.id;
  assert(isUuid(footprintId), "footprint id missing");

  const action = await request("/api/creation/actions", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      actionType: "footprint_add",
      actionLabel: "记录了足迹「自建家园足迹」",
      metadata: {},
    },
  });
  assert(action.response.status === 201, statusMessage("record action", action));
  const actionId = action.json.creationAction?.id;
  assert(isUuid(actionId), "creation action id missing");

  const feed = await request("/api/creation/pet/feed", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      foodType: "basic",
    },
  });
  assert(feed.response.status === 200, statusMessage("feed pet", feed));
  assert(feed.json.creationSpace?.currentAction === "eat", "feed action missing");

  const play = await request("/api/creation/pet/interact", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      interactionType: "play",
    },
  });
  assert(play.response.status === 200, statusMessage("play pet", play));
  assert(play.json.creationSpace?.currentAction === "play", "play action missing");

  const reward = await request("/api/creation/game/reward", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      puzzleId: "app-smoke-puzzle",
      solved: true,
    },
  });
  assert(reward.response.status === 200, statusMessage("claim puzzle reward", reward));
  assert(reward.json.creationSpace?.premiumFoodCount >= 1, "reward food missing");

  const summon = await request("/api/creation/pet/summon", {
    method: "POST",
    token: userB,
    body: {
      coupleId,
      surface: "pet_room",
    },
  });
  assert(summon.response.status === 200, statusMessage("summon pet", summon));
  assert(summon.json.creationSpace?.petWorldSurface === "pet_room", "summon surface mismatch");

  const dashboard = await request("/api/me/dashboard", { token: userB });
  assert(dashboard.response.status === 200, statusMessage("dashboard", dashboard));
  assert(dashboard.json.dashboard?.creationSpace?.coupleId === coupleId, "dashboard creation space missing");
  assert(dashboard.json.dashboard?.footprints?.some((item) => item.id === footprintId), "dashboard footprint missing");
  assert(dashboard.json.dashboard?.creationActions?.some((item) => item.id === actionId), "dashboard creation action missing");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["ensure_space", "create_footprint", "record_action", "pet_rules", "dashboard_creation"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
