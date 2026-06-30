import { AuthError } from "./authService.mjs";

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

function writeSseEvent(response, event, data, id) {
  if (id) {
    response.write(`id: ${id}\n`);
  }
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function nowIso() {
  return new Date().toISOString();
}

async function sendNotificationStream({ logger, notificationService, request, response, requestId, current, url }) {
  const coupleId = url.searchParams.get("coupleId");
  let afterCreatedAt = url.searchParams.get("afterCreatedAt") || "";
  let afterNotificationId = url.searchParams.get("afterNotificationId") || "";
  const heartbeatMs = 25000;
  let closed = false;
  let polling = false;
  let pollDelayMs = 3000;
  let pollTimer = null;
  let unsubscribeCreated = null;

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
    let sawNewItem = false;
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
        sawNewItem = true;
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
      if (!closed) {
        pollDelayMs = sawNewItem ? 3000 : Math.min(Math.round(pollDelayMs * 1.5), 12000);
        if (pollTimer) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }
        pollTimer = setTimeout(() => {
          pollTimer = null;
          void poll();
        }, pollDelayMs);
      }
    }
  }

  function wakePoll() {
    if (closed) {
      return;
    }
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    pollDelayMs = 3000;
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void poll();
    }, 0);
  }

  const heartbeatInterval = setInterval(() => {
    if (!closed) {
      response.write(`: heartbeat ${nowIso()}\n\n`);
    }
  }, heartbeatMs);

  response.on("close", () => {
    closed = true;
    if (unsubscribeCreated) {
      unsubscribeCreated();
      unsubscribeCreated = null;
    }
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    clearInterval(heartbeatInterval);
  });

  unsubscribeCreated = notificationService.subscribeNotificationCreated?.((event) => {
    if (closed || event.coupleId !== coupleId || event.userId !== current.user.id) {
      return;
    }
    if (event.createdAt > afterCreatedAt || (event.createdAt === afterCreatedAt && event.notificationId > afterNotificationId)) {
      wakePoll();
    }
  }) ?? null;

  await poll();
  await new Promise((resolve) => {
    response.on("close", resolve);
  });
}

export function registerNotificationRoutes({
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
}) {
  return (async () => {
    if (url.pathname === "/api/notifications") {
      const current = await authService.authenticate(bearerToken(request));
      if (request.method === "GET") {
        const result = await notificationService.listNotifications({
          coupleId: url.searchParams.get("coupleId"),
          limit: url.searchParams.get("limit"),
        }, current);
        sendAuthResult(response, requestId, result);
        return true;
      }
      sendJson(response, 405, methodNotAllowedPayload(requestId));
      return true;
    }

    if (url.pathname === "/api/notifications/stream") {
      if (!(await requireMethod(request, response, "GET", requestId))) {
        return true;
      }
      const current = await authService.authenticate(bearerToken(request));
      await sendNotificationStream({ logger, notificationService, request, response, requestId, current, url });
      return true;
    }

    if (url.pathname === "/api/notifications/read") {
      if (!(await requireMethod(request, response, "POST", requestId))) {
        return true;
      }
      const current = await authService.authenticate(bearerToken(request));
      const body = await parseBody(request);
      const result = await notificationService.markRead(body, current);
      sendAuthResult(response, requestId, result);
      return true;
    }

    if (url.pathname === "/api/notifications/dismiss") {
      if (!(await requireMethod(request, response, "POST", requestId))) {
        return true;
      }
      const current = await authService.authenticate(bearerToken(request));
      const body = await parseBody(request);
      const result = await notificationService.dismiss(body, current);
      sendAuthResult(response, requestId, result);
      return true;
    }

    if (url.pathname === "/api/notification-preferences") {
      const current = await authService.authenticate(bearerToken(request));
      if (request.method === "GET") {
        const result = await notificationService.getPreferences(current);
        sendAuthResult(response, requestId, result);
        return true;
      }
      if (request.method === "POST") {
        const body = await parseBody(request);
        const result = await notificationService.updatePreferences(body, current);
        sendAuthResult(response, requestId, result);
        return true;
      }
      sendJson(response, 405, methodNotAllowedPayload(requestId));
      return true;
    }

    if (url.pathname === "/api/push-tokens/web") {
      if (!(await requireMethod(request, response, "POST", requestId))) {
        return true;
      }
      const current = await authService.authenticate(bearerToken(request));
      const body = await parseBody(request);
      const result = await notificationService.registerWebPush(body, current);
      sendAuthResult(response, requestId, result, 201);
      return true;
    }

    if (url.pathname === "/api/push-tokens/expo") {
      if (!(await requireMethod(request, response, "POST", requestId))) {
        return true;
      }
      const current = await authService.authenticate(bearerToken(request));
      const body = await parseBody(request);
      const result = await notificationService.registerExpoPush(body, current);
      sendAuthResult(response, requestId, result, 201);
      return true;
    }

    if (url.pathname === "/api/push-tokens/disable") {
      if (!(await requireMethod(request, response, "POST", requestId))) {
        return true;
      }
      const current = await authService.authenticate(bearerToken(request));
      const body = await parseBody(request);
      const result = await notificationService.disablePushToken(body, current);
      sendAuthResult(response, requestId, result);
      return true;
    }

    if (url.pathname === "/api/push-deliveries/summary") {
      if (!(await requireMethod(request, response, "GET", requestId))) {
        return true;
      }
      const current = await authService.authenticate(bearerToken(request));
      const result = await notificationService.pushDeliverySummary(current);
      sendAuthResult(response, requestId, result);
      return true;
    }

    return false;
  })();
}
