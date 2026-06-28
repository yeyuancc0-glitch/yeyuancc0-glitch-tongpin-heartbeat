#!/usr/bin/env node

import process from "node:process";

import pg from "pg";

const args = new Set(process.argv.slice(2));
const targetOnly = args.has("--target-only") || process.env.MIGRATION_AUDIT_TARGET_ONLY === "true";
const includeContentPreview = process.env.MIGRATION_AUDIT_INCLUDE_CONTENT_PREVIEW === "true";
const sourceUrl = process.env.SUPABASE_DB_URL || process.env.MIGRATION_SUPABASE_DB_URL;
const targetUrl = process.env.SELF_HOST_DB_URL || process.env.MIGRATION_SELF_HOST_DB_URL || buildSelfHostDbUrlFromEnv(process.env);
const userIdInput = process.env.MIGRATION_AUDIT_USER_ID || process.env.USER_ID || "";
const emailInput = process.env.MIGRATION_AUDIT_EMAIL || process.env.USER_EMAIL || "";

if (!targetUrl) {
  console.error("Missing self-host database URL. Set SELF_HOST_DB_URL or POSTGRES_* self-host variables.");
  process.exit(1);
}

if (!sourceUrl && !targetOnly) {
  console.error("Missing database URLs. Set SUPABASE_DB_URL and either SELF_HOST_DB_URL or POSTGRES_* self-host variables.");
  process.exit(1);
}

if (!userIdInput && !emailInput) {
  console.error("Missing audit target. Set MIGRATION_AUDIT_USER_ID or MIGRATION_AUDIT_EMAIL.");
  process.exit(1);
}

const source = sourceUrl ? new pg.Pool({ connectionString: sourceUrl, max: 2 }) : null;
const target = new pg.Pool({ connectionString: targetUrl, max: 2 });

async function main() {
  const targetUser = await resolveTargetUser();
  if (!targetUser.id) {
    throw new Error(`Could not resolve user from ${emailInput ? "email" : "id"} in ${targetOnly ? "target" : "source or target"} database.`);
  }

  const [
    sourceProfile,
    targetProfile,
    sourceActiveCouples,
    targetActiveCouples,
    sourceCheckins,
    sourceVisibleCheckins,
    targetCheckins,
    targetVisibleCheckins,
    ownership,
  ] = await Promise.all([
    source ? profile(source, "public.profiles", targetUser.id) : null,
    profile(target, "public.profiles", targetUser.id),
    source ? activeCouples(source, targetUser.id, "left_at is null", "status = 'active'") : [],
    activeCouples(target, targetUser.id, "status = 'active'", "status = 'active'"),
    source ? checkinsByUser(source, targetUser.id) : [],
    source ? visibleCheckins(source, targetUser.id) : [],
    checkinsByUser(target, targetUser.id),
    visibleCheckins(target, targetUser.id),
    ownershipSummary(targetUser.id),
  ]);

  const targetCheckinIds = new Set(targetCheckins.map((row) => row.id));
  const targetVisibleCheckinIds = new Set(targetVisibleCheckins.map((row) => row.id));
  const visibleCheckinIds = new Set(targetVisibleCheckins.map((row) => row.id));
  const targetOwnedVisibleCheckins = targetCheckins.filter((row) => targetVisibleCheckinIds.has(row.id));
  const missingCheckins = source ? sourceCheckins.filter((row) => !targetCheckinIds.has(row.id)) : [];
  const missingVisibleCheckins = source ? sourceVisibleCheckins.filter((row) => !targetVisibleCheckinIds.has(row.id)) : [];
  const hiddenTargetCheckins = targetCheckins.filter((row) => !row.deleted_at && !visibleCheckinIds.has(row.id));
  const needsAttention = missingCheckins.length
    || missingVisibleCheckins.length
    || hiddenTargetCheckins.length
    || !targetProfile
    || (targetCheckins.length > 0 && targetVisibleCheckins.length === 0);

  const report = {
    status: needsAttention ? "needs_attention" : "ok",
    mode: source ? "source-and-target" : "target-only",
    user: {
      id: targetUser.id,
      email: targetUser.email,
      resolvedFrom: targetUser.resolvedFrom,
    },
    profiles: {
      sourceExists: Boolean(sourceProfile),
      targetExists: Boolean(targetProfile),
      sourceDisplayName: sourceProfile?.display_name ?? null,
      targetDisplayName: targetProfile?.display_name ?? null,
    },
    activeCouples: {
      source: sourceActiveCouples,
      target: targetActiveCouples,
    },
    checkins: {
      sourceCount: source ? sourceCheckins.length : null,
      sourceVisibleCount: source ? sourceVisibleCheckins.length : null,
      targetCount: targetCheckins.length,
      targetVisibleCount: targetVisibleCheckins.length,
      targetOwnedVisibleCount: targetOwnedVisibleCheckins.length,
      sourceDates: source ? sourceCheckins.map((row) => dateKey(row.checkin_date)) : null,
      sourceVisibleDates: source ? sourceVisibleCheckins.map((row) => dateKey(row.checkin_date)) : null,
      targetDates: targetCheckins.map((row) => dateKey(row.checkin_date)),
      targetVisibleDates: targetVisibleCheckins.map((row) => dateKey(row.checkin_date)),
      missingInTarget: missingCheckins.map(publicCheckinIssue),
      sourceVisibleButMissingOrHiddenInTarget: missingVisibleCheckins.map(publicCheckinIssue),
      presentButHiddenFromActiveCouple: hiddenTargetCheckins.map(publicCheckinIssue),
    },
    ownership,
  };

  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "ok") {
    process.exit(2);
  }
}

