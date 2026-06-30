const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const suffix = Date.now();
const password = `Profile-${suffix}-password`;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQYlWP4H1DxHx9mGBkKAIddsYGXrYvIAAAAAElFTkSuQmCC",
  "base64",
);

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

function assertBrowserSafeUploadHeaders(headers, label) {
  assert(!Object.keys(headers || {}).some((key) => key.toLowerCase() === "content-length"), `${label} should not require content-length header`);
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
  const userA = await register(`codex-profile-a-${suffix}@example.test`);
  const userB = await register(`codex-profile-b-${suffix}@example.test`);
  const userC = await register(`codex-profile-c-${suffix}@example.test`);
  const userD = await register(`codex-profile-d-${suffix}@example.test`);
  const userE = await register(`codex-profile-e-${suffix}@example.test`);

  const profile = await request("/api/profile", { token: userA });
  assert(profile.response.status === 200, statusMessage("profile get", profile));
  assert(profile.json.profile?.id, "profile id missing");

  const invalidBirthday = await request("/api/profile", {
    method: "POST",
    token: userA,
    body: {
      displayName: "Codex Profile",
      birthday: "bad-date",
    },
  });
  assert(invalidBirthday.response.status === 400, statusMessage("invalid birthday", invalidBirthday));

  const updated = await request("/api/profile", {
    method: "POST",
    token: userA,
    body: {
      displayName: "Codex Profile",
      birthday: "2000-02-03",
    },
  });
  assert(updated.response.status === 200, statusMessage("profile update", updated));
  assert(updated.json.profile?.displayName === "Codex Profile", "display name mismatch");
  assert(updated.json.profile?.birthday === "2000-02-03", "birthday mismatch");

  const renamed = await request("/api/profile", {
    method: "POST",
    token: userA,
    body: {
      displayName: "Codex Profile Renamed",
    },
  });
  assert(renamed.response.status === 200, statusMessage("profile rename", renamed));
  assert(renamed.json.profile?.displayName === "Codex Profile Renamed", "profile rename mismatch");
  assert(renamed.json.profile?.birthday === "2000-02-03", "profile rename should not clear birthday");

  const clearedBirthday = await request("/api/profile", {
    method: "POST",
    token: userA,
    body: {
      displayName: "Codex Profile Renamed",
      birthday: null,
    },
  });
  assert(clearedBirthday.response.status === 200, statusMessage("clear birthday", clearedBirthday));
  assert(clearedBirthday.json.profile?.birthday === null, "explicit null should clear birthday");

  const noCoupleDate = await request("/api/couples/active/dates", {
    method: "POST",
    token: userA,
    body: { relationshipStartedAt: "2026-06-24" },
  });
  assert(noCoupleDate.response.status === 200, statusMessage("date without couple", noCoupleDate));
  assert(noCoupleDate.json.couple === null, "date without couple should return null");

  const snakeInvite = await request("/api/pair-invites", { method: "POST", token: userD });
  assert(snakeInvite.response.status === 201, `create snake invite returned ${snakeInvite.response.status}`);
  const snakeAccepted = await request("/api/pair-invites/accept", {
    method: "POST",
    token: userE,
    body: {
      inviteCode: snakeInvite.json.invite.inviteCode,
      relationship_started_at: "2026-05-20",
    },
  });
  assert(snakeAccepted.response.status === 200, statusMessage("accept invite snake case", snakeAccepted));
  assert(snakeAccepted.json.couple?.relationshipStartedAt === "2026-05-20", "snake_case accept should preserve relationship start date");
  const snakeProfile = await request("/api/profile", { token: userD });
  assert(snakeProfile.response.status === 200, statusMessage("snake profile get", snakeProfile));
  assert(snakeProfile.json.activeCouple?.relationshipStartedAt === "2026-05-20", "snake_case accept profile date mismatch");

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
  assert(accepted.json.couple?.relationshipStartedAt === "2026-06-24", "accept invite should return date key");
  const activeCouple = await request("/api/couples/active", { token: userB });
  assert(activeCouple.response.status === 200, statusMessage("active couple", activeCouple));
  assert(activeCouple.json.couple?.relationshipStartedAt === "2026-06-24", "active couple should return date key");

  const dateUpdated = await request("/api/couples/active/dates", {
    method: "POST",
    token: userA,
    body: { relationshipStartedAt: "2026-07-01" },
  });
  assert(dateUpdated.response.status === 200, statusMessage("date update", dateUpdated));
  assert(dateUpdated.json.couple?.relationshipStartedAt === "2026-07-01", "relationship start date mismatch");

  const tooLargeAvatar = await request("/api/profile/avatar/uploads", {
    method: "POST",
    token: userA,
    body: {
      mimeType: "image/png",
      sizeBytes: 4 * 1024 * 1024 + 1,
    },
  });
  assert(tooLargeAvatar.response.status === 413, statusMessage("oversized avatar", tooLargeAvatar));

  const avatarUpload = await request("/api/profile/avatar/uploads", {
    method: "POST",
    token: userA,
    body: {
      mimeType: "image/png",
      sizeBytes: png.length,
      thumbnailMimeType: "image/png",
      thumbnailSizeBytes: png.length,
    },
  });
  assert(avatarUpload.response.status === 201, statusMessage("avatar upload", avatarUpload));
  assert(avatarUpload.json.upload?.url, "avatar upload url missing");
  assert(avatarUpload.json.thumbnailUpload?.url, "avatar thumbnail upload url missing");
  assertBrowserSafeUploadHeaders(avatarUpload.json.upload.requiredHeaders, "avatar upload");
  assertBrowserSafeUploadHeaders(avatarUpload.json.thumbnailUpload.requiredHeaders, "avatar thumbnail upload");

  const putAvatar = await fetch(avatarUpload.json.upload.url, {
    method: "PUT",
    headers: avatarUpload.json.upload.requiredHeaders,
    body: png,
  });
  assert(putAvatar.ok, `avatar PUT returned ${putAvatar.status}`);

  const putThumbnail = await fetch(avatarUpload.json.thumbnailUpload.url, {
    method: "PUT",
    headers: avatarUpload.json.thumbnailUpload.requiredHeaders,
    body: png,
  });
  assert(putThumbnail.ok, `avatar thumbnail PUT returned ${putThumbnail.status}`);

  const completedAvatar = await request("/api/profile/avatar/uploads/complete", {
    method: "POST",
    token: userA,
    body: { avatarUploadId: avatarUpload.json.avatarUpload.id },
  });
  assert(completedAvatar.response.status === 200, statusMessage("complete avatar", completedAvatar));
  assert(completedAvatar.json.profile?.avatarStoragePath, "avatar storage path missing after complete");
  assert(completedAvatar.json.profile?.avatarThumbnailStoragePath, "avatar thumbnail storage path missing after complete");

  const partnerReadAvatar = await request("/api/profile/avatar/read-url", {
    method: "POST",
    token: userB,
    body: { userId: completedAvatar.json.profile.id, variant: "thumbnail" },
  });
  assert(partnerReadAvatar.response.status === 200, statusMessage("partner read avatar", partnerReadAvatar));
  const downloadedAvatar = await fetch(partnerReadAvatar.json.read.url);
  assert(downloadedAvatar.ok, `avatar read url returned ${downloadedAvatar.status}`);
  assert((await downloadedAvatar.arrayBuffer()).byteLength === png.length, "avatar downloaded size mismatch");

  const outsiderReadAvatar = await request("/api/profile/avatar/read-url", {
    method: "POST",
    token: userC,
    body: { userId: completedAvatar.json.profile.id, variant: "thumbnail" },
  });
  assert(outsiderReadAvatar.response.status === 403, statusMessage("outsider read avatar", outsiderReadAvatar));

  const deletedAvatar = await request("/api/profile/avatar/delete", {
    method: "POST",
    token: userA,
  });
  assert(deletedAvatar.response.status === 200, statusMessage("delete avatar", deletedAvatar));
  assert(deletedAvatar.json.profile?.avatarStoragePath === null, "avatar path should be cleared");

  const readDeletedAvatar = await request("/api/profile/avatar/read-url", {
    method: "POST",
    token: userA,
    body: { userId: deletedAvatar.json.profile.id, variant: "thumbnail" },
  });
  assert(readDeletedAvatar.response.status === 404, statusMessage("read deleted avatar", readDeletedAvatar));

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    checks: [
      "get",
      "update_profile",
      "profile_patch_preserves_birthday",
      "profile_patch_clears_birthday",
      "date_without_couple",
      "accept_invite_snake_case_date",
      "pair",
      "active_couple_date_key",
      "update_couple_date",
      "avatar_limits",
      "avatar_signed_upload",
      "avatar_partner_read",
      "avatar_outsider_forbidden",
      "avatar_delete",
    ],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
