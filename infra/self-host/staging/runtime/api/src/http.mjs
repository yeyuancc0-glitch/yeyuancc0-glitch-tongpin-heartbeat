import { randomUUID } from "node:crypto";
import net from "node:net";

import { AuthError } from "./authService.mjs";
import { registerAuthRoutes } from "./authRoutes.mjs";
import { registerContentRoutes } from "./contentRoutes.mjs";
import { registerNotificationRoutes } from "./notificationRoutes.mjs";
import { registerPrivacyRoutes } from "./privacyRoutes.mjs";

const jsonContentType = "application/json; charset=utf-8";

function nowIso() {
  return new Date().toISOString();
}

function requestIdFor(request) {
  const headerValue = request.headers["x-request-id"];
  if (typeof headerValue === "string" && headerValue.trim()) {
    const normalized = headerValue.trim();
    if (/^[A-Za-z0-9._:-]{1,120}$/.test(normalized)) {
      return normalized;
    }
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

function parseBody(request, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
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

      const handledByAuthRoutes = await registerAuthRoutes({
        authService,
        bearerToken,
        dashboardService,
        parseBody,
        relationshipService,
        request,
        requestId,
        response,
        url,
      });
      if (handledByAuthRoutes) {
        return;
      }

      const handledByPrivacyRoutes = await registerPrivacyRoutes({
        authService,
        bearerToken,
        parseBody,
        privacyService,
        profileService,
        request,
        requestId,
        response,
        url,
      });
      if (handledByPrivacyRoutes) {
        return;
      }

      const handledByContentRoutes = await registerContentRoutes({
        authService,
        bearerToken,
        calendarService,
        checkinService,
        creationService,
        footprintService,
        interactionService,
        letterService,
        messageService,
        parseBody,
        profileService,
        relationshipService,
        request,
        requestId,
        response,
        storageService,
        url,
      });
      if (handledByContentRoutes) {
        return;
      }

      const handledByNotificationRoutes = await registerNotificationRoutes({
        authService,
        logger,
        notificationService,
        parseBody,
        request,
        requestId,
        response,
        sendAuthResult,
        url,
        bearerToken,
      });
      if (handledByNotificationRoutes) {
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
