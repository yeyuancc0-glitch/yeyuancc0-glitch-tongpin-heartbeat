const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const suffix = Date.now();
const password = `Creation-${suffix}-password`;

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
  const userA = await register(`codex-creation-a-${suffix}@example.test`);
  const userB = await register(`codex-creation-b-${suffix}@example.test`);
  const userC = await register(`codex-creation-c-${suffix}@example.test`);

  const noCoupleSpace = await request("/api/creation/space", { token: userA });
  assert(noCoupleSpace.response.status === 200, statusMessage("no couple creation space", noCoupleSpace));
  assert(noCoupleSpace.json.creationSpace === null, "user without couple should not get creation space");

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

  const ensured = await request("/api/creation/space", {
    method: "POST",
    token: userA,
    body: { coupleId },
  });
  assert(ensured.response.status === 201, statusMessage("ensure creation space", ensured));
  assert(ensured.json.creationSpace?.coupleId === coupleId, "creation space couple mismatch");
  assert(ensured.json.creationSpace?.lastWorldDecision && !Array.isArray(ensured.json.creationSpace.lastWorldDecision), "world decision must be object");

  const partnerSpace = await request(`/api/creation/space?coupleId=${coupleId}`, { token: userB });
  assert(partnerSpace.response.status === 200, statusMessage("partner creation space", partnerSpace));
  assert(partnerSpace.json.creationSpace?.id === ensured.json.creationSpace.id, "partner creation space mismatch");

  const outsiderSpace = await request(`/api/creation/space?coupleId=${coupleId}`, { token: userC });
  assert(outsiderSpace.response.status === 403, statusMessage("outsider creation space", outsiderSpace));

  const action = await request("/api/creation/actions", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      actionType: "pet",
      actionLabel: "轻轻摸摸",
      metadata: { surface: "pet_room" },
    },
  });
  assert(action.response.status === 201, statusMessage("record creation action", action));
  const actionId = action.json.creationAction?.id;
  assert(isUuid(actionId), "creation action id missing");

  const partnerActions = await request(`/api/creation/actions?coupleId=${coupleId}`, { token: userB });
  assert(partnerActions.response.status === 200, statusMessage("partner actions", partnerActions));
  assert(partnerActions.json.creationActions?.some((item) => item.id === actionId), "partner could not list action");

  const feed = await request("/api/creation/pet/feed", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      foodType: "basic",
    },
  });
  assert(feed.response.status === 200, statusMessage("feed pet", feed));
  assert(feed.json.creationSpace?.currentAction === "eat", "feed should set eat action");

  const clean = await request("/api/creation/pet/interact", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      interactionType: "clean",
    },
  });
  assert(clean.response.status === 200, statusMessage("clean pet", clean));
  assert(clean.json.creationSpace?.currentAction === "clean", "clean should set clean action");

  const sleep = await request("/api/creation/pet/interact", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      interactionType: "sleep",
    },
  });
  assert(sleep.response.status === 200, statusMessage("sleep pet", sleep));
  assert(sleep.json.creationSpace?.petSleepStartedAt, "sleep should set sleep start");

  const settleSleep = await request("/api/creation/pet/sleep/settle", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
    },
  });
  assert(settleSleep.response.status === 200, statusMessage("settle sleep", settleSleep));
  assert(settleSleep.json.creationSpace?.petSleepStartedAt, "early sleep settle should keep sleeping");

  const reward = await request("/api/creation/game/reward", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      puzzleId: "smoke-puzzle",
      solved: true,
    },
  });
  assert(reward.response.status === 200, statusMessage("claim puzzle reward", reward));
  assert(reward.json.creationSpace?.premiumFoodCount >= 1, "reward should add premium food");

  const duplicateReward = await request("/api/creation/game/reward", {
    method: "POST",
    token: userB,
    body: {
      coupleId,
      puzzleId: "smoke-puzzle",
      solved: true,
    },
  });
  assert(duplicateReward.response.status === 409, statusMessage("duplicate puzzle reward", duplicateReward));

  const buyFood = await request("/api/creation/pet/food/buy", {
    method: "POST",
    token: userB,
    body: {
      coupleId,
      foodType: "basic",
      quantity: 1,
    },
  });
  assert(buyFood.response.status === 200, statusMessage("buy food", buyFood));

  const summon = await request("/api/creation/pet/summon", {
    method: "POST",
    token: userB,
    body: {
      coupleId,
      surface: "pet_room",
    },
  });
  assert(summon.response.status === 200, statusMessage("summon pet", summon));
  assert(summon.json.creationSpace?.petWorldSurface === "pet_room", "summon should set pet room surface");

  const memory = await request("/api/creation/pet-memories", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      memoryType: "care_summary",
      memoryScope: "core",
      importance: 88,
      summary: "今天完成了自建家园数据 smoke。",
      metadata: { source: "smoke" },
    },
  });
  assert(memory.response.status === 201, statusMessage("create pet memory", memory));
  const memoryId = memory.json.petMemory?.id;
  assert(isUuid(memoryId), "pet memory id missing");
  assert(memory.json.petMemory?.importance === 88, "pet memory should preserve 0..100 importance");

  const dashboard = await request("/api/me/dashboard", { token: userB });
  assert(dashboard.response.status === 200, statusMessage("dashboard", dashboard));
  assert(dashboard.json.dashboard?.creationSpace?.id === ensured.json.creationSpace.id, "dashboard creation space missing");
  assert(dashboard.json.dashboard?.creationActions?.some((item) => item.id === actionId), "dashboard creation action missing");
  assert(dashboard.json.dashboard?.petMemories?.some((item) => item.id === memoryId), "dashboard pet memory missing");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["no_couple_null", "ensure_space", "partner_read", "outsider_forbidden", "actions", "pet_rules", "reward_idempotency", "pet_memory_importance_100_scale", "dashboard"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
