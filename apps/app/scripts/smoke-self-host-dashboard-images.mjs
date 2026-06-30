const baseUrl = process.env.API_BASE_URL || process.env.EXPO_PUBLIC_SELF_HOST_API_URL || "https://api-staging.fancah.tech";
const suffix = Date.now();
const password = `App-Dashboard-Images-${suffix}-password`;
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

function assertDataImage(dataUrl, label) {
  assert(typeof dataUrl === "string" && dataUrl.startsWith("data:image/"), `${label} should be an inline image data URL`);
  const [, payload] = dataUrl.split(",", 2);
  assert(payload, `${label} data URL payload missing`);
  assert(Buffer.from(payload, "base64").byteLength > 0, `${label} data URL payload empty`);
}

async function assertDownloadableImage(url, label) {
  assert(typeof url === "string" && /^https?:\/\//i.test(url), `${label} signed URL missing`);
  const response = await fetch(url);
  assert(response.ok, `${label} signed URL returned ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  assert(contentType.startsWith("image/") || contentType === "application/octet-stream", `${label} content-type was ${contentType}`);
  assert((await response.arrayBuffer()).byteLength > 0, `${label} download was empty`);
}

async function register(email) {
  const result = await request("/api/auth/register", {
    method: "POST",
    body: { email, password, displayName: email.split("@")[0] },
  });
  assert(result.response.status === 201, `register ${email} returned ${result.response.status}`);
  assert(result.json.session?.accessToken, "register did not return access token");
  return result.json.session.accessToken;
}

async function putSignedUpload(upload, body, label) {
  assert(upload?.url, `${label} upload URL missing`);
  assertBrowserSafeUploadHeaders(upload.requiredHeaders, label);
  const response = await fetch(upload.url, {
    method: upload.method,
    headers: upload.requiredHeaders,
    body,
  });
  assert(response.ok, `${label} signed PUT returned ${response.status}`);
}

async function uploadAvatar(token) {
  const upload = await request("/api/profile/avatar/uploads", {
    method: "POST",
    token,
    body: {
      mimeType: "image/png",
      sizeBytes: png.length,
      thumbnailMimeType: "image/png",
      thumbnailSizeBytes: png.length,
    },
  });
  assert(upload.response.status === 201, statusMessage("avatar upload", upload));
  await putSignedUpload(upload.json.upload, png, "avatar original");
  await putSignedUpload(upload.json.thumbnailUpload, png, "avatar thumbnail");

  const complete = await request("/api/profile/avatar/uploads/complete", {
    method: "POST",
    token,
    body: { avatarUploadId: upload.json.avatarUpload.id },
  });
  assert(complete.response.status === 200, statusMessage("complete avatar", complete));
  assert(complete.json.profile?.avatarStoragePath, "avatar storage path missing");
  assert(complete.json.profile?.avatarThumbnailStoragePath, "avatar thumbnail path missing");
  return complete.json.profile;
}

async function uploadMedia(token, coupleId, { caption, withThumbnail }) {
  const upload = await request("/api/media/uploads", {
    method: "POST",
    token,
    body: {
      coupleId,
      mimeType: "image/png",
      sizeBytes: png.length,
      thumbnailMimeType: withThumbnail ? "image/png" : null,
      thumbnailSizeBytes: withThumbnail ? png.length : null,
      caption,
    },
  });
  assert(upload.response.status === 201, statusMessage(`media upload ${caption}`, upload));
  await putSignedUpload(upload.json.upload, png, `media original ${caption}`);
  if (withThumbnail) {
    await putSignedUpload(upload.json.thumbnailUpload, png, `media thumbnail ${caption}`);
  } else {
    assert(upload.json.thumbnailUpload === null, "thumbnail upload should be absent when thumbnail metadata is absent");
  }

  const complete = await request("/api/media/uploads/complete", {
    method: "POST",
    token,
    body: { mediaId: upload.json.media.id },
  });
  assert(complete.response.status === 200, statusMessage(`complete media ${caption}`, complete));
  if (!withThumbnail) {
    assert(complete.json.media?.thumbnailStoragePath, "server-generated media thumbnail path missing");
  }
  return complete.json.media;
}

function findMemberProfile(dashboard, userId) {
  return dashboard?.couple?.members?.find((member) => member.userId === userId)?.profile ?? null;
}

async function main() {
  const userAToken = await register(`codex-app-dashboard-images-a-${suffix}@example.test`);
  const userBToken = await register(`codex-app-dashboard-images-b-${suffix}@example.test`);

  const userAProfile = await uploadAvatar(userAToken);

  const invite = await request("/api/pair-invites", { method: "POST", token: userAToken });
  assert(invite.response.status === 201, statusMessage("create invite", invite));
  const accepted = await request("/api/pair-invites/accept", {
    method: "POST",
    token: userBToken,
    body: {
      inviteCode: invite.json.invite.inviteCode,
      relationshipStartedAt: "2026-06-24",
    },
  });
  assert(accepted.response.status === 200, statusMessage("accept invite", accepted));
  const coupleId = accepted.json.couple?.id;
  assert(coupleId, "couple id missing");

  const mediaWithThumbnail = await uploadMedia(userAToken, coupleId, {
    caption: "dashboard image smoke thumbnail",
    withThumbnail: true,
  });
  const mediaWithoutThumbnail = await uploadMedia(userAToken, coupleId, {
    caption: "dashboard image smoke server thumbnail",
    withThumbnail: false,
  });

  const dashboardA = await request("/api/me/dashboard", { token: userAToken });
  assert(dashboardA.response.status === 200, statusMessage("owner dashboard", dashboardA));
  const ownerProfile = dashboardA.json.dashboard?.profile;
  assert(ownerProfile?.avatarStoragePath === userAProfile.avatarStoragePath, "owner dashboard avatar path mismatch");
  assertDataImage(ownerProfile?.avatarThumbDataUrl, "owner dashboard avatar");

  const dashboardB = await request("/api/me/dashboard", { token: userBToken });
  assert(dashboardB.response.status === 200, statusMessage("partner dashboard", dashboardB));
  const partnerViewOfA = findMemberProfile(dashboardB.json.dashboard, userAProfile.id);
  assert(partnerViewOfA?.avatarStoragePath === userAProfile.avatarStoragePath, "partner dashboard avatar path mismatch");
  assertDataImage(partnerViewOfA?.avatarThumbDataUrl, "partner dashboard avatar");

  const dashboardMedia = dashboardB.json.dashboard?.media ?? [];
  const thumbMedia = dashboardMedia.find((item) => item.id === mediaWithThumbnail.id);
  const fallbackMedia = dashboardMedia.find((item) => item.id === mediaWithoutThumbnail.id);
  assert(thumbMedia, "dashboard media with thumbnail missing");
  assert(thumbMedia.thumbnailSignedUrl, "dashboard media thumbnail signed URL missing");
  assert(!thumbMedia.signedUrl, "dashboard media with thumbnail should not also sign original");
  await assertDownloadableImage(thumbMedia.thumbnailSignedUrl, "dashboard media thumbnail");
  assert(fallbackMedia, "dashboard media without thumbnail missing");
  assert(fallbackMedia.thumbnailSignedUrl, "dashboard server-generated media thumbnail signed URL missing");
  assert(!fallbackMedia.signedUrl, "dashboard server-generated thumbnail media should not also sign original");
  await assertDownloadableImage(fallbackMedia.thumbnailSignedUrl, "dashboard server-generated media thumbnail");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: [
      "avatar_upload",
      "dashboard_avatar_data_url_owner",
      "dashboard_avatar_data_url_partner",
      "dashboard_media_thumbnail_signed_url",
      "dashboard_media_server_generated_thumbnail_signed_url",
      "signed_image_downloads",
    ],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) {
    console.error(error.cause);
  }
  process.exit(1);
});
