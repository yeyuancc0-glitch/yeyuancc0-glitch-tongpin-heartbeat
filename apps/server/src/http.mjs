import { randomUUID } from "node:crypto";
import net from "node:net";

import { AuthError } from "./authService.mjs";

const jsonContentType = "application/json; charset=utf-8";

function nowIso() {
  return new Date().toISOString();
}

function requestIdFor(request) {
  const headerValue = request.headers["x-request-id"];
  if (typeof headerValue === "string" && headerValue.trim()) {
    return headerValue.slice(0, 120);
  }
  return randomUUID();
}

function setCorsHeaders(response, request, config) {
  const origin = request.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Request-Id");
  response.setHeader("Access-Control-Max-Age", "600");
}

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", jsonContentType);
  response.end(`${JSON.stringify(body)}\n`);
}

function errorPayload(code, message, requestId) {
  return {
    error: {
      code,
      message,
    },
    requestId,
  };
}

function healthPayload(config, requestId, startedAt) {
  return {
    status: "ok",
    service: config.serviceName,
    environment: config.apiEnv,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    time: nowIso(),
    requestId,
  };
}

function checkTcpEndpoint({ name, host, port, timeoutMs = 1500 }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.createConnection({ host, port });
    let settled = false;

    function finish(status, detail) {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve({
        name,
        status,
        latencyMs: Date.now() - started,
        ...detail,
      });
    }

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish("ok"));
    socket.once("timeout", () => finish("degraded", { error: "timeout" }));
    socket.once("error", (error) => finish("degraded", { error: error.code || "connection_error" }));
  });
}

async function deepHealthPayload(config, requestId, startedAt) {
  const checks = await Promise.all([
    checkTcpEndpoint({ name: "postgres", ...config.dependencies.postgres }),
    checkTcpEndpoint({ name: "redis", ...config.dependencies.redis }),
    checkTcpEndpoint({ name: "minio", ...config.dependencies.minio }),
  ]);
  const status = checks.every((check) => check.status === "ok") ? "ok" : "degraded";

  return {
    ...healthPayload(config, requestId, startedAt),
    status,
    checks,
  };
}

function unauthorizedPayload(requestId) {
  return errorPayload("auth_required", "Authentication is required for this endpoint.", requestId);
}

function notFoundPayload(requestId) {
  return errorPayload("not_found", "Endpoint not found.", requestId);
}

