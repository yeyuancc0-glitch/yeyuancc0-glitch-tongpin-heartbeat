const baseUrl = process.env.API_BASE_URL || process.env.EXPO_PUBLIC_SELF_HOST_API_URL || "https://api-staging.fancah.tech";
const suffix = Date.now();
const password = `App-Push-${suffix}-password`;

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

async function register(email) {
  const result = await request("/api/auth/register", {
    method: "POST",
    body: { email, password, displayName: email.split("@")[0] },
  });
  assert(result.response.status === 201, `register ${email} returned ${result.response.status}`);
  return result.json.session.accessToken;
}

async function main() {
  const token = await register(`codex-app-push-${suffix}@example.test`);

  const preferences = await request("/api/notification-preferences", { token });
  assert(preferences.response.status === 200, statusMessage("preferences", preferences));
  assert(preferences.json.preferences?.push_enabled === true, "push should default to enabled");
  assert(preferences.json.push?.activeTokens === 0, "new account should start without push tokens");

  const disabled = await request("/api/notification-preferences", {
    method: "POST",
    token,
    body: { push_enabled: false, message_enabled: false },
  });
  assert(disabled.response.status === 200, statusMessage("disable preferences", disabled));
  assert(disabled.json.preferences?.push_enabled === false, "push preference did not update");
  assert(disabled.json.preferences?.message_enabled === false, "message preference did not update");

  const endpoint = `https://push.example.test/app-self-host/${suffix}`;
  const registered = await request("/api/push-tokens/web", {
    method: "POST",
    token,
    body: {
      endpoint,
      p256dh: `app-p256dh-${suffix}`,
      auth: `app-auth-${suffix}`,
      userAgent: "codex-app-self-host-push-smoke",
    },
  });
  assert(registered.response.status === 201, statusMessage("register web push", registered));
  assert(registered.json.push?.activeTokens === 1, "registered web push token was not counted");
  assert(!JSON.stringify(registered.json).includes("app-p256dh"), "response leaked p256dh");
  assert(!JSON.stringify(registered.json).includes("app-auth"), "response leaked auth secret");

  const removed = await request("/api/push-tokens/disable", {
    method: "POST",
    token,
    body: { token: endpoint },
  });
  assert(removed.response.status === 200, statusMessage("disable token", removed));
  assert(removed.json.push?.activeTokens === 0, "disabled token should not remain active");

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    checks: ["preferences_read", "preferences_update", "web_push_register_no_secret_echo", "disable_token"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) {
    console.error(error.cause);
  }
  process.exit(1);
});
