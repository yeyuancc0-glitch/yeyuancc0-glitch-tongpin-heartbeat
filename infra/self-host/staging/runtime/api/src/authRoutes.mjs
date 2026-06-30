function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

function methodNotAllowedPayload(requestId) {
  return {
    error: {
      code: "method_not_allowed",
      message: "Method is not allowed for this endpoint.",
    },
    requestId,
  };
}

async function requireMethod(request, response, expectedMethod, requestId) {
  if (request.method !== expectedMethod) {
    sendJson(response, 405, methodNotAllowedPayload(requestId));
    return false;
  }
  return true;
}

async function sendAuthResult(response, requestId, result, statusCode = 200) {
  sendJson(response, statusCode, {
    ...result,
    requestId,
  });
}

function requestMeta(request) {
  return {
    ip: request.headers["x-forwarded-for"] || request.socket.remoteAddress || "",
    userAgent: request.headers["user-agent"] || "",
  };
}

export async function registerAuthRoutes({
  authService,
  bearerToken,
  dashboardService,
  parseBody,
  relationshipService,
  request,
  requestId,
  response,
  url,
}) {
  if (url.pathname === "/api/me") {
    if (!(await requireMethod(request, response, "GET", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    sendAuthResult(response, requestId, { user: current.user });
    return true;
  }

  if (url.pathname === "/api/me/dashboard") {
    if (!(await requireMethod(request, response, "GET", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const result = await dashboardService.getDashboard(current);
    sendAuthResult(response, requestId, { dashboard: result });
    return true;
  }

  if (url.pathname === "/api/auth/register") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const body = await parseBody(request);
    const result = await authService.register(body, requestMeta(request));
    sendAuthResult(response, requestId, result, 201);
    return true;
  }

  if (url.pathname === "/api/auth/login") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const body = await parseBody(request);
    const result = await authService.login(body, requestMeta(request));
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/auth/email/verify/request") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const body = await parseBody(request);
    const result = await authService.requestEmailVerification(body, requestMeta(request));
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/auth/email/verify/confirm") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const body = await parseBody(request);
    const result = await authService.confirmEmailVerification(body);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/auth/password/reset/request") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const body = await parseBody(request);
    const result = await authService.requestPasswordReset(body, requestMeta(request));
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/auth/password/reset/confirm") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const body = await parseBody(request);
    const result = await authService.confirmPasswordReset(body);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/auth/refresh") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const body = await parseBody(request);
    const result = await authService.refresh(body, requestMeta(request));
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/auth/logout") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const body = await parseBody(request);
    const result = await authService.logout(body);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/auth/logout-all") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const result = await authService.logoutAll(current.user.id);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/auth/sessions") {
    if (!(await requireMethod(request, response, "GET", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const result = await authService.listSessions(current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/auth/sessions/revoke") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request);
    const result = await authService.revokeSession(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/couples/active") {
    if (!(await requireMethod(request, response, "GET", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const result = await relationshipService.activeCouple(current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  return false;
}
