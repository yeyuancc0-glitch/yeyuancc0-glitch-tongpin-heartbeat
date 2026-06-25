const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const suffix = Date.now();
const password = `Storage-${suffix}-password`;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
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
  const userA = await register(`codex-storage-a-${suffix}@example.test`);
  const userB = await register(`codex-storage-b-${suffix}@example.test`);
  const userC = await register(`codex-storage-c-${suffix}@example.test`);

  const invite = await request("/api/pair-invites", {
    method: "POST",
    token: userA,
  });
  assert(invite.response.status === 201, `create invite returned ${invite.response.status}`);
  assert(invite.json.invite?.inviteCode, "invite code missing");

  const accepted = await request("/api/pair-invites/accept", {
    method: "POST",
    token: userB,
    body: {
      inviteCode: invite.json.invite.inviteCode,
      relationshipStartedAt: "2026-06-24",
    },
  });
  assert(accepted.response.status === 200, `accept invite returned ${accepted.response.status}`);
  const coupleId = accepted.json.couple?.id;
  assert(coupleId, "couple id missing");

  const tooLarge = await request("/api/media/uploads", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      mimeType: "image/png",
      sizeBytes: 8 * 1024 * 1024 + 1,
    },
  });
  assert(tooLarge.response.status === 413, `oversized upload returned ${tooLarge.response.status}`);

  const unsupported = await request("/api/media/uploads", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      mimeType: "text/plain",
      sizeBytes: png.length,
    },
  });
  assert(unsupported.response.status === 415, `unsupported upload returned ${unsupported.response.status}`);

  const upload = await request("/api/media/uploads", {
    method: "POST",
    token: userA,
    body: {
      coupleId,
      mimeType: "image/png",
      sizeBytes: png.length,
      thumbnailMimeType: "image/png",
      thumbnailSizeBytes: png.length,
      caption: "storage smoke",
    },
  });
  assert(upload.response.status === 201, `create upload returned ${upload.response.status}`);
  assert(upload.json.upload?.url, "upload URL missing");
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
  assert(complete.json.media?.uploadStatus === "ready", "media did not become ready");

  const list = await request(`/api/media?coupleId=${coupleId}`, {
    token: userB,
  });
  assert(list.response.status === 200, `list media returned ${list.response.status}`);
  assert(list.json.media?.some((item) => item.id === upload.json.media.id), "partner could not list media");

  const read = await request("/api/media/read-url", {
    method: "POST",
    token: userB,
    body: { mediaId: upload.json.media.id },
  });
  assert(read.response.status === 200, `read URL returned ${read.response.status}`);
  const downloaded = await fetch(read.json.read.url);
  assert(downloaded.ok, `signed read returned ${downloaded.status}`);
  assert((await downloaded.arrayBuffer()).byteLength === png.length, "downloaded size mismatch");

  const thumbnailRead = await request("/api/media/read-url", {
    method: "POST",
    token: userB,
    body: { mediaId: upload.json.media.id, variant: "thumbnail" },
  });
  assert(thumbnailRead.response.status === 200, `thumbnail read URL returned ${thumbnailRead.response.status}`);
  const downloadedThumbnail = await fetch(thumbnailRead.json.read.url);
  assert(downloadedThumbnail.ok, `signed thumbnail read returned ${downloadedThumbnail.status}`);
  assert((await downloadedThumbnail.arrayBuffer()).byteLength === png.length, "downloaded thumbnail size mismatch");

  const outsiderRead = await request("/api/media/read-url", {
    method: "POST",
    token: userC,
    body: { mediaId: upload.json.media.id },
  });
  assert(outsiderRead.response.status === 403, `outsider read returned ${outsiderRead.response.status}`);

  const deleted = await request("/api/media/delete", {
    method: "POST",
    token: userA,
    body: { mediaId: upload.json.media.id },
  });
  assert(deleted.response.status === 200, `delete media returned ${deleted.response.status}`);
  assert(deleted.json.media?.uploadStatus === "deleted", "media did not become deleted");

  const readDeleted = await request("/api/media/read-url", {
    method: "POST",
    token: userB,
    body: { mediaId: upload.json.media.id },
  });
  assert(readDeleted.response.status === 404, `deleted media read returned ${readDeleted.response.status}`);

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    coupleId,
    checks: [
      "pair_invite",
      "upload_limits",
      "signed_upload",
      "complete_upload",
      "partner_read",
      "thumbnail_read",
      "outsider_forbidden",
      "delete_sync",
    ],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
