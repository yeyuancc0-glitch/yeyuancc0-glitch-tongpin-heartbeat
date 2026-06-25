const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const suffix = Date.now();
const password = `Calendar-${suffix}-password`;

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
  const userA = await register(`codex-calendar-a-${suffix}@example.test`);
  const userB = await register(`codex-calendar-b-${suffix}@example.test`);
  const userC = await register(`codex-calendar-c-${suffix}@example.test`);

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
      relationshipStartedAt: "2026-06-24",
    },
  });
  assert(accepted.response.status === 200, statusMessage("accept invite", accepted));
  const coupleId = accepted.json.couple?.id;
  assert(isUuid(coupleId), `couple id invalid: ${JSON.stringify(accepted.json)}`);

  const invalid = await request("/api/calendar-events", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      title: "bad type",
      eventDate: "2026-07-01",
      type: "birthday",
    },
  });
  assert(invalid.response.status === 400, statusMessage("invalid event", invalid));

  const created = await request("/api/calendar-events", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      title: "第一次自建日历事件",
      eventDate: "2026-07-01",
      type: "anniversary",
      note: "low sensitivity note",
      remind: true,
    },
  });
  assert(created.response.status === 201, statusMessage("create event", created));
  const eventId = created.json.event?.id;
  assert(isUuid(eventId), `event id invalid: ${JSON.stringify(created.json)}`);

  const listedByPartner = await request(`/api/calendar-events?coupleId=${coupleId}&limit=10`, {
    token: userB,
  });
  assert(listedByPartner.response.status === 200, statusMessage("partner list", listedByPartner));
  assert(listedByPartner.json.events?.some((event) => event.id === eventId), "partner could not list calendar event");

  const outsiderList = await request(`/api/calendar-events?coupleId=${coupleId}`, {
    token: userC,
  });
  assert(outsiderList.response.status === 200, statusMessage("outsider list", outsiderList));
  assert((outsiderList.json.events || []).length === 0, "outsider listed calendar events");

  const notificationList = await request(`/api/notifications?coupleId=${coupleId}&limit=10`, {
    token: userB,
  });
  assert(notificationList.response.status === 200, statusMessage("partner notification list", notificationList));
  assert(notificationList.json.notifications?.some((notification) => notification.relatedId === eventId), "calendar event notification missing");

  const updated = await request("/api/calendar-events/update", {
    method: "POST",
    token: userB,
    body: {
      eventId,
      title: "一起更新后的日历事件",
      eventDate: "2026-07-02",
      type: "date",
      note: null,
    },
  });
  assert(updated.response.status === 200, statusMessage("update event", updated));
  assert(updated.json.event?.title === "一起更新后的日历事件", "updated title mismatch");
  assert(updated.json.event?.eventDate === "2026-07-02", "updated date mismatch");

  const deleted = await request("/api/calendar-events/delete", {
    method: "POST",
    token: userA,
    body: { eventId },
  });
  assert(deleted.response.status === 200, statusMessage("delete event", deleted));
  assert(deleted.json.event?.deletedAt, "deleted event missing deletedAt");

  const listAfterDelete = await request(`/api/calendar-events?coupleId=${coupleId}`, {
    token: userB,
  });
  assert(listAfterDelete.response.status === 200, statusMessage("list after delete", listAfterDelete));
  assert(!listAfterDelete.json.events?.some((event) => event.id === eventId), "deleted event still listed");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["pair_invite", "create", "partner_list", "outsider_empty", "notification", "update", "soft_delete"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
