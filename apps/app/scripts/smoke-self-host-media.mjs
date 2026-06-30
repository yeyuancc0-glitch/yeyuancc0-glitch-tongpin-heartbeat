const baseUrl = process.env.API_BASE_URL || process.env.EXPO_PUBLIC_SELF_HOST_API_URL || "https://api-staging.fancah.tech";
const suffix = Date.now();
const password = `App-Media-${suffix}-password`;
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

function assertBrowserSafeUploadHeaders(headers, label) {
  assert(!Object.keys(headers || {}).some((key) => key.toLowerCase() === "content-length"), `${label} should not require content-length header`);
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

async function main() {
  const userA = await register(`codex-app-media-a-${suffix}@example.test`);
  const userB = await register(`codex-app-media-b-${suffix}@example.test`);

  const invite = await request("/api/pair-invites", {
    method: "POST",
    token: userA,
  });
  assert(invite.response.status === 201, `create invite returned ${invite.response.status}`);

  const accept = await request("/api/pair-invites/accept", {
    method: "POST",
    token: userB,
    body: {
      inviteCode: invite.json.invite.inviteCode,
      relationshipStartedAt: "2026-06-24",
    },
  });
  assert(accept.response.status === 200, `accept invite returned ${accept.response.status}`);
  const coupleId = accept.json.couple?.id;
  assert(coupleId, "couple id missing");

  const upload = await request("/api/media/uploads", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      mimeType: "image/png",
      sizeBytes: png.length,
      thumbnailMimeType: "image/png",
      thumbnailSizeBytes: png.length,
      caption: "app self-host media smoke",
    },
  });
  assert(upload.response.status === 201, `create upload returned ${upload.response.status}`);
  assert(upload.json.thumbnailUpload?.url, "thumbnail upload URL missing");
  assertBrowserSafeUploadHeaders(upload.json.upload.requiredHeaders, "media upload");
  assertBrowserSafeUploadHeaders(upload.json.thumbnailUpload.requiredHeaders, "media thumbnail upload");

  const put = await fetch(upload.json.upload.url, {
    method: "PUT",
    headers: upload.json.upload.requiredHeaders,
    body: png,
  });
  assert(put.ok, `PUT signed upload returned ${put.status}`);
  const putThumbnail = await fetch(upload.json.thumbnailUpload.url, {
    method: "PUT",
    headers: upload.json.thumbnailUpload.requiredHeaders,
    body: png,
  });
  assert(putThumbnail.ok, `PUT signed thumbnail upload returned ${putThumbnail.status}`);

  const complete = await request("/api/media/uploads/complete", {
    method: "POST",
    token: userA,
    body: { mediaId: upload.json.media.id },
  });
  assert(complete.response.status === 200, `complete upload returned ${complete.response.status}`);

  const listed = await request(`/api/media?coupleId=${coupleId}&limit=10`, {
    token: userB,
  });
  assert(listed.response.status === 200, `list media returned ${listed.response.status}`);
  assert(listed.json.media?.some((item) => item.id === upload.json.media.id), "uploaded media missing from list");

  const read = await request("/api/media/read-url", {
    method: "POST",
    token: userB,
    body: { mediaId: upload.json.media.id, variant: "original" },
  });
  assert(read.response.status === 200, `read URL returned ${read.response.status}`);
  const download = await fetch(read.json.read.url);
  assert(download.ok, `signed read returned ${download.status}`);
  assert((await download.arrayBuffer()).byteLength === png.length, "downloaded size mismatch");

  const thumbnailRead = await request("/api/media/read-url", {
    method: "POST",
    token: userB,
    body: { mediaId: upload.json.media.id, variant: "thumbnail" },
  });
  assert(thumbnailRead.response.status === 200, `thumbnail read URL returned ${thumbnailRead.response.status}`);
  const thumbnailDownload = await fetch(thumbnailRead.json.read.url);
  assert(thumbnailDownload.ok, `signed thumbnail read returned ${thumbnailDownload.status}`);
  assert((await thumbnailDownload.arrayBuffer()).byteLength === png.length, "downloaded thumbnail size mismatch");

  const deleted = await request("/api/media/delete", {
    method: "POST",
    token: userA,
    body: { mediaId: upload.json.media.id },
  });
  assert(deleted.response.status === 200, `delete returned ${deleted.response.status}`);

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: ["register", "pair_invite", "signed_upload", "thumbnail_upload", "complete", "list", "read_url", "thumbnail_read_url", "delete"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) {
    console.error(error.cause);
  }
  process.exit(1);
});
