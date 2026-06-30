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

export async function registerContentRoutes({
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
}) {
  if (url.pathname === "/api/profile") {
    const current = await authService.authenticate(bearerToken(request));
    if (request.method === "GET") {
      const result = await profileService.getProfile(current);
      sendAuthResult(response, requestId, result);
      return true;
    }
    if (request.method === "POST") {
      const body = await parseBody(request, 64 * 1024);
      const result = await profileService.updateProfile(body, current);
      sendAuthResult(response, requestId, result);
      return true;
    }
    sendJson(response, 405, methodNotAllowedPayload(requestId));
    return true;
  }

  if (url.pathname === "/api/profile/avatar/uploads") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await storageService.createAvatarUpload(body, current);
    sendAuthResult(response, requestId, result, 201);
    return true;
  }

  if (url.pathname === "/api/profile/avatar/uploads/complete") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await storageService.completeAvatarUpload(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/profile/avatar/read-url") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await storageService.createAvatarReadUrl(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/profile/avatar/delete") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const result = await storageService.deleteAvatar({}, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/pair-invites") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const result = await relationshipService.createInvite(current);
    sendAuthResult(response, requestId, result, 201);
    return true;
  }

  if (url.pathname === "/api/pair-invites/accept") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await relationshipService.acceptInvite(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/media/uploads") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await storageService.createUpload(body, current);
    sendAuthResult(response, requestId, result, 201);
    return true;
  }

  if (url.pathname === "/api/media/uploads/complete") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await storageService.completeUpload(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/media") {
    if (!(await requireMethod(request, response, "GET", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const result = await storageService.listMedia({
      coupleId: url.searchParams.get("coupleId"),
      limit: url.searchParams.get("limit"),
    }, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/media/read-url") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await storageService.createReadUrl(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/media/delete") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await storageService.deleteMedia(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/messages") {
    const current = await authService.authenticate(bearerToken(request));
    if (request.method === "GET") {
      const result = await messageService.listMessages({
        coupleId: url.searchParams.get("coupleId"),
        limit: url.searchParams.get("limit"),
      }, current);
      sendAuthResult(response, requestId, result);
      return true;
    }
    if (request.method === "POST") {
      const body = await parseBody(request, 64 * 1024);
      const messageCoupleId = url.searchParams.get("coupleId") || url.searchParams.get("couple_id") || body.coupleId || body.couple_id;
      const result = await messageService.createMessage({
        ...body,
        coupleId: messageCoupleId,
      }, current);
      sendAuthResult(response, requestId, result, 201);
      return true;
    }
    sendJson(response, 405, methodNotAllowedPayload(requestId));
    return true;
  }

  if (url.pathname === "/api/messages/delete") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await messageService.deleteMessage(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/interactions/quick") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await interactionService.sendQuickInteraction(body, current);
    sendAuthResult(response, requestId, result, 201);
    return true;
  }

  if (url.pathname === "/api/checkins") {
    const current = await authService.authenticate(bearerToken(request));
    if (request.method === "GET") {
      const result = await checkinService.listCheckins({
        coupleId: url.searchParams.get("coupleId"),
        limit: url.searchParams.get("limit"),
      }, current);
      sendAuthResult(response, requestId, result);
      return true;
    }
    if (request.method === "POST") {
      const body = await parseBody(request, 64 * 1024);
      const result = await checkinService.upsertCheckin(body, current);
      sendAuthResult(response, requestId, result, 201);
      return true;
    }
    sendJson(response, 405, methodNotAllowedPayload(requestId));
    return true;
  }

  if (url.pathname === "/api/checkins/delete") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await checkinService.deleteCheckin(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/mood-status") {
    const current = await authService.authenticate(bearerToken(request));
    if (request.method === "GET") {
      const result = await checkinService.listMoodStatuses({
        coupleId: url.searchParams.get("coupleId"),
      }, current);
      sendAuthResult(response, requestId, result);
      return true;
    }
    if (request.method === "POST") {
      const body = await parseBody(request, 64 * 1024);
      const result = await checkinService.upsertMoodStatus(body, current);
      sendAuthResult(response, requestId, result);
      return true;
    }
    sendJson(response, 405, methodNotAllowedPayload(requestId));
    return true;
  }

  if (url.pathname === "/api/calendar-events") {
    const current = await authService.authenticate(bearerToken(request));
    if (request.method === "GET") {
      const result = await calendarService.listEvents({
        coupleId: url.searchParams.get("coupleId"),
        limit: url.searchParams.get("limit"),
      }, current);
      sendAuthResult(response, requestId, result);
      return true;
    }
    if (request.method === "POST") {
      const body = await parseBody(request, 64 * 1024);
      const result = await calendarService.createEvent(body, current);
      sendAuthResult(response, requestId, result, 201);
      return true;
    }
    sendJson(response, 405, methodNotAllowedPayload(requestId));
    return true;
  }

  if (url.pathname === "/api/calendar-events/update") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await calendarService.updateEvent(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/calendar-events/delete") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await calendarService.deleteEvent(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/footprints") {
    const current = await authService.authenticate(bearerToken(request));
    if (request.method === "GET") {
      const result = await footprintService.listFootprints({
        coupleId: url.searchParams.get("coupleId"),
        limit: url.searchParams.get("limit"),
      }, current);
      sendAuthResult(response, requestId, result);
      return true;
    }
    if (request.method === "POST") {
      const body = await parseBody(request, 64 * 1024);
      const result = await footprintService.createFootprint(body, current);
      sendAuthResult(response, requestId, result, 201);
      return true;
    }
    sendJson(response, 405, methodNotAllowedPayload(requestId));
    return true;
  }

  if (url.pathname === "/api/footprints/update") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await footprintService.updateFootprint(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/footprints/delete") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request, 64 * 1024);
    const result = await footprintService.deleteFootprint(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/creation/space") {
    const current = await authService.authenticate(bearerToken(request));
    if (request.method === "GET") {
      const coupleId = url.searchParams.get("coupleId");
      const result = coupleId
        ? await creationService.ensureCreationSpace({ coupleId }, current)
        : await creationService.getActiveCreationSpace(current);
      sendAuthResult(response, requestId, result);
      return true;
    }
    if (request.method === "POST") {
      const body = await parseBody(request, 64 * 1024);
      const result = await creationService.ensureCreationSpace(body, current);
      sendAuthResult(response, requestId, result, 201);
      return true;
    }
    sendJson(response, 405, methodNotAllowedPayload(requestId));
    return true;
  }

  if (url.pathname === "/api/creation/actions") {
    const current = await authService.authenticate(bearerToken(request));
    if (request.method === "GET") {
      const result = await creationService.listCreationActions({
        coupleId: url.searchParams.get("coupleId"),
        limit: url.searchParams.get("limit"),
      }, current);
      sendAuthResult(response, requestId, result);
      return true;
    }
    if (request.method === "POST") {
      const body = await parseBody(request, 64 * 1024);
      const result = await creationService.recordCreationAction(body, current);
      sendAuthResult(response, requestId, result, 201);
      return true;
    }
    sendJson(response, 405, methodNotAllowedPayload(requestId));
    return true;
  }

  if (url.pathname === "/api/creation/pet-memories") {
    const current = await authService.authenticate(bearerToken(request));
    if (request.method === "GET") {
      const result = await creationService.listPetMemories({
        coupleId: url.searchParams.get("coupleId"),
        limit: url.searchParams.get("limit"),
      }, current);
      sendAuthResult(response, requestId, result);
      return true;
    }
    if (request.method === "POST") {
      const body = await parseBody(request);
      const result = await creationService.createPetMemory(body, current);
      sendAuthResult(response, requestId, result, 201);
      return true;
    }
    sendJson(response, 405, methodNotAllowedPayload(requestId));
    return true;
  }

  if (url.pathname === "/api/creation/pet/feed") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request);
    const result = await creationService.feedPet(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/creation/pet/interact") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request);
    const result = await creationService.interactPet(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/creation/pet/sleep/settle") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request);
    const result = await creationService.settlePetSleep(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/creation/pet/food/buy") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request);
    const result = await creationService.buyFood(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/creation/game/reward") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request);
    const result = await creationService.claimGameReward(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/creation/pet/summon") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request);
    const result = await creationService.summonPet(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/letters") {
    const current = await authService.authenticate(bearerToken(request));
    if (request.method === "GET") {
      const result = await letterService.listLetters({
        coupleId: url.searchParams.get("coupleId"),
        limit: url.searchParams.get("limit"),
      }, current);
      sendAuthResult(response, requestId, result);
      return true;
    }
    if (request.method === "POST") {
      const body = await parseBody(request);
      const result = await letterService.createLetter(body, current);
      sendAuthResult(response, requestId, result, 201);
      return true;
    }
    sendJson(response, 405, methodNotAllowedPayload(requestId));
    return true;
  }

  if (url.pathname === "/api/letters/read") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request);
    const result = await letterService.markRead(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/letters/dismiss") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request);
    const result = await letterService.dismissLetter(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  if (url.pathname === "/api/letters/delete") {
    if (!(await requireMethod(request, response, "POST", requestId))) {
      return true;
    }
    const current = await authService.authenticate(bearerToken(request));
    const body = await parseBody(request);
    const result = await letterService.deleteLetter(body, current);
    sendAuthResult(response, requestId, result);
    return true;
  }

  return false;
}