async function resolveTargetUser() {
  if (userIdInput) {
    const id = String(userIdInput).trim().toLowerCase();
    const email = await maybeEmailForUserId(source, id) ?? await emailForUserId(target, id);
    return { id, email, resolvedFrom: "id" };
  }
  const email = String(emailInput).trim().toLowerCase();
  const id = await maybeUserIdForEmail(source, email) ?? await userIdForEmail(target, email);
  return { id, email, resolvedFrom: "email" };
}

async function maybeEmailForUserId(pool, userId) {
  return pool ? emailForUserId(pool, userId) : null;
}

async function maybeUserIdForEmail(pool, email) {
  return pool ? userIdForEmail(pool, email) : null;
}

async function emailForUserId(pool, userId) {
  if (await relationExists(pool, "auth.users")) {
    const result = await pool.query("select email from auth.users where id = $1 limit 1", [userId]);
    if (result.rows[0]?.email) {
      return result.rows[0].email;
    }
  }
  if (await relationExists(pool, "app_auth.accounts")) {
    const result = await pool.query("select email from app_auth.accounts where id = $1 limit 1", [userId]);
    if (result.rows[0]?.email) {
      return result.rows[0].email;
    }
  }
  return null;
}

async function userIdForEmail(pool, email) {
  if (await relationExists(pool, "auth.users")) {
    const result = await pool.query("select id from auth.users where lower(email) = lower($1) limit 1", [email]);
    if (result.rows[0]?.id) {
      return result.rows[0].id;
    }
  }
  if (await relationExists(pool, "app_auth.accounts")) {
    const result = await pool.query("select id from app_auth.accounts where lower(email::text) = lower($1) limit 1", [email]);
    if (result.rows[0]?.id) {
      return result.rows[0].id;
    }
  }
  return null;
}

async function profile(pool, relation, userId) {
  if (!(await relationExists(pool, relation))) {
    return null;
  }
  const result = await pool.query(`select id, display_name, created_at, updated_at from ${relation} where id = $1 limit 1`, [userId]);
  return result.rows[0] ?? null;
}

async function activeCouples(pool, userId, memberActivePredicate, coupleActivePredicate) {
  if (!(await relationExists(pool, "public.couple_members")) || !(await relationExists(pool, "public.couples"))) {
    return [];
  }
  const hasMemberStatus = await columnExists(pool, "public.couple_members", "status");
  const memberStatusSelect = hasMemberStatus ? "cm.status" : "case when cm.left_at is null then 'active' else 'left' end";
  const result = await pool.query(
    `
      select cm.couple_id, cm.user_id, cm.joined_at, cm.left_at, ${memberStatusSelect} as member_status, c.status as couple_status
        from public.couple_members cm
        join public.couples c on c.id = cm.couple_id
       where cm.user_id = $1
         and cm.${memberActivePredicate}
         and c.${coupleActivePredicate}
       order by cm.joined_at desc
    `,
    [userId],
  );
  return result.rows;
}

