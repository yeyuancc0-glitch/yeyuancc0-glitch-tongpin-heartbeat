const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const email = process.env.SMOKE_AUTH_EMAIL || `codex-smoke-${Date.now()}@example.test`;
const password = process.env.SMOKE_AUTH_PASSWORD || `Smoke-${Date.now()}-password`;
const resetPassword = process.env.SMOKE_AUTH_RESET_PASSWORD || `${password}-reset`;

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

function jwtHeader(token) {
  const [header] = String(token || "").split(".");
  return JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
}

async function main() {
  const register = await request("/api/auth/register", {
    method: "POST",
    body: {
      email,
      password,
      displayName: "Codex Smoke",
    },
  });
  assert(register.response.status === 201 || register.response.status === 409, `register returned ${register.response.status}`);
  assert(
    register.response.status === 409 || register.json.emailVerification?.status,
    "register did not return email verification status",
  );

  let verificationToken = register.json.emailVerification?.debugToken;
  if (!verificationToken) {
    const requestVerify = await request("/api/auth/email/verify/request", {
      method: "POST",
      body: { email },
    });
    assert(requestVerify.response.status === 200, `email verification request returned ${requestVerify.response.status}`);
    verificationToken = requestVerify.json.debugToken;
  }

  if (verificationToken) {
    const confirmVerify = await request("/api/auth/email/verify/confirm", {
      method: "POST",
      body: { token: verificationToken },
    });
    assert(confirmVerify.response.status === 200, `email verification confirm returned ${confirmVerify.response.status}`);
    assert(confirmVerify.json.user?.emailVerified === true, "email verification did not mark user verified");
  }

  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert(login.response.status === 200, `login returned ${login.response.status}`);
  assert(login.json.session?.accessToken, "login did not return access token");
  assert(login.json.session?.refreshToken, "login did not return refresh token");
  assert(jwtHeader(login.json.session.accessToken).kid, "access token did not include a JWT key id");

  const me = await request("/api/me", {
    token: login.json.session.accessToken,
  });
  assert(me.response.status === 200, `/api/me returned ${me.response.status}`);
  assert(me.json.user?.email === email, "/api/me returned wrong user");
  if (verificationToken) {
    assert(me.json.user?.emailVerified === true, "/api/me did not reflect verified email");
  }

  const refresh = await request("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken: login.json.session.refreshToken },
  });
  assert(refresh.response.status === 200, `refresh returned ${refresh.response.status}`);
  assert(refresh.json.session?.refreshToken, "refresh did not rotate refresh token");

  const reused = await request("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken: login.json.session.refreshToken },
  });
  assert(reused.response.status === 401, `reused refresh token returned ${reused.response.status}`);

  const familyBlocked = await request("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken: refresh.json.session.refreshToken },
  });
  assert(familyBlocked.response.status === 401, `reuse detection did not revoke token family: ${familyBlocked.response.status}`);

  const resetTargetLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert(resetTargetLogin.response.status === 200, `reset target login returned ${resetTargetLogin.response.status}`);

  const resetRequest = await request("/api/auth/password/reset/request", {
    method: "POST",
    body: { email },
  });
  assert(resetRequest.response.status === 200, `password reset request returned ${resetRequest.response.status}`);
  assert(resetRequest.json.status, "password reset request did not return reset status");

  const missingReset = await request("/api/auth/password/reset/request", {
    method: "POST",
    body: { email: `missing-${Date.now()}@example.test` },
  });
  assert(missingReset.response.status === 404, `missing account reset returned ${missingReset.response.status}`);
  assert(missingReset.json.error?.code === "account_not_found", "missing account reset did not return account_not_found");

  const resetToken = resetRequest.json.debugToken;
  if (resetToken) {
    const resetConfirm = await request("/api/auth/password/reset/confirm", {
      method: "POST",
      body: {
        token: resetToken,
        password: resetPassword,
      },
    });
    assert(resetConfirm.response.status === 200, `password reset confirm returned ${resetConfirm.response.status}`);

    const oldTokenMe = await request("/api/me", {
      token: resetTargetLogin.json.session.accessToken,
    });
    assert(oldTokenMe.response.status === 401, `old access token survived password reset: ${oldTokenMe.response.status}`);

    const oldPasswordLogin = await request("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert(oldPasswordLogin.response.status === 401, `old password still works: ${oldPasswordLogin.response.status}`);
  }

  const activePassword = resetToken ? resetPassword : password;
  const newPasswordLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email, password: activePassword },
  });
  assert(newPasswordLogin.response.status === 200, `active password login returned ${newPasswordLogin.response.status}`);

  const secondDeviceLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email, password: activePassword },
  });
  assert(secondDeviceLogin.response.status === 200, `second device login returned ${secondDeviceLogin.response.status}`);

  const sessions = await request("/api/auth/sessions", {
    token: newPasswordLogin.json.session.accessToken,
  });
  assert(sessions.response.status === 200, `sessions returned ${sessions.response.status}`);
  assert(Array.isArray(sessions.json.sessions), "sessions response did not return a list");
  assert(sessions.json.sessions.length >= 2, "sessions list did not include both active sessions");
  const currentSession = sessions.json.sessions.find((session) => session.current);
  const otherSession = sessions.json.sessions.find((session) => !session.current);
  assert(currentSession?.id, "sessions list did not identify current session");
  assert(otherSession?.id, "sessions list did not include another session to revoke");
  assert(!sessions.json.sessions.some((session) => session.refreshToken), "sessions response leaked refresh token");

  const revokeOther = await request("/api/auth/sessions/revoke", {
    method: "POST",
    token: newPasswordLogin.json.session.accessToken,
    body: { sessionId: otherSession.id },
  });
  assert(revokeOther.response.status === 200, `session revoke returned ${revokeOther.response.status}`);

  const revokedSessionMe = await request("/api/me", {
    token: secondDeviceLogin.json.session.accessToken,
  });
  assert(revokedSessionMe.response.status === 401, `revoked session access token still worked: ${revokedSessionMe.response.status}`);

  const currentSessionMe = await request("/api/me", {
    token: newPasswordLogin.json.session.accessToken,
  });
  assert(currentSessionMe.response.status === 200, `current session was revoked unexpectedly: ${currentSessionMe.response.status}`);

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    email,
    checks: [
      "register",
      "email_verification",
      "login",
      "jwt_kid",
      "me",
      "refresh_rotation",
      "refresh_reuse_revocation",
      "password_reset",
      "password_reset_revokes_sessions",
      "session_list",
      "session_revoke",
    ],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
