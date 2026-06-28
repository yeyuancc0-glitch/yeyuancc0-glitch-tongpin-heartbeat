#!/usr/bin/env node

import { readFileSync } from "node:fs";
import process from "node:process";

const failures = [];

function read(file) {
  return readFileSync(file, "utf8");
}

function fail(message) {
  failures.push(message);
}

function requireIncludes(file, needle, message) {
  const content = read(file);
  if (!content.includes(needle)) {
    fail(`${file}: ${message}`);
  }
}

function requireRegex(file, regex, message) {
  const content = read(file);
  if (!regex.test(content)) {
    fail(`${file}: ${message}`);
  }
}

function forbidRegex(file, regex, message) {
  const content = read(file);
  if (regex.test(content)) {
    fail(`${file}: ${message}`);
  }
}

function requireOrder(file, first, second, message) {
  const content = read(file);
  const firstIndex = content.indexOf(first);
  const secondIndex = content.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex > secondIndex) {
    fail(`${file}: ${message}`);
  }
}

const homeScreen = "apps/app/features/home/HomeScreen.tsx";
requireRegex(homeScreen, /const showsBottomTabBar = subPage === "main" \|\| isSettingDetailPage;/, "setting detail pages must keep the bottom tab bar visible");
requireIncludes(homeScreen, 'function openSettingPage(page: SettingPage) {\n    setActiveTab("me");\n    setSubPageReturnTab("me");\n    setSubPage(page);\n  }', "opening settings must keep activeTab on me and record the me return tab before setting subPage");
requireIncludes(homeScreen, "function returnToMePage()", "settings back path must return to me page state");
requireIncludes(homeScreen, "onBack={returnToMePage}", "settings detail back must use the me-page return helper");
requireIncludes(homeScreen, 'openSubPage("letterInbox", "me");', "settings-to-letters navigation must return to the me tab instead of dumping users on home");
requireIncludes(homeScreen, "function returnToSubPageOwner()", "business subpage back path must restore the tab that opened it");
requireIncludes(homeScreen, 'onBack={returnToSubPageOwner}', "business subpages must use the owner-tab return helper");

