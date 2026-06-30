import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlJson(value) {
  return base64UrlEncode(JSON.stringify(value));
}

function parseBase64UrlJson(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function sign(input, secret) {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

function normalizeKeyRing({ keyRing, fallbackSecret }) {
  if (Array.isArray(keyRing) && keyRing.length) {
    return keyRing;
  }
  return [{ kid: "staging-hs256-v1", secret: fallbackSecret }];
}

export function createOpaqueToken(bytes = 48) {
  return randomBytes(bytes).toString("base64url");
}

export function hashOpaqueToken(token, pepper) {
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

export function createAccessToken({ userId, sessionId, secret, kid = "staging-hs256-v1", ttlSeconds, now = new Date() }) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + ttlSeconds;
  const header = {
    alg: "HS256",
    typ: "JWT",
    kid,
  };
  const payload = {
    iss: "tongpin-self-host-api",
    aud: "tongpin-app",
    sub: userId,
    sid: sessionId,
    iat: issuedAt,
    exp: expiresAt,
    jti: randomUUID(),
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  return {
    token: `${signingInput}.${sign(signingInput, secret)}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

export function verifyAccessToken(token, secret, now = new Date(), keyRing = null) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    throw new Error("invalid_token");
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const header = parseBase64UrlJson(encodedHeader);
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new Error("invalid_token");
  }
  const keys = normalizeKeyRing({ keyRing, fallbackSecret: secret });
  const key = keys.find((candidate) => candidate.kid === header.kid) ?? (!header.kid ? keys[0] : null);
  if (!key) {
    throw new Error("invalid_token");
  }
  const expected = sign(`${encodedHeader}.${encodedPayload}`, key.secret);
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(signature);
  if (expectedBytes.length !== actualBytes.length || !timingSafeEqual(expectedBytes, actualBytes)) {
    throw new Error("invalid_token");
  }

  const payload = parseBase64UrlJson(encodedPayload);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (payload.iss !== "tongpin-self-host-api" || payload.aud !== "tongpin-app" || !payload.sub || !payload.sid || !payload.exp || payload.exp <= nowSeconds) {
    throw new Error("invalid_token");
  }

  return {
    userId: payload.sub,
    sessionId: payload.sid,
  };
}
