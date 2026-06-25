const baseUrl = process.env.API_BASE_URL || process.env.EXPO_PUBLIC_SELF_HOST_API_URL || "https://api-staging.fancah.tech";
const suffix = Date.now();
const password = `App-Expo-Push-${suffix}-password`;

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

async function main() {
  const registered = await request("/api/auth/register", {
    method: "POST",
    body: {
      email: `codex-app-expo-push-${suffix}@example.test`,
      password,
      displayName: "expo-push-smoke",
    },
  });
  assert(registered.response.status === 201, statusMessage("register", registered));
  const accessToken = registered.json.session?.accessToken;
  assert(accessToken, "access token missing");

  const token = `ExponentPushToken[codex-${suffix}]`;
  const pushed = await request("/api/push-tokens/expo", {
    method: "POST",
    token: accessToken,
    body: {
      token,
      platform: "ios",
      deviceId: `device-${suffix}`,
      appVersion: "0.0.0-smoke",
    },
  });
  assert(pushed.response.status === 201, statusMessage("register expo push", pushed));
  assert(pushed.json.push?.activeExpoTokens >= 1, "active Expo token count missing");
  assert(!JSON.stringify(pushed.json).includes(token), "push API echoed raw token");

  const disabled = await request("/api/push-tokens/disable", {
    method: "POST",
    token: accessToken,
    body: { token },
  });
  assert(disabled.response.status === 200, statusMessage("disable expo push", disabled));
  assert(disabled.json.push?.activeExpoTokens === 0, "Expo token was not disabled");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    checks: ["register", "register_expo_push", "no_token_echo", "disable_expo_push"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