forbidRegex("apps/app/features/memory/MemoryPage.tsx", /\b(checkins|messages|events|letters|footprints|mediaFiles|memories|visibleMemories)\.slice\s*\(\s*0\s*,/g, "memory timeline must not truncate historical business lists");
forbidRegex("apps/app/features/checkins/TodayStoryPage.tsx", /\b(checkins|visibleCheckins)\.slice\s*\(\s*0\s*,/g, "today capsule history must not truncate historical checkins");
forbidRegex("apps/app/features/letters/LetterPages.tsx", /\bletters\.slice\s*\(\s*0\s*,/g, "letter inbox must not truncate historical letters");
forbidRegex("apps/app/features/creation/CreationSpacePage.tsx", /\b(footprints|creationActions|petMemories)\.slice\s*\(\s*0\s*,/g, "creation pages must not truncate historical lists");
requireIncludes("apps/app/features/messages/MessagePages.tsx", "共 {messages.length} 条", "home message preview must show total count when it truncates");
requireIncludes("apps/app/features/messages/MessagePages.tsx", "查看全部", "home message preview must expose a full-list entry");

const selfHostListFiles = [
  "apps/app/lib/selfHost/messageApi.ts",
  "apps/app/lib/selfHost/mediaApi.ts",
  "apps/app/lib/selfHost/letterApi.ts",
  "apps/app/lib/selfHost/calendarApi.ts",
  "apps/app/lib/selfHost/footprintApi.ts",
  "apps/app/lib/selfHost/notificationApi.ts",
];
for (const file of selfHostListFiles) {
  requireIncludes(file, "input.limit ?? 1000", "self-host list helper default limit must cover full history, not old previews");
}

const serverLimitFiles = [
  ["apps/server/src/messageService.mjs", "defaultMessageListLimit"],
  ["apps/server/src/storageService.mjs", "defaultMediaListLimit"],
  ["apps/server/src/letterService.mjs", "defaultLetterListLimit"],
  ["apps/server/src/calendarService.mjs", "defaultCalendarEventListLimit"],
  ["apps/server/src/footprintService.mjs", "defaultFootprintListLimit"],
  ["apps/server/src/notificationService.mjs", "defaultNotificationListLimit"],
  ["apps/server/src/creationService.mjs", "defaultCreationListLimit"],
];
for (const [file, constant] of serverLimitFiles) {
  requireRegex(file, new RegExp(`const ${constant} = 1000;`), `${constant} must remain at the full-history default`);
  requireRegex(file, /const max[A-Za-z]+ListLimit = 5000;/, "max list limit must remain high enough for migrated history");
}
requireIncludes("apps/server/src/checkinService.mjs", "const maxCheckinListLimit = 5000;", "checkin list limit must cover long daily history");

requireIncludes("apps/app/features/home/useHomePhotoActions.ts", "mergeMediaFile(uploadedMediaFile);", "album uploads must merge ready media into dashboard state immediately");
requireIncludes("apps/app/features/profile/ProfileScreen.tsx", "onProfileChanged?.(nextProfile);", "profile/avatar changes must merge returned profile into dashboard state");
requireIncludes("apps/app/features/home/useCoupleData.ts", "mergeMediaFile", "dashboard data hook must expose media merge helper");
requireIncludes("apps/app/features/home/useCoupleData.ts", "mergeProfile", "dashboard data hook must expose profile merge helper");

requireIncludes("apps/server/src/emailService.mjs", "isReservedTestRecipient(to)", "reserved .test emails must not call Resend");
requireIncludes("apps/server/src/emailService.mjs", "resend_daily_quota_exceeded", "Resend daily quota cooldown must remain in place");
requireIncludes("apps/server/src/authService.mjs", "email_quota_exceeded", "Auth API must surface quota status to the frontend");
requireIncludes("apps/server/src/authService.mjs", "ensurePasswordResetAllowed", "password reset requests must keep email/IP rate limits");
requireIncludes("apps/server/src/authService.mjs", "password_reset_recently_sent", "password reset requests must suppress duplicate Resend sends");
requireIncludes("apps/server/src/authService.mjs", "ensureEmailVerificationAllowed", "email verification requests must keep email/IP rate limits");
requireIncludes("apps/server/src/authService.mjs", "email_verification_recently_sent", "email verification requests must suppress duplicate Resend sends");
requireIncludes("apps/server/db/migrations/022_password_reset_rate_limit.sql", "password_reset_tokens_ip_created_idx", "password reset rate limiting must keep an indexed IP prefix");
requireIncludes("apps/server/db/migrations/023_auth_email_verification_rate_limit.sql", "email_verification_tokens_ip_created_idx", "email verification rate limiting must keep an indexed IP prefix");
requireIncludes("apps/app/features/auth/AuthProvider.tsx", "邮件服务今日额度已达上限", "forgot-password UI must explain Resend daily quota state");
requireIncludes("apps/server/src/http.mjs", "function logSafeUrl(request)", "API request logs must sanitize URLs before logging");
requireIncludes("apps/server/src/http.mjs", "url: logSafeUrl(request)", "API request logs must record only sanitized URL paths");
forbidRegex("apps/server/src/http.mjs", /url:\s*request\.url/g, "API request logs must not write raw request.url because it may contain auth tokens or signed URL query strings");
requireIncludes("apps/server/src/notificationService.mjs", "function timestampCursor(value)", "notification stream cursors must normalize Date and legacy JS date strings");
requireIncludes("apps/server/scripts/smoke-notifications.mjs", "legacy_cursor_sse", "notification smoke must cover legacy JS date cursor reconnection");
requireIncludes(
  "infra/self-host/staging/Caddyfile",
  "try_files {path} {path}.html {path}/index.html /index.html",
  "Caddy must serve extensionless nested auth routes from their static HTML before falling back to the home shell",
);
requireIncludes(
  "infra/self-host/staging/Caddyfile",
  "request>uri query",
  "Caddy logs must filter request query parameters before writing runtime logs",
);
for (const sensitiveQueryKey of ["token", "access_token", "refresh_token", "X-Amz-Credential", "X-Amz-Signature", "X-Amz-Security-Token"]) {
  requireIncludes(
    "infra/self-host/staging/Caddyfile",
    `replace ${sensitiveQueryKey} REDACTED`,
    `Caddy logs must redact sensitive query parameter ${sensitiveQueryKey}`,
  );
}
requireIncludes(
  "infra/self-host/staging/scripts/monitor-staging.sh",
  "grep -q \"邮箱验证\"",
  "staging monitor must verify the email verification route content, not just HTTP 200",
);
requireIncludes(
  "infra/self-host/staging/scripts/monitor-staging.sh",
  "grep -q \"设置新密码\"",
  "staging monitor must verify the password reset route content, not just HTTP 200",
);

const userAuditScript = "apps/server/scripts/audit-supabase-user-migration.mjs";
requireIncludes(userAuditScript, "MIGRATION_AUDIT_TARGET_ONLY", "single-user migration audit must support target-only checks after source credentials are removed");
requireIncludes(userAuditScript, "sourceCount: source ? sourceCheckins.length : null", "target-only audit must not report missing source data as zero");
requireIncludes(userAuditScript, "MIGRATION_AUDIT_INCLUDE_CONTENT_PREVIEW", "single-user migration audit must hide checkin content preview by default");
requireIncludes(userAuditScript, "targetVisibleDates", "single-user migration audit must report visible checkin dates without exposing content");

const integrityAuditScript = "apps/server/scripts/audit-self-host-integrity.mjs";
requireIncludes(integrityAuditScript, "missingProfiles", "self-host integrity audit must catch active accounts without profiles");
requireIncludes(integrityAuditScript, "activeCoupleWrongMemberCount", "self-host integrity audit must catch malformed active couple memberships");
requireIncludes(integrityAuditScript, "invisibleCheckins", "self-host integrity audit must catch active-couple checkins hidden by membership issues");
requireIncludes(integrityAuditScript, "invalidCoupleCheckins", "self-host integrity audit must catch business rows attached to missing or malformed active couples");
requireIncludes(integrityAuditScript, "invalidCoupleCreationSpaces", "self-host integrity audit must catch creation data attached to missing or malformed active couples");
requireIncludes(integrityAuditScript, "invisibleMoodStatuses", "self-host integrity audit must catch mood status rows hidden by membership issues");
requireIncludes(integrityAuditScript, "stalePendingMedia", "self-host integrity audit must catch media uploads stuck pending");
requireIncludes("apps/server/package.json", "audit:self-host-integrity", "server package must expose the self-host integrity audit command");
requireIncludes("infra/self-host/staging/scripts/monitor-staging.sh", "audit:self-host-integrity", "staging monitor must run the self-host integrity audit");

if (failures.length > 0) {
  console.error("Migration regression check failed.");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Migration regression check passed.");
