async function sendAuthResult(response, requestId, result, statusCode = 200) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify({ ...result, requestId })}\n`);
}

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

export async function registerPrivacyRoutes({
  authService,
  bearerToken,
  parseBody,
  privacyService,
  request,
  requestId,
  response,
  url,
}) {
  if (url.pathname === "/api/couples/active/dates") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await privacyService.updateActiveCoupleDates(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/couples/active/end") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const result = await privacyService.endActiveCouple(current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/feedback") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await privacyService.submitFeedback(body, current);
    sendAuthResult(response, requestId, result, 201);
    return true;
  }

  if (url.pathname === "/api/reports") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await privacyService.submitReport(body, current);
    sendAuthResult(response, requestId, result, 201);
    return true;
  }

  if (url.pathname === "/api/privacy/block-partner") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await privacyService.blockPartnerAndEndCouple(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/privacy/account-deletion") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await privacyService.requestAccountDeletion(body, current);
    sendAuthResult(response, requestId, result, 202);
    return true;
  }

  return false;
}
