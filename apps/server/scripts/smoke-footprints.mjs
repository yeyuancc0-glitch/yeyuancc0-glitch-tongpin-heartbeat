const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const suffix = Date.now();
const password = `Footprints-${suffix}-password`;

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
  const userA = await register(`codex-footprints-a-${suffix}@example.test`);
  const userB = await register(`codex-footprints-b-${suffix}@example.test`);
  const userC = await register(`codex-footprints-c-${suffix}@example.test`);

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

  const invalidCoordinates = await request("/api/footprints", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      title: "bad coordinates",
      visitedAt: "2026-07-04",
      latitude: 31.2,
    },
  });
  assert(invalidCoordinates.response.status === 400, statusMessage("invalid coordinates", invalidCoordinates));

  const created = await request("/api/footprints", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      title: "晚风桥边",
      note: "只保存低敏文字",
      visitedAt: "2026-07-04",
    },
  });
  assert(created.response.status === 201, statusMessage("create footprint", created));
  const footprintId = created.json.footprint?.id;
  assert(isUuid(footprintId), `footprint id invalid: ${JSON.stringify(created.json)}`);

  const createdWithCoordinates = await request("/api/footprints", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      title: "坐标足迹",
      visitedAt: "2026-07-04",
      latitude: 31.2,
      longitude: 121.5,
    },
  });
  assert(createdWithCoordinates.response.status === 201, statusMessage("create footprint with coordinates", createdWithCoordinates));
  const coordinateFootprintId = createdWithCoordinates.json.footprint?.id;
  assert(isUuid(coordinateFootprintId), `coordinate footprint id invalid: ${JSON.stringify(createdWithCoordinates.json)}`);

  const listedByPartner = await request(`/api/footprints?coupleId=${coupleId}&limit=10`, {
    token: userB,
  });
  assert(listedByPartner.response.status === 200, statusMessage("partner list", listedByPartner));
  assert(listedByPartner.json.footprints?.some((footprint) => footprint.id === footprintId), "partner could not list footprint");

  const outsiderList = await request(`/api/footprints?coupleId=${coupleId}`, {
    token: userC,
  });
  assert(outsiderList.response.status === 200, statusMessage("outsider list", outsiderList));
  assert((outsiderList.json.footprints || []).length === 0, "outsider listed footprints");

  const partnerUpdate = await request("/api/footprints/update", {
    method: "POST",
    token: userB,
    body: {
      footprintId,
      title: "partner update",
    },
  });
  assert(partnerUpdate.response.status === 403, statusMessage("partner update", partnerUpdate));

  const updated = await request("/api/footprints/update", {
    method: "POST",
    token: userA,
    body: {
      footprintId,
      title: "黄昏小路",
      visitedAt: "2026-07-05",
      note: null,
    },
  });
  assert(updated.response.status === 200, statusMessage("creator update", updated));
  assert(updated.json.footprint?.title === "黄昏小路", "updated title mismatch");
  assert(updated.json.footprint?.visitedAt === "2026-07-05", "updated date mismatch");

  const partialCoordinateUpdate = await request("/api/footprints/update", {
    method: "POST",
    token: userA,
    body: {
      footprintId: coordinateFootprintId,
      latitude: 31.25,
    },
  });
  assert(partialCoordinateUpdate.response.status === 200, statusMessage("partial coordinate update", partialCoordinateUpdate));
  assert(partialCoordinateUpdate.json.footprint?.latitude === 31.25, "partial latitude update mismatch");
  assert(partialCoordinateUpdate.json.footprint?.longitude === 121.5, "partial longitude should be preserved");

  const halfCoordinateUpdate = await request("/api/footprints/update", {
    method: "POST",
    token: userA,
    body: {
      footprintId,
      latitude: 31.2,
    },
  });
  assert(halfCoordinateUpdate.response.status === 400, statusMessage("half coordinate update", halfCoordinateUpdate));

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
  assert(deleted.response.status === 200, statusMessage("creator delete", deleted));
  assert(deleted.json.footprint?.deletedAt, "deleted footprint missing deletedAt");

  const listAfterDelete = await request(`/api/footprints?coupleId=${coupleId}`, {
    token: userB,
  });
  assert(listAfterDelete.response.status === 200, statusMessage("list after delete", listAfterDelete));
  assert(!listAfterDelete.json.footprints?.some((footprint) => footprint.id === footprintId), "deleted footprint still listed");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["pair_invite", "create", "partner_list", "outsider_empty", "creator_only_update", "partial_coordinate_update", "half_coordinate_rejected", "creator_only_delete", "soft_delete"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
