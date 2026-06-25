const baseUrl = process.env.EXPO_PUBLIC_SELF_HOST_API_URL || process.env.API_BASE_URL || "https://api-staging.fancah.tech";
const email = process.env.SMOKE_AUTH_EMAIL || `codex-app-${Date.now()}@example.test`;
const password = process.env.SMOKE_AUTH_PASSWORD || `Smoke-${Date.now()}-password`;
const resetPassword = `${password}-reset`;

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

async function main() {
  const register = await request("/api/auth/register", {
    method: "POST",
    body: {
      email,
      password,
      displayName: "App Self Host Smoke",
    },
  });
  assert(register.response.status === 201, `register returned ${register.response.status}`);
  assert(register.json.session?.accessToken, "register did not return access token");
  assert(register.json.session?.refreshToken, "register did not return refresh token");
  assert(register.json.emailVerification?.status, "register did not return email verification status");

  const verificationToken = register.json.emailVerification?.debugToken;
  if (verificationToken) {
    const verify = await request("/api/auth/email/verify/confirm", {
      method: "POST",
      body: { token: verificationToken },
    });
    assert(verify.response.status === 200, `email verify returned ${verify.response.status}`);
    assert(verify.json.user?.emailVerified === true, "email verify did not mark account verified");
  }

  const me = await request("/api/me", {
    token: register.json.session.accessToken,
  });
  assert(me.response.status === 200, `/api/me returned ${me.response.status}`);
  assert(me.json.user?.email === email, "/api/me returned wrong email");
  if (verificationToken) {
    assert(me.json.user?.emailVerified === true, "/api/me did not reflect verified email");
  }

  const refresh = await request("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken: register.json.session.refreshToken },
  });
  assert(refresh.response.status === 200, `refresh returned ${refresh.response.status}`);
  assert(refresh.json.session?.accessToken, "refresh did not return access token");

  const logout = await request("/api/auth/logout", {
    method: "POST",
    body: { refreshToken: refresh.json.session.refreshToken },
  });
  assert(logout.response.status === 200, `logout returned ${logout.response.status}`);

  const resetRequest = await request("/api/auth/password/reset/request", {
    method: "POST",
    body: { email },
  });
  assert(resetRequest.response.status === 200, `password reset request returned ${resetRequest.response.status}`);
  assert(resetRequest.json.passwordReset?.status || resetRequest.json.status, "password reset request did not return reset status");
  const missingReset = await request("/api/auth/password/reset/request", {
    method: "POST",
    body: { email: `missing-${Date.now()}@example.test` },
  });
  assert(missingReset.response.status === 404, `missing account reset returned ${missingReset.response.status}`);
  assert(missingReset.json.error?.code === "account_not_found", "missing account reset did not return account_not_found");

  const resetToken = resetRequest.json.passwordReset?.debugToken || resetRequest.json.debugToken;
  if (resetToken) {
    const resetConfirm = await request("/api/auth/password/reset/confirm", {
      method: "POST",
      body: {
        token: resetToken,
        password: resetPassword,
      },
    });
    assert(resetConfirm.response.status === 200, `password reset confirm returned ${resetConfirm.response.status}`);
    assert(resetConfirm.json.status === "ok", "password reset confirm did not return ok status");

    const oldPasswordLogin = await request("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert(oldPasswordLogin.response.status === 401, "old password still worked after reset");

    const newPasswordLogin = await request("/api/auth/login", {
      method: "POST",
      body: { email, password: resetPassword },
    });
    assert(newPasswordLogin.response.status === 200, `new password login returned ${newPasswordLogin.response.status}`);
    assert(newPasswordLogin.json.session?.accessToken, "new password login did not return access token");
  }

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    email,
    checks: ["register", "email_verification", "me", "refresh", "logout", "password_reset"],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) {
    console.error(error.cause);
  }
  process.exit(1);
});
