const baseUrl = process.env.API_BASE_URL || process.env.EXPO_PUBLIC_SELF_HOST_API_URL || "https://api-staging.fancah.tech";
const suffix = Date.now();
const password = `App-Dashboard-${suffix}-password`;
const historicalCheckinCount = 105;
const historicalListCount = 105;

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

function dateDaysBefore(baseDate, daysBefore) {
  const date = new Date(`${baseDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - daysBefore);
  return date.toISOString().slice(0, 10);
}

function timeMinutesBefore(baseDateTime, minutesBefore) {
  const date = new Date(`${baseDateTime}Z`);
  date.setUTCMinutes(date.getUTCMinutes() - minutesBefore);
  return date.toISOString();
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
  const userA = await register(`codex-app-dashboard-a-${suffix}@example.test`);
  const userB = await register(`codex-app-dashboard-b-${suffix}@example.test`);

  const empty = await request("/api/me/dashboard", { token: userA });
  assert(empty.response.status === 200, statusMessage("empty dashboard", empty));
  assert(empty.json.dashboard?.profile?.id, "dashboard profile missing");
  assert(empty.json.dashboard?.couple === null, "dashboard couple should start empty");
  assert(Array.isArray(empty.json.dashboard?.pendingInvites), "dashboard pending invites missing");

  const invite = await request("/api/pair-invites", { method: "POST", token: userA });
  assert(invite.response.status === 201, statusMessage("create invite", invite));
  const inviteDashboard = await request("/api/me/dashboard", { token: userA });
  assert(inviteDashboard.response.status === 200, statusMessage("invite dashboard", inviteDashboard));
  assert(inviteDashboard.json.dashboard?.pendingInvites?.some((item) => item.id === invite.json.invite.id), "dashboard pending invite missing after create");
  assert(inviteDashboard.json.dashboard?.pendingInvites?.[0]?.inviteCode === invite.json.invite.inviteCode, "dashboard pending invite code mismatch");
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

  const message = await request(`/api/messages?coupleId=${coupleId}`, {
    method: "POST",
    token: userA,
    body: { body: "app dashboard message" },
  });
  assert(message.response.status === 201, statusMessage("create message", message));
  const historicalCheckins = [];
  for (let index = 0; index < historicalCheckinCount; index += 1) {
    const checkin = await request("/api/checkins", {
      method: "POST",
      token: userA,
      body: { coupleId, checkinDate: dateDaysBefore("2026-06-24", index), content: `app dashboard historical checkin ${index}` },
    });
    assert(checkin.response.status === 201, statusMessage(`create historical checkin ${index}`, checkin));
    historicalCheckins.push(checkin.json.checkin);
  }
  for (let index = 0; index < 31; index += 1) {
    const extraMessage = await request(`/api/messages?coupleId=${coupleId}`, {
      method: "POST",
      token: userA,
      body: { body: `app dashboard extra message ${index}` },
    });
    assert(extraMessage.response.status === 201, statusMessage(`create extra message ${index}`, extraMessage));
  }
  const historicalLetters = [];
  for (let index = 0; index < historicalListCount; index += 1) {
    const letter = await request("/api/letters", {
      method: "POST",
      token: userA,
      body: {
        coupleId,
        title: `app dashboard historical letter ${index}`,
        body: `app dashboard historical letter body ${index}`,
        unlockAt: timeMinutesBefore("2026-06-25T00:00:00", index),
      },
    });
    assert(letter.response.status === 201, statusMessage(`create historical letter ${index}`, letter));
    historicalLetters.push(letter.json.letter);
  }
  const historicalFootprints = [];
  for (let index = 0; index < historicalListCount; index += 1) {
    const footprint = await request("/api/footprints", {
      method: "POST",
      token: userA,
      body: {
        coupleId,
        title: `app dashboard historical footprint ${index}`,
        note: `app dashboard historical footprint note ${index}`,
        visitedAt: dateDaysBefore("2026-06-24", index),
      },
    });
    assert(footprint.response.status === 201, statusMessage(`create historical footprint ${index}`, footprint));
    historicalFootprints.push(footprint.json.footprint);
  }
  const historicalActions = [];
  for (let index = 0; index < historicalListCount; index += 1) {
    const action = await request("/api/creation/actions", {
      method: "POST",
      token: userA,
      body: {
        coupleId,
        actionType: "memory_update",
        actionLabel: `app dashboard historical action ${index}`,
        metadata: { index },
      },
    });
    assert(action.response.status === 201, statusMessage(`create historical action ${index}`, action));
    historicalActions.push(action.json.creationAction);
  }

  const dashboard = await request("/api/me/dashboard", { token: userB });
  assert(dashboard.response.status === 200, statusMessage("paired dashboard", dashboard));
  assert(dashboard.json.dashboard?.couple?.id === coupleId, "dashboard couple mismatch");
  assert(dashboard.json.dashboard?.couple?.members?.length === 2, "dashboard members missing");
  assert(dashboard.json.dashboard?.messages?.some((item) => item.id === message.json.message.id), "dashboard message missing");
  assert(dashboard.json.dashboard?.messages?.length >= 32, "dashboard should include more than the old 30-message limit");
  assert(dashboard.json.dashboard?.checkins?.length >= historicalCheckins.length, "dashboard should include historical checkins beyond the old memory preview and 100-item dashboard limits");
  for (const checkin of historicalCheckins) {
    assert(dashboard.json.dashboard?.checkins?.some((item) => item.id === checkin.id), `dashboard historical checkin missing: ${checkin.id}`);
  }
  assert(dashboard.json.dashboard?.letters?.length >= historicalLetters.length, "dashboard should include historical letters beyond old dashboard limits");
  for (const letter of historicalLetters) {
    assert(dashboard.json.dashboard?.letters?.some((item) => item.id === letter.id), `dashboard historical letter missing: ${letter.id}`);
  }
  assert(dashboard.json.dashboard?.footprints?.length >= historicalFootprints.length, "dashboard should include historical footprints beyond old dashboard limits");
  for (const footprint of historicalFootprints) {
    assert(dashboard.json.dashboard?.footprints?.some((item) => item.id === footprint.id), `dashboard historical footprint missing: ${footprint.id}`);
  }
  assert(dashboard.json.dashboard?.creationActions?.length >= historicalActions.length, "dashboard should include historical creation actions beyond old dashboard limits");
  for (const action of historicalActions) {
    assert(dashboard.json.dashboard?.creationActions?.some((item) => item.id === action.id), `dashboard historical creation action missing: ${action.id}`);
  }
  assert(Array.isArray(dashboard.json.dashboard?.media), "dashboard media missing");
  assert(Array.isArray(dashboard.json.dashboard?.notifications), "dashboard notifications missing");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["empty_dashboard", "pending_invites", "paired_dashboard", "members", "messages", "dashboard_limit_above_30", "historical_checkins_above_100", "historical_letters_above_100", "historical_footprints_above_100", "historical_creation_actions_above_100", "arrays"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
