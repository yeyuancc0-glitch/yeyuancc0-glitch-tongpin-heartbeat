const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const suffix = Date.now();
const password = `Dashboard-${suffix}-password`;
const historicalCheckinCount = 105;
const historicalListCount = 105;

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
  const userA = await register(`codex-dashboard-a-${suffix}@example.test`);
  const userB = await register(`codex-dashboard-b-${suffix}@example.test`);

  const initialDashboard = await request("/api/me/dashboard", { token: userA });
  assert(initialDashboard.response.status === 200, statusMessage("initial dashboard", initialDashboard));
  assert(initialDashboard.json.dashboard?.profile?.id, "initial dashboard profile missing");
  assert(initialDashboard.json.dashboard?.couple === null, "initial dashboard should not have couple");
  assert(Array.isArray(initialDashboard.json.dashboard?.pendingInvites), "initial dashboard pending invites missing");

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
    body: { body: "dashboard message" },
  });
  assert(message.response.status === 201, statusMessage("create message", message));
  for (let index = 0; index < 31; index += 1) {
    const extraMessage = await request(`/api/messages?coupleId=${coupleId}`, {
      method: "POST",
      token: userA,
      body: { body: `dashboard extra message ${index}` },
    });
    assert(extraMessage.response.status === 201, statusMessage(`create extra message ${index}`, extraMessage));
  }
  const historicalMessages = [];
  for (let index = 0; index < historicalListCount; index += 1) {
    const historicalMessage = await request(`/api/messages?coupleId=${coupleId}`, {
      method: "POST",
      token: userA,
      body: { body: `dashboard historical message ${index}` },
    });
    assert(historicalMessage.response.status === 201, statusMessage(`create historical message ${index}`, historicalMessage));
    historicalMessages.push(historicalMessage.json.message);
  }
  const checkin = await request("/api/checkins", {
    method: "POST",
    token: userA,
    body: { coupleId, checkinDate: "2026-06-24", content: "dashboard checkin" },
  });
  assert(checkin.response.status === 201, statusMessage("create checkin", checkin));
  const historicalCheckins = [];
  for (let index = 0; index < historicalCheckinCount; index += 1) {
    const historical = await request("/api/checkins", {
      method: "POST",
      token: userA,
      body: { coupleId, checkinDate: dateDaysBefore("2026-06-23", index), content: `dashboard historical checkin ${index}` },
    });
    assert(historical.response.status === 201, statusMessage(`create historical checkin ${index}`, historical));
    historicalCheckins.push(historical.json.checkin);
  }
  const historicalLetters = [];
  for (let index = 0; index < historicalListCount; index += 1) {
    const letter = await request("/api/letters", {
      method: "POST",
      token: userA,
      body: {
        coupleId,
        title: `dashboard historical letter ${index}`,
        body: `dashboard historical letter body ${index}`,
        unlockAt: timeMinutesBefore("2026-06-25T00:00:00", index),
      },
    });
    assert(letter.response.status === 201, statusMessage(`create historical letter ${index}`, letter));
    historicalLetters.push(letter.json.letter);
  }
  const event = await request("/api/calendar-events", {
    method: "POST",
    token: userA,
    body: { coupleId, title: "dashboard event", eventDate: "2026-06-24", type: "date" },
  });
  assert(event.response.status === 201, statusMessage("create event", event));
  const historicalEvents = [];
  for (let index = 0; index < historicalListCount; index += 1) {
    const historicalEvent = await request("/api/calendar-events", {
      method: "POST",
      token: userA,
      body: {
        coupleId,
        title: `dashboard historical event ${index}`,
        eventDate: dateDaysBefore("2026-06-23", index),
        type: "date",
      },
    });
    assert(historicalEvent.response.status === 201, statusMessage(`create historical event ${index}`, historicalEvent));
    historicalEvents.push(historicalEvent.json.event);
  }
  const historicalFootprints = [];
  for (let index = 0; index < historicalListCount; index += 1) {
    const footprint = await request("/api/footprints", {
      method: "POST",
      token: userA,
      body: {
        coupleId,
        title: `dashboard historical footprint ${index}`,
        note: `dashboard historical footprint note ${index}`,
        visitedAt: dateDaysBefore("2026-06-23", index),
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
        actionLabel: `dashboard historical action ${index}`,
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
  assert(dashboard.json.dashboard?.messages?.length >= historicalMessages.length + 32, "dashboard should include historical messages beyond old dashboard limits");
  for (const historicalMessage of historicalMessages) {
    assert(dashboard.json.dashboard?.messages?.some((item) => item.id === historicalMessage.id), `dashboard historical message missing: ${historicalMessage.id}`);
  }
  assert(dashboard.json.dashboard?.checkins?.some((item) => item.id === checkin.json.checkin.id), "dashboard checkin missing");
  assert(dashboard.json.dashboard?.checkins?.length >= historicalCheckins.length + 1, "dashboard should include historical checkins beyond the old memory preview and 100-item dashboard limits");
  for (const historical of historicalCheckins) {
    assert(dashboard.json.dashboard?.checkins?.some((item) => item.id === historical.id), `dashboard historical checkin missing: ${historical.id}`);
  }
  assert(dashboard.json.dashboard?.letters?.length >= historicalLetters.length, "dashboard should include historical letters beyond old dashboard limits");
  for (const historicalLetter of historicalLetters) {
    assert(dashboard.json.dashboard?.letters?.some((item) => item.id === historicalLetter.id), `dashboard historical letter missing: ${historicalLetter.id}`);
  }
  assert(dashboard.json.dashboard?.events?.some((item) => item.id === event.json.event.id), "dashboard event missing");
  assert(dashboard.json.dashboard?.events?.length >= historicalEvents.length + 1, "dashboard should include historical events beyond old dashboard limits");
  for (const historicalEvent of historicalEvents) {
    assert(dashboard.json.dashboard?.events?.some((item) => item.id === historicalEvent.id), `dashboard historical event missing: ${historicalEvent.id}`);
  }
  assert(dashboard.json.dashboard?.footprints?.length >= historicalFootprints.length, "dashboard should include historical footprints beyond old dashboard limits");
  for (const historicalFootprint of historicalFootprints) {
    assert(dashboard.json.dashboard?.footprints?.some((item) => item.id === historicalFootprint.id), `dashboard historical footprint missing: ${historicalFootprint.id}`);
  }
  assert(dashboard.json.dashboard?.creationActions?.length >= historicalActions.length, "dashboard should include historical creation actions beyond old dashboard limits");
  for (const historicalAction of historicalActions) {
    assert(dashboard.json.dashboard?.creationActions?.some((item) => item.id === historicalAction.id), `dashboard historical creation action missing: ${historicalAction.id}`);
  }
  assert(Array.isArray(dashboard.json.dashboard?.notifications), "dashboard notifications missing");

  const directMessages = await request(`/api/messages?coupleId=${coupleId}`, { token: userB });
  assert(directMessages.response.status === 200, statusMessage("direct messages default list", directMessages));
  assert(directMessages.json.messages?.length >= historicalMessages.length + 32, "direct messages default list should not use old preview limit");
  const directCheckins = await request(`/api/checkins?coupleId=${coupleId}`, { token: userB });
  assert(directCheckins.response.status === 200, statusMessage("direct checkins default list", directCheckins));
  assert(directCheckins.json.checkins?.length >= historicalCheckins.length + 1, "direct checkins default list should include historical checkins");
  const directLetters = await request(`/api/letters?coupleId=${coupleId}`, { token: userB });
  assert(directLetters.response.status === 200, statusMessage("direct letters default list", directLetters));
  assert(directLetters.json.letters?.length >= historicalLetters.length, "direct letters default list should not use old preview limit");
  const directEvents = await request(`/api/calendar-events?coupleId=${coupleId}`, { token: userB });
  assert(directEvents.response.status === 200, statusMessage("direct events default list", directEvents));
  assert(directEvents.json.events?.length >= historicalEvents.length + 1, "direct events default list should not use old preview limit");
  const directFootprints = await request(`/api/footprints?coupleId=${coupleId}`, { token: userB });
  assert(directFootprints.response.status === 200, statusMessage("direct footprints default list", directFootprints));
  assert(directFootprints.json.footprints?.length >= historicalFootprints.length, "direct footprints default list should not use old preview limit");
  const directActions = await request(`/api/creation/actions?coupleId=${coupleId}`, { token: userB });
  assert(directActions.response.status === 200, statusMessage("direct creation actions default list", directActions));
  assert(directActions.json.creationActions?.length >= historicalActions.length, "direct creation actions default list should not use old preview limit");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["profile_without_couple", "pending_invites", "paired_dashboard", "members", "historical_messages_above_100", "historical_checkins_above_100", "historical_letters_above_100", "historical_events_above_100", "historical_footprints_above_100", "historical_creation_actions_above_100", "direct_default_lists_above_old_preview_limits"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
