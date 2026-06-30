const baseUrl = process.env.API_BASE_URL || process.env.EXPO_PUBLIC_SELF_HOST_API_URL || "https://api-staging.fancah.tech";
const suffix = Date.now();
const password = `App-Profile-${suffix}-password`;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQYlWP4H1DxHx9mGBkKAIddsYGXrYvIAAAAAElFTkSuQmCC",
  "base64",
);

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
  const userA = await register(`codex-app-profile-a-${suffix}@example.test`);
  const userB = await register(`codex-app-profile-b-${suffix}@example.test`);
  const userC = await register(`codex-app-profile-c-${suffix}@example.test`);

  const updated = await request("/api/profile", {
    method: "POST",
    token: userA,
    body: {
      displayName: "App Profile",
      birthday: "2001-04-05",
    },
  });
  assert(updated.response.status === 200, statusMessage("profile update", updated));
  assert(updated.json.profile?.displayName === "App Profile", "display name mismatch");
  assert(updated.json.profile?.birthday === "2001-04-05", "birthday mismatch");

  const renamed = await request("/api/profile", {
    method: "POST",
    token: userA,
    body: {
      displayName: "App Profile Renamed",
    },
  });
  assert(renamed.response.status === 200, statusMessage("profile rename", renamed));
  assert(renamed.json.profile?.displayName === "App Profile Renamed", "profile rename mismatch");
  assert(renamed.json.profile?.birthday === "2001-04-05", "profile rename should not clear birthday");

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

  const dateUpdated = await request("/api/couples/active/dates", {
    method: "POST",
    token: userA,
    body: { relationshipStartedAt: "2026-07-02" },
  });
  assert(dateUpdated.response.status === 200, statusMessage("date update", dateUpdated));
  assert(dateUpdated.json.couple?.relationshipStartedAt === "2026-07-02", "relationship date mismatch");

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
  assert(avatarUpload.json.upload?.url, "avatar upload URL missing");
  assert(avatarUpload.json.thumbnailUpload?.url, "avatar thumbnail upload URL missing");
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
  assert(completedAvatar.json.profile?.avatarStoragePath, "avatar storage path missing");

  const partnerRead = await request("/api/profile/avatar/read-url", {
    method: "POST",
    token: userB,
    body: { userId: completedAvatar.json.profile.id, variant: "thumbnail" },
  });
  assert(partnerRead.response.status === 200, statusMessage("partner read avatar", partnerRead));

  const outsiderRead = await request("/api/profile/avatar/read-url", {
    method: "POST",
    token: userC,
    body: { userId: completedAvatar.json.profile.id, variant: "thumbnail" },
  });
  assert(outsiderRead.response.status === 403, statusMessage("outsider read avatar", outsiderRead));

  const deletedAvatar = await request("/api/profile/avatar/delete", {
    method: "POST",
    token: userA,
  });
  assert(deletedAvatar.response.status === 200, statusMessage("delete avatar", deletedAvatar));
  assert(deletedAvatar.json.profile?.avatarStoragePath === null, "avatar storage path should be cleared");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    checks: ["profile_update", "profile_patch_preserves_birthday", "pair_invite", "relationship_date_update", "avatar_upload", "avatar_partner_read", "avatar_delete"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) {
    console.error(error.cause);
  }
  process.exit(1);
});
