import { createServer } from "node:http";

import { loadConfig } from "./config.mjs";
import { createAuthService } from "./authService.mjs";
import { createCalendarService } from "./calendarService.mjs";
import { createCheckinService } from "./checkinService.mjs";
import { createCreationService } from "./creationService.mjs";
import { createDashboardService } from "./dashboardService.mjs";
import { createEmailService } from "./emailService.mjs";
import { createDbPool } from "./db.mjs";
import { createFootprintService } from "./footprintService.mjs";
import { createInteractionService } from "./interactionService.mjs";
import { createRequestHandler } from "./http.mjs";
import { createLetterService } from "./letterService.mjs";
import { createMessageService } from "./messageService.mjs";
import { createNotificationService } from "./notificationService.mjs";
import { createPrivacyService } from "./privacyService.mjs";
import { createProfileService } from "./profileService.mjs";
import { createRelationshipService } from "./relationshipService.mjs";
import { createStorageService } from "./storageService.mjs";

const config = loadConfig();
const startedAt = Date.now();
const pool = createDbPool(config);
const emailService = createEmailService({ config });
const authService = createAuthService({ pool, config, emailService });
const notificationService = createNotificationService({ pool, config });
const calendarService = createCalendarService({ notificationService, pool, config });
const checkinService = createCheckinService({ notificationService, pool, config });
const creationService = createCreationService({ pool, config });
const footprintService = createFootprintService({ pool, config });
const interactionService = createInteractionService({ notificationService, pool, config });
const letterService = createLetterService({ notificationService, pool, config });
const messageService = createMessageService({ notificationService, pool, config });
const privacyService = createPrivacyService({ pool, config });
const relationshipService = createRelationshipService({ pool, config });
const profileService = createProfileService({ pool, config });
const storageService = createStorageService({ pool, config });
const dashboardService = createDashboardService({
  calendarService,
  checkinService,
  creationService,
  footprintService,
  letterService,
  messageService,
  notificationService,
  pool,
  profileService,
  relationshipService,
  storageService,
});
const server = createServer(createRequestHandler({
  authService,
  calendarService,
  checkinService,
  config,
  creationService,
  dashboardService,
  footprintService,
  interactionService,
  letterService,
  messageService,
  notificationService,
  privacyService,
  profileService,
  relationshipService,
  startedAt,
  storageService,
}));

server.listen(config.port, "0.0.0.0", () => {
  console.log({
    event: "server_started",
    service: config.serviceName,
    environment: config.apiEnv,
    port: config.port,
  });
});

function shutdown(signal) {
  console.log({ event: "server_shutdown_started", signal });
  server.close((error) => {
    if (error) {
      console.error({ event: "server_shutdown_failed", message: error.message });
      process.exit(1);
    }
    pool.end()
      .then(() => {
        console.log({ event: "server_shutdown_complete" });
        process.exit(0);
      })
      .catch((poolError) => {
        console.error({
          event: "server_shutdown_pool_failed",
          message: poolError instanceof Error ? poolError.message : "unknown pool shutdown error",
        });
        process.exit(1);
      });
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
