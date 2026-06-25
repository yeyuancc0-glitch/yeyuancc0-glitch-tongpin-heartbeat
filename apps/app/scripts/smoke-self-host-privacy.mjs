const baseUrl = process.env.API_BASE_URL || process.env.EXPO_PUBLIC_SELF_HOST_API_URL || "https://api-staging.fancah.tech";
const suffix = Date.now();
const password = `App-Privacy-${suffix}-password`;

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

async function register(email) {
  const result = await request("/api/auth/register", {
    method: "POST",
    body: { email, password, displayName: email.split("@")[0] },
  });
  assert(result.response.status === 201, `register ${email} returned ${result.response.status}`);
  return result.json.session.accessToken;
}

async function pair(userA, userB) {
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
  return accepted.json.couple.id;
}

async function main() {
  const userA = await register(`codex-app-privacy-a-${suffix}@example.test`);
  const userB = await register(`codex-app-privacy-b-${suffix}@example.test`);
  const userC = await register(`codex-app-privacy-c-${suffix}@example.test`);
  const coupleId = await pair(userA, userB);
  const partnerMe = await request("/api/me", { token: userB });
  assert(partnerMe.response.status === 200, statusMessage("partner me", partnerMe));

  const feedback = await request("/api/feedback", {
    method: "POST",
    token: userA,
    body: {
      body: "app privacy smoke feedback",
      coupleId,
      metadata: { source: "app-smoke" },
    },
  });
  assert(feedback.response.status === 201, statusMessage("feedback", feedback));

  const report = await request("/api/reports", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      reportedUserId: partnerMe.json.user.id,
      reason: "app privacy smoke report",
    },
  });
  assert(report.response.status === 201, statusMessage("report", report));

  const outsiderReport = await request("/api/reports", {
    method: "POST",
    token: userC,
    body: {
      coupleId,
      reportedUserId: partnerMe.json.user.id,
      reason: "outsider report",
    },
  });
  assert(outsiderReport.response.status === 403, statusMessage("outsider report", outsiderReport));

  const ended = await request("/api/couples/active/end", {
    method: "POST",
    token: userA,
  });
  assert(ended.response.status === 200, statusMessage("end couple", ended));

  const userD = await register(`codex-app-privacy-d-${suffix}@example.test`);
  const userE = await register(`codex-app-privacy-e-${suffix}@example.test`);
  await pair(userD, userE);
  const blocked = await request("/api/privacy/block-partner", {
    method: "POST",
    token: userD,
    body: { reason: "app privacy smoke block" },
  });
  assert(blocked.response.status === 200, statusMessage("block partner", blocked));

  const userF = await register(`codex-app-privacy-f-${suffix}@example.test`);
  const deletion = await request("/api/privacy/account-deletion", {
    method: "POST",
    token: userF,
    body: { reason: "app privacy smoke deletion" },
  });
  assert(deletion.response.status === 202, statusMessage("account deletion", deletion));
  const meAfterDeletion = await request("/api/me", { token: userF });
  assert(meAfterDeletion.response.status === 401, statusMessage("me after deletion", meAfterDeletion));

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    checks: ["feedback", "report", "outsider_report_forbidden", "end_couple", "block_partner", "account_deletion"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) {
    console.error(error.cause);
  }
  process.exit(1);
});
