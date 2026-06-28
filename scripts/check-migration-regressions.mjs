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
requireOrder(homeScreen, "function openSettingPage(page: SettingPage)", 'setActiveTab("me");\n    setSubPage(page);', "opening settings must keep activeTab on me before setting subPage");
requireIncludes(homeScreen, "function returnToMePage()", "settings back path must return to me page state");
requireIncludes(homeScreen, "onBack={returnToMePage}", "settings detail back must use the me-page return helper");
requireIncludes(homeScreen, 'setActiveTab("home");\n          setSubPage("letterInbox");', "settings-to-letters navigation must sync activeTab with subPage");

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
requireIncludes("apps/app/features/auth/AuthProvider.tsx", "邮件服务今日额度已达上限", "forgot-password UI must explain Resend daily quota state");

const userAuditScript = "apps/server/scripts/audit-supabase-user-migration.mjs";
requireIncludes(userAuditScript, "MIGRATION_AUDIT_TARGET_ONLY", "single-user migration audit must support target-only checks after source credentials are removed");
requireIncludes(userAuditScript, "sourceCount: source ? sourceCheckins.length : null", "target-only audit must not report missing source data as zero");
requireIncludes(userAuditScript, "MIGRATION_AUDIT_INCLUDE_CONTENT_PREVIEW", "single-user migration audit must hide checkin content preview by default");
requireIncludes(userAuditScript, "targetVisibleDates", "single-user migration audit must report visible checkin dates without exposing content");

const integrityAuditScript = "apps/server/scripts/audit-self-host-integrity.mjs";
requireIncludes(integrityAuditScript, "missingProfiles", "self-host integrity audit must catch active accounts without profiles");
requireIncludes(integrityAuditScript, "activeCoupleWrongMemberCount", "self-host integrity audit must catch malformed active couple memberships");
requireIncludes(integrityAuditScript, "invisibleCheckins", "self-host integrity audit must catch active-couple checkins hidden by membership issues");
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