async function checkinsByUser(pool, userId) {
  if (!(await relationExists(pool, "public.checkins"))) {
    return [];
  }
  const result = await pool.query(
    `
      select id, couple_id, user_id, checkin_date, content, created_at, updated_at, deleted_at
        from public.checkins
       where user_id = $1
       order by checkin_date desc, created_at desc
    `,
    [userId],
  );
  return result.rows;
}

async function visibleCheckins(pool, userId) {
  if (!(await relationExists(pool, "public.checkins")) || !(await relationExists(pool, "public.couple_members")) || !(await relationExists(pool, "public.couples"))) {
    return [];
  }
  const memberActiveCondition = await columnExists(pool, "public.couple_members", "status")
    ? "cm.status = 'active'"
    : "cm.left_at is null";
  const coupleActiveCondition = await columnExists(pool, "public.couples", "status")
    ? "c.status = 'active'"
    : "true";
  const result = await pool.query(
    `
      select ch.id, ch.couple_id, ch.user_id, ch.checkin_date, ch.content, ch.created_at, ch.updated_at, ch.deleted_at
        from public.checkins ch
       where ch.deleted_at is null
         and exists (
           select 1
             from public.couple_members cm
             join public.couples c on c.id = cm.couple_id
            where cm.user_id = $1
              and ${memberActiveCondition}
              and ${coupleActiveCondition}
              and cm.couple_id = ch.couple_id
         )
       order by ch.checkin_date desc, ch.created_at desc
    `,
    [userId],
  );
  return result.rows;
}

async function ownershipSummary(userId) {
  const checks = [
    { key: "messagesSent", relation: "public.messages", predicate: "sender_id = $1" },
    { key: "mediaUploaded", relation: "public.media_files", predicate: "uploader_id = $1" },
    { key: "lettersAuthored", relation: "public.future_letters", predicate: "author_id = $1" },
    { key: "lettersReceived", relation: "public.future_letters", predicate: "recipient_id = $1" },
    { key: "calendarEventsCreated", relation: "public.calendar_events", predicate: "created_by = $1" },
    { key: "footprintsCreated", relation: "public.couple_footprints", predicate: "created_by = $1" },
    { key: "notifications", relation: "public.notifications", predicate: "user_id = $1" },
  ];
  const result = {};
  for (const check of checks) {
    const [sourceCount, targetCount] = await Promise.all([
      source ? countWhere(source, check.relation, check.predicate, [userId]) : null,
      countWhere(target, check.relation, check.predicate, [userId]),
    ]);
    result[check.key] = { sourceCount, targetCount, delta: sourceCount === null ? null : targetCount - sourceCount };
  }
  return result;
}

async function countWhere(pool, relation, predicate, values) {
  if (!(await relationExists(pool, relation))) {
    return 0;
  }
  const result = await pool.query(`select count(*)::int as count from ${relation} where ${predicate}`, values);
  return Number(result.rows[0]?.count ?? 0);
}

function publicCheckinIssue(row) {
  const issue = {
    id: row.id,
    coupleId: row.couple_id,
    checkinDate: dateKey(row.checkin_date),
    deletedAt: row.deleted_at ?? null,
  };
  if (includeContentPreview) {
    issue.contentPreview = row.content ? String(row.content).slice(0, 80) : null;
  }
  return issue;
}

function dateKey(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value || "").slice(0, 10);
}

async function relationExists(pool, relation) {
  const [schema, table] = relation.split(".");
  const result = await pool.query(
    `select exists (
       select 1
         from information_schema.tables
        where table_schema = $1
          and table_name = $2
     ) as exists`,
    [schema, table],
  );
  return Boolean(result.rows[0]?.exists);
}

async function columnExists(pool, relation, column) {
  const [schema, table] = relation.split(".");
  const result = await pool.query(
    `select exists (
       select 1
         from information_schema.columns
        where table_schema = $1
          and table_name = $2
          and column_name = $3
     ) as exists`,
    [schema, table, column],
  );
  return Boolean(result.rows[0]?.exists);
}

function buildSelfHostDbUrlFromEnv(env) {
  const database = env.POSTGRES_DB;
  const user = env.POSTGRES_USER;
  const password = env.POSTGRES_PASSWORD;
  if (!database || !user || !password) {
    return "";
  }
  const host = env.POSTGRES_HOST || "127.0.0.1";
  const port = env.POSTGRES_PORT || "5432";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await source?.end().catch(() => {});
    await target.end().catch(() => {});
  });
