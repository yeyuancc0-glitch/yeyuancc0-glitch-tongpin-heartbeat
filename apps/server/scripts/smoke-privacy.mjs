const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const suffix = Date.now();
const password = `Privacy-${suffix}-password`;

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

async function register(email) {
  const result = await request("/api/auth/register", {
    method: "POST",
    body: { email, password, displayName: email.split("@")[0] },
  });
  assert(result.response.status === 201, `register ${email} returned ${result.response.status}`);
  return result.json.session.accessToken;
}

async function pair(userA, userB, date = "2026-06-24") {
  const invite = await request("/api/pair-invites", { method: "POST", token: userA });
  assert(invite.response.status === 201, statusMessage("create invite", invite));
  const accepted = await request("/api/pair-invites/accept", {
    method: "POST",
    token: userB,
    body: {
      inviteCode: invite.json.invite.inviteCode,
      relationshipStartedAt: date,
    },
  });
  assert(accepted.response.status === 200, statusMessage("accept invite", accepted));
  return accepted.json.couple.id;
}

async function main() {
  const userA = await register(`codex-privacy-a-${suffix}@example.test`);
  const userB = await register(`codex-privacy-b-${suffix}@example.test`);
  const userC = await register(`codex-privacy-c-${suffix}@example.test`);
  const coupleId = await pair(userA, userB);

  const userBMe = await request("/api/me", { token: userB });
  assert(userBMe.response.status === 200, statusMessage("partner me", userBMe));
  const partnerId = userBMe.json.user.id;

  const feedback = await request("/api/feedback", {
    method: "POST",
    token: userA,
    body: {
      body: "privacy smoke feedback",
      coupleId,
      metadata: { source: "smoke" },
    },
  });
  assert(feedback.response.status === 201, statusMessage("feedback", feedback));
  assert(feedback.json.feedback?.coupleId === coupleId, "feedback couple id mismatch");

  const report = await request("/api/reports", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      reportedUserId: partnerId,
      reason: "privacy smoke report",
    },
  });
  assert(report.response.status === 201, statusMessage("report partner", report));

  const outsiderReport = await request("/api/reports", {
    method: "POST",
    token: userC,
    body: {
      coupleId,
      reportedUserId: partnerId,
      reason: "outsider report",
    },
  });
  assert(outsiderReport.response.status === 403, statusMessage("outsider report", outsiderReport));

  const ended = await request("/api/couples/active/end", {
    method: "POST",
    token: userA,
  });
  assert(ended.response.status === 200, statusMessage("end couple", ended));
  assert(ended.json.couple?.status === "ended", "ended couple status mismatch");

  const writeOldCouple = await request("/api/messages", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      body: "should not write after end",
    },
  });
  assert(writeOldCouple.response.status === 403, statusMessage("write after end", writeOldCouple));

  const userD = await register(`codex-privacy-d-${suffix}@example.test`);
  const userE = await register(`codex-privacy-e-${suffix}@example.test`);
  const blockCoupleId = await pair(userD, userE, "2026-07-01");
  const blocked = await request("/api/privacy/block-partner", {
    method: "POST",
    token: userD,
    body: { reason: "privacy smoke block" },
  });
  assert(blocked.response.status === 200, statusMessage("block partner", blocked));
  assert(blocked.json.couple?.id === blockCoupleId, "blocked couple id mismatch");
  assert(blocked.json.block?.blockedUserId, "blocked user id missing");

  const userF = await register(`codex-privacy-f-${suffix}@example.test`);
  const userG = await register(`codex-privacy-g-${suffix}@example.test`);
  await pair(userF, userG, "2026-08-01");
  const deletion = await request("/api/privacy/account-deletion", {
    method: "POST",
    token: userF,
    body: { reason: "privacy smoke deletion" },
  });
  assert(deletion.response.status === 202, statusMessage("account deletion", deletion));
  assert(deletion.json.deletionRequest?.status === "requested", "deletion request status mismatch");
  assert(deletion.json.profile?.account_status === "deletion_requested", "profile account status mismatch");

  const meAfterDeletion = await request("/api/me", { token: userF });
  assert(meAfterDeletion.response.status === 401, statusMessage("me after deletion", meAfterDeletion));

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    checks: [
      "feedback",
      "report_partner",
      "outsider_report_forbidden",
      "end_couple",
      "write_after_end_forbidden",
      "block_partner",
      "account_deletion_revokes_session",
    ],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