function methodNotAllowedPayload(requestId) {
  return errorPayload("method_not_allowed", "Method is not allowed for this endpoint.", requestId);
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 32 * 1024) {
        reject(new AuthError("payload_too_large", 413, "Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(new AuthError("invalid_json", 400, "Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function bearerToken(request) {
  const header = request.headers.authorization;
  if (typeof header !== "string") {
    return "";
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function requestMeta(request) {
  return {
    ip: request.headers["x-forwarded-for"] || request.socket.remoteAddress || "",
    userAgent: request.headers["user-agent"] || "",
  };
}

function logSafeUrl(request) {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    return url.pathname || "/";
  } catch {
    return String(request.url || "/").split("?")[0] || "/";
  }
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

function writeSseEvent(response, event, data, id) {
  if (id) {
    response.write(`id: ${id}\n`);
  }
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function sendNotificationStream({ logger, notificationService, request, response, requestId, current, url }) {
  const coupleId = url.searchParams.get("coupleId");
  let afterCreatedAt = url.searchParams.get("afterCreatedAt") || "";
  let afterNotificationId = url.searchParams.get("afterNotificationId") || "";
  const heartbeatMs = 25000;
  const pollMs = 3000;
  let closed = false;
  let polling = false;

  if (!afterCreatedAt) {
    const cursor = await notificationService.latestNotificationCursor({ coupleId }, current);
    afterCreatedAt = cursor.createdAt || nowIso();
    afterNotificationId = cursor.notificationId || "";
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.socket?.setNoDelay?.(true);
  response.flushHeaders?.();
  response.write("retry: 5000\n\n");
  writeSseEvent(response, "ready", {
    requestId,
    coupleId,
    latestCreatedAt: afterCreatedAt || null,
    latestNotificationId: afterNotificationId || null,
  });
  logger.info?.({
    event: "notification_stream_ready",
    requestId,
    coupleId,
    userId: current.user.id,
    latestCreatedAt: afterCreatedAt || null,
    latestNotificationId: afterNotificationId || null,
  });

  async function poll() {
    if (closed || polling) {
      return;
    }
    polling = true;
    try {
      const result = await notificationService.listNotificationEvents({
        coupleId,
        afterCreatedAt,
        afterNotificationId,
      }, current);
      for (const notification of result.notifications) {
        if (closed) {
          break;
        }
        afterCreatedAt = notification.createdAt;
        afterNotificationId = notification.id;
        writeSseEvent(response, "notification", {
          notificationId: notification.id,
          createdAt: notification.createdAt,
        }, notification.id);
        logger.info?.({
          event: "notification_stream_event_sent",
          requestId,
          coupleId,
          userId: current.user.id,
          notificationId: notification.id,
          createdAt: notification.createdAt,
        });
      }
    } catch (error) {
      logger.warn?.({
        event: "notification_stream_failed",
        requestId,
        coupleId,
        userId: current.user.id,
        message: error instanceof Error ? error.message : "unknown stream error",
      });
      if (!closed) {
        writeSseEvent(response, "error", {
          requestId,
          code: error instanceof AuthError ? error.code : "stream_error",
          message: error instanceof Error ? error.message : "Notification stream failed.",
        });
        response.end();
      }
    } finally {
      polling = false;
    }
  }

  const pollInterval = setInterval(() => {
    void poll();
  }, pollMs);
  const heartbeatInterval = setInterval(() => {
    if (!closed) {
      response.write(`: heartbeat ${nowIso()}\n\n`);
    }
  }, heartbeatMs);

  response.on("close", () => {
    closed = true;
    clearInterval(pollInterval);
    clearInterval(heartbeatInterval);
  });

  await poll();
  await new Promise((resolve) => {
    response.on("close", resolve);
  });
}

export function createRequestHandler({
  authService,
  calendarService,
  checkinService,
  config,
  creationService,
  dashboardService,
  footprintService,
  interactionService,
  letterService,
  logger = console,
  messageService,
  notificationService,
  privacyService,
  profileService,
  relationshipService,
  startedAt = Date.now(),
  storageService,
}) {
  return async function handleRequest(request, response) {
    const requestId = requestIdFor(request);
    const started = Date.now();
    response.setHeader("X-Request-Id", requestId);
    setCorsHeaders(response, request, config);

    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "OPTIONS") {
        response.statusCode = 204;
        response.end();
        return;
      }

      if ((url.pathname === "/health" || url.pathname === "/api/health") && request.method === "GET") {
        sendJson(response, 200, healthPayload(config, requestId, startedAt));
        return;
      }

      if (url.pathname === "/api/health/deep" && request.method === "GET") {
        const payload = await deepHealthPayload(config, requestId, startedAt);
        sendJson(response, payload.status === "ok" ? 200 : 503, payload);
        return;
      }

      if (url.pathname === "/api/me") {
        if (!(await requireMethod(request, response, "GET", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        sendAuthResult(response, requestId, { user: current.user });
        return;
      }

      if (url.pathname === "/api/me/dashboard") {
        if (!(await requireMethod(request, response, "GET", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const result = await dashboardService.getDashboard(current);
        sendAuthResult(response, requestId, { dashboard: result });
        return;
      }

      if (url.pathname === "/api/auth/register") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const body = await parseBody(request);
        const result = await authService.register(body, requestMeta(request));
        sendAuthResult(response, requestId, result, 201);
        return;
      }

      if (url.pathname === "/api/auth/login") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const body = await parseBody(request);
        const result = await authService.login(body, requestMeta(request));
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/auth/email/verify/request") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const body = await parseBody(request);
        const result = await authService.requestEmailVerification(body, requestMeta(request));
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/auth/email/verify/confirm") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const body = await parseBody(request);
        const result = await authService.confirmEmailVerification(body);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/auth/password/reset/request") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const body = await parseBody(request);
        const result = await authService.requestPasswordReset(body, requestMeta(request));
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/auth/password/reset/confirm") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const body = await parseBody(request);
        const result = await authService.confirmPasswordReset(body);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/auth/refresh") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const body = await parseBody(request);
        const result = await authService.refresh(body, requestMeta(request));
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/auth/logout") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const body = await parseBody(request);
        const result = await authService.logout(body);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/auth/logout-all") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const result = await authService.logoutAll(current.user.id);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/auth/sessions") {
        if (!(await requireMethod(request, response, "GET", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const result = await authService.listSessions(current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/auth/sessions/revoke") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await authService.revokeSession(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/couples/active") {
        if (!(await requireMethod(request, response, "GET", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const result = await relationshipService.activeCouple(current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/profile") {
        const current = await authService.authenticate(bearerToken(request));
        if (request.method === "GET") {
          const result = await profileService.getProfile(current);
          sendAuthResult(response, requestId, result);
          return;
        }
        if (request.method === "POST") {
          const body = await parseBody(request);
          const result = await profileService.updateProfile(body, current);
          sendAuthResult(response, requestId, result);
          return;
        }
        sendJson(response, 405, methodNotAllowedPayload(requestId));
        return;
      }

      if (url.pathname === "/api/couples/active/dates") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await profileService.updateActiveCoupleDates(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/couples/active/end") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const result = await privacyService.endActiveCouple(current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/feedback") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await privacyService.submitFeedback(body, current);
        sendAuthResult(response, requestId, result, 201);
        return;
      }

      if (url.pathname === "/api/reports") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await privacyService.submitReport(body, current);
        sendAuthResult(response, requestId, result, 201);
        return;
      }

      if (url.pathname === "/api/privacy/block-partner") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await privacyService.blockPartnerAndEndCouple(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/privacy/account-deletion") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await privacyService.requestAccountDeletion(body, current);
        sendAuthResult(response, requestId, result, 202);
        return;
      }

      if (url.pathname === "/api/profile/avatar/uploads") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await storageService.createAvatarUpload(body, current);
        sendAuthResult(response, requestId, result, 201);
        return;
      }

      if (url.pathname === "/api/profile/avatar/uploads/complete") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await storageService.completeAvatarUpload(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/profile/avatar/read-url") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await storageService.createAvatarReadUrl(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/profile/avatar/delete") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const result = await storageService.deleteAvatar({}, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/pair-invites") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const result = await relationshipService.createInvite(current);
        sendAuthResult(response, requestId, result, 201);
        return;
      }

      if (url.pathname === "/api/pair-invites/accept") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await relationshipService.acceptInvite(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/media/uploads") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await storageService.createUpload(body, current);
        sendAuthResult(response, requestId, result, 201);
        return;
      }

      if (url.pathname === "/api/media/uploads/complete") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await storageService.completeUpload(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/media") {
        if (!(await requireMethod(request, response, "GET", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const result = await storageService.listMedia({
          coupleId: url.searchParams.get("coupleId"),
          limit: url.searchParams.get("limit"),
        }, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/media/read-url") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await storageService.createReadUrl(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/media/delete") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await storageService.deleteMedia(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/messages") {
        const current = await authService.authenticate(bearerToken(request));
        if (request.method === "GET") {
          const result = await messageService.listMessages({
            coupleId: url.searchParams.get("coupleId"),
            limit: url.searchParams.get("limit"),
          }, current);
          sendAuthResult(response, requestId, result);
          return;
        }
        if (request.method === "POST") {
          const body = await parseBody(request);
          const messageCoupleId = url.searchParams.get("coupleId") || url.searchParams.get("couple_id") || body.coupleId || body.couple_id;
          const result = await messageService.createMessage({
            ...body,
            coupleId: messageCoupleId,
          }, current);
          sendAuthResult(response, requestId, result, 201);
          return;
        }
        sendJson(response, 405, methodNotAllowedPayload(requestId));
        return;
      }

      if (url.pathname === "/api/messages/delete") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await messageService.deleteMessage(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/interactions/quick") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await interactionService.sendQuickInteraction(body, current);
        sendAuthResult(response, requestId, result, 201);
        return;
      }

      if (url.pathname === "/api/checkins") {
        const current = await authService.authenticate(bearerToken(request));
        if (request.method === "GET") {
          const result = await checkinService.listCheckins({
            coupleId: url.searchParams.get("coupleId"),
            limit: url.searchParams.get("limit"),
          }, current);
          sendAuthResult(response, requestId, result);
          return;
        }
        if (request.method === "POST") {
          const body = await parseBody(request);
          const result = await checkinService.upsertCheckin(body, current);
          sendAuthResult(response, requestId, result, 201);
          return;
        }
        sendJson(response, 405, methodNotAllowedPayload(requestId));
        return;
      }

      if (url.pathname === "/api/checkins/delete") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await checkinService.deleteCheckin(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/mood-status") {
        const current = await authService.authenticate(bearerToken(request));
        if (request.method === "GET") {
          const result = await checkinService.listMoodStatuses({
            coupleId: url.searchParams.get("coupleId"),
          }, current);
          sendAuthResult(response, requestId, result);
          return;
        }
        if (request.method === "POST") {
          const body = await parseBody(request);
          const result = await checkinService.upsertMoodStatus(body, current);
          sendAuthResult(response, requestId, result);
          return;
        }
        sendJson(response, 405, methodNotAllowedPayload(requestId));
        return;
      }

      if (url.pathname === "/api/calendar-events") {
        const current = await authService.authenticate(bearerToken(request));
        if (request.method === "GET") {
          const result = await calendarService.listEvents({
            coupleId: url.searchParams.get("coupleId"),
            limit: url.searchParams.get("limit"),
          }, current);
          sendAuthResult(response, requestId, result);
          return;
        }
        if (request.method === "POST") {
          const body = await parseBody(request);
          const result = await calendarService.createEvent(body, current);
          sendAuthResult(response, requestId, result, 201);
          return;
        }
        sendJson(response, 405, methodNotAllowedPayload(requestId));
        return;
      }

      if (url.pathname === "/api/calendar-events/update") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await calendarService.updateEvent(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/calendar-events/delete") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await calendarService.deleteEvent(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/footprints") {
        const current = await authService.authenticate(bearerToken(request));
        if (request.method === "GET") {
          const result = await footprintService.listFootprints({
            coupleId: url.searchParams.get("coupleId"),
            limit: url.searchParams.get("limit"),
          }, current);
          sendAuthResult(response, requestId, result);
          return;
        }
        if (request.method === "POST") {
          const body = await parseBody(request);
          const result = await footprintService.createFootprint(body, current);
          sendAuthResult(response, requestId, result, 201);
          return;
        }
        sendJson(response, 405, methodNotAllowedPayload(requestId));
        return;
      }

      if (url.pathname === "/api/footprints/update") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await footprintService.updateFootprint(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/footprints/delete") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await footprintService.deleteFootprint(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/creation/space") {
        const current = await authService.authenticate(bearerToken(request));
        if (request.method === "GET") {
          const coupleId = url.searchParams.get("coupleId");
          const result = coupleId
            ? await creationService.ensureCreationSpace({ coupleId }, current)
            : await creationService.getActiveCreationSpace(current);
          sendAuthResult(response, requestId, result);
          return;
        }
        if (request.method === "POST") {
          const body = await parseBody(request);
          const result = await creationService.ensureCreationSpace(body, current);
          sendAuthResult(response, requestId, result, 201);
          return;
        }
        sendJson(response, 405, methodNotAllowedPayload(requestId));
        return;
      }

      if (url.pathname === "/api/creation/actions") {
        const current = await authService.authenticate(bearerToken(request));
        if (request.method === "GET") {
          const result = await creationService.listCreationActions({
            coupleId: url.searchParams.get("coupleId"),
            limit: url.searchParams.get("limit"),
          }, current);
          sendAuthResult(response, requestId, result);
          return;
        }
        if (request.method === "POST") {
          const body = await parseBody(request);
          const result = await creationService.recordCreationAction(body, current);
          sendAuthResult(response, requestId, result, 201);
          return;
        }
        sendJson(response, 405, methodNotAllowedPayload(requestId));
        return;
      }

      if (url.pathname === "/api/creation/pet-memories") {
        const current = await authService.authenticate(bearerToken(request));
        if (request.method === "GET") {
          const result = await creationService.listPetMemories({
            coupleId: url.searchParams.get("coupleId"),
            limit: url.searchParams.get("limit"),
          }, current);
          sendAuthResult(response, requestId, result);
          return;
        }
        if (request.method === "POST") {
          const body = await parseBody(request);
          const result = await creationService.createPetMemory(body, current);
          sendAuthResult(response, requestId, result, 201);
          return;
        }
        sendJson(response, 405, methodNotAllowedPayload(requestId));
        return;
      }

      if (url.pathname === "/api/creation/pet/feed") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await creationService.feedPet(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/creation/pet/interact") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await creationService.interactPet(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/creation/pet/sleep/settle") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await creationService.settlePetSleep(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/creation/pet/food/buy") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await creationService.buyFood(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/creation/game/reward") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await creationService.claimGameReward(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/creation/pet/summon") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await creationService.summonPet(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/letters") {
        const current = await authService.authenticate(bearerToken(request));
        if (request.method === "GET") {
          const result = await letterService.listLetters({
            coupleId: url.searchParams.get("coupleId"),
            limit: url.searchParams.get("limit"),
          }, current);
          sendAuthResult(response, requestId, result);
          return;
        }
        if (request.method === "POST") {
          const body = await parseBody(request);
          const result = await letterService.createLetter(body, current);
          sendAuthResult(response, requestId, result, 201);
          return;
        }
        sendJson(response, 405, methodNotAllowedPayload(requestId));
        return;
      }

      if (url.pathname === "/api/letters/read") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await letterService.markRead(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/letters/dismiss") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await letterService.dismissLetter(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/letters/delete") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await letterService.deleteLetter(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/notifications") {
        const current = await authService.authenticate(bearerToken(request));
        if (request.method === "GET") {
          const result = await notificationService.listNotifications({
            coupleId: url.searchParams.get("coupleId"),
            limit: url.searchParams.get("limit"),
          }, current);
          sendAuthResult(response, requestId, result);
          return;
        }
        sendJson(response, 405, methodNotAllowedPayload(requestId));
        return;
      }

      if (url.pathname === "/api/notifications/stream") {
        if (!(await requireMethod(request, response, "GET", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        await sendNotificationStream({ logger, notificationService, request, response, requestId, current, url });
        return;
      }

      if (url.pathname === "/api/notifications/read") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await notificationService.markRead(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/notifications/dismiss") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await notificationService.dismiss(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/notification-preferences") {
        const current = await authService.authenticate(bearerToken(request));
        if (request.method === "GET") {
          const result = await notificationService.getPreferences(current);
          sendAuthResult(response, requestId, result);
          return;
        }
        if (request.method === "POST") {
          const body = await parseBody(request);
          const result = await notificationService.updatePreferences(body, current);
          sendAuthResult(response, requestId, result);
          return;
        }
        sendJson(response, 405, methodNotAllowedPayload(requestId));
        return;
      }

      if (url.pathname === "/api/push-tokens/web") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await notificationService.registerWebPush(body, current);
        sendAuthResult(response, requestId, result, 201);
        return;
      }

      if (url.pathname === "/api/push-tokens/expo") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await notificationService.registerExpoPush(body, current);
        sendAuthResult(response, requestId, result, 201);
        return;
      }

      if (url.pathname === "/api/push-tokens/disable") {
        if (!(await requireMethod(request, response, "POST", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const body = await parseBody(request);
        const result = await notificationService.disablePushToken(body, current);
        sendAuthResult(response, requestId, result);
        return;
      }

      if (url.pathname === "/api/push-deliveries/summary") {
        if (!(await requireMethod(request, response, "GET", requestId))) {
          return;
        }
        const current = await authService.authenticate(bearerToken(request));
        const result = await notificationService.pushDeliverySummary(current);
        sendAuthResult(response, requestId, result);
        return;
      }

      sendJson(response, 404, notFoundPayload(requestId));
    } catch (error) {
      if (error instanceof AuthError) {
        sendJson(response, error.statusCode, errorPayload(error.code, error.message, requestId));
        return;
      }
      logger.error({
        event: "request_failed",
        requestId,
        method: request.method,
        url: logSafeUrl(request),
        message: error instanceof Error ? error.message : "unknown error",
      });
      sendJson(response, 500, {
        error: {
          code: "internal_error",
          message: "Internal server error.",
        },
        requestId,
      });
    } finally {
      logger.info({
        event: "request_completed",
        requestId,
        method: request.method,
        url: logSafeUrl(request),
        statusCode: response.statusCode,
        durationMs: Date.now() - started,
      });
    }
  };
}
