const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const suffix = Date.now();
const password = `Letters-${suffix}-password`;

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

async function pairUsers(userA, userB) {
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
  const userA = await register(`codex-letters-a-${suffix}@example.test`);
  const userB = await register(`codex-letters-b-${suffix}@example.test`);
  const userC = await register(`codex-letters-c-${suffix}@example.test`);
  const coupleId = await pairUsers(userA, userB);

  const empty = await request("/api/letters", {
    method: "POST",
    token: userA,
    body: { coupleId, body: "   " },
  });
  assert(empty.response.status === 400, statusMessage("empty letter", empty));

  const futureUnlock = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const future = await request("/api/letters", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      title: "未来信",
      body: "future secret body",
      unlockAt: futureUnlock,
    },
  });
  assert(future.response.status === 201, statusMessage("create future letter", future));
  const futureId = future.json.letter?.id;
  assert(isUuid(futureId), "future letter id missing");
  assert(future.json.letter?.body === "future secret body", "author should see own future letter body");

  const partnerFutureList = await request(`/api/letters?coupleId=${coupleId}`, { token: userB });
  assert(partnerFutureList.response.status === 200, statusMessage("partner list future", partnerFutureList));
  const partnerFuture = partnerFutureList.json.letters?.find((letter) => letter.id === futureId);
  assert(partnerFuture, "partner could not see future letter preview");
  assert(partnerFuture.isLocked === true, "future letter should be locked for recipient");
  assert(partnerFuture.body === null, "future letter leaked body to recipient");

  const readLocked = await request("/api/letters/read", {
    method: "POST",
    token: userB,
    body: { letterId: futureId },
  });
  assert(readLocked.response.status === 403, statusMessage("read locked", readLocked));

  const now = await request("/api/letters", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      title: "现在信",
      body: "hello readable letter",
      unlockAt: new Date(Date.now() - 1000).toISOString(),
    },
  });
  assert(now.response.status === 201, statusMessage("create now letter", now));
  const nowId = now.json.letter?.id;
  assert(isUuid(nowId), "now letter id missing");

  const partnerNowList = await request(`/api/letters?coupleId=${coupleId}`, { token: userB });
  assert(partnerNowList.response.status === 200, statusMessage("partner list now", partnerNowList));
  const partnerNow = partnerNowList.json.letters?.find((letter) => letter.id === nowId);
  assert(partnerNow?.body === "hello readable letter", "unlocked letter body missing for recipient");

  const read = await request("/api/letters/read", {
    method: "POST",
    token: userB,
    body: { letterId: nowId },
  });
  assert(read.response.status === 200, statusMessage("read now", read));
  assert(read.json.letter?.readAt, "read letter missing readAt");

  const dismissed = await request("/api/letters/dismiss", {
    method: "POST",
    token: userB,
    body: { letterId: nowId },
  });
  assert(dismissed.response.status === 200, statusMessage("dismiss", dismissed));
  assert(dismissed.json.letter?.dismissedAt, "dismissed letter missing dismissedAt");

  const outsiderList = await request(`/api/letters?coupleId=${coupleId}`, { token: userC });
  assert(outsiderList.response.status === 200, statusMessage("outsider list", outsiderList));
  assert((outsiderList.json.letters || []).length === 0, "outsider listed letters");

  const outsiderDelete = await request("/api/letters/delete", {
    method: "POST",
    token: userC,
    body: { letterId: futureId },
  });
  assert(outsiderDelete.response.status === 403, statusMessage("outsider delete", outsiderDelete));

  const authorDelete = await request("/api/letters/delete", {
    method: "POST",
    token: userA,
    body: { letterId: futureId },
  });
  assert(authorDelete.response.status === 200, statusMessage("author delete", authorDelete));
  assert(authorDelete.json.letter?.deletedAt, "author deleted letter missing deletedAt");

  const listAfterDelete = await request(`/api/letters?coupleId=${coupleId}`, { token: userB });
  assert(listAfterDelete.response.status === 200, statusMessage("list after delete", listAfterDelete));
  assert(!listAfterDelete.json.letters?.some((letter) => letter.id === futureId), "deleted letter still listed");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["pair_invite", "create", "locked_preview", "read_unlocked", "dismiss", "outsider_empty", "author_delete"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
