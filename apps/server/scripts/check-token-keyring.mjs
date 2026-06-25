import { createAccessToken, verifyAccessToken } from "../src/tokens.mjs";

const oldKey = { kid: "old-key", secret: "old-key-secret-for-local-check-32-bytes" };
const newKey = { kid: "new-key", secret: "new-key-secret-for-local-check-32-bytes" };

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function header(token) {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
}

const oldToken = createAccessToken({
  userId: "00000000-0000-0000-0000-000000000001",
  sessionId: "00000000-0000-0000-0000-000000000002",
  secret: oldKey.secret,
  kid: oldKey.kid,
  ttlSeconds: 60,
}).token;

const newToken = createAccessToken({
  userId: "00000000-0000-0000-0000-000000000001",
  sessionId: "00000000-0000-0000-0000-000000000003",
  secret: newKey.secret,
  kid: newKey.kid,
  ttlSeconds: 60,
}).token;

assert(header(oldToken).kid === "old-key", "old token kid mismatch");
assert(header(newToken).kid === "new-key", "new token kid mismatch");
assert(verifyAccessToken(oldToken, newKey.secret, new Date(), [newKey, oldKey]).sessionId.endsWith("0002"), "old key did not verify through keyring");
assert(verifyAccessToken(newToken, newKey.secret, new Date(), [newKey, oldKey]).sessionId.endsWith("0003"), "new key did not verify through keyring");

let rejected = false;
try {
  verifyAccessToken(oldToken, newKey.secret, new Date(), [newKey]);
} catch {
  rejected = true;
}
assert(rejected, "token signed with retired key should be rejected when key is removed");

console.log(JSON.stringify({ status: "ok", checks: ["jwt_current_kid", "jwt_previous_key_verifies", "jwt_retired_key_rejected"] }));
