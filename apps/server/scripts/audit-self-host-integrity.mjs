#!/usr/bin/env node

import process from "node:process";

import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import pg from "pg";

const targetUrl = process.env.SELF_HOST_DB_URL || process.env.MIGRATION_SELF_HOST_DB_URL || buildSelfHostDbUrlFromEnv(process.env);
const staleUploadHours = positiveInteger(process.env.INTEGRITY_AUDIT_STALE_UPLOAD_HOURS, 1);
const sampleLimit = positiveInteger(process.env.INTEGRITY_AUDIT_SAMPLE_LIMIT, 10);
const storageAudit = createStorageAudit(process.env);

if (!targetUrl) {
  console.error("Missing self-host database URL. Set SELF_HOST_DB_URL or POSTGRES_* self-host variables.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: targetUrl, max: 2 });
const s3 = storageAudit.enabled ? new S3Client(storageAudit.s3ClientConfig) : null;

async function main() {
  const [
    totals,
    missingProfiles,
    orphanProfiles,
    activeMemberDuplicates,
    activeCoupleWrongMemberCount,
    acceptedInviteBroken,
    invisibleMessages,
    invisibleCheckins,
    invisibleMedia,
    invisibleLettersForAuthor,
    invisibleLettersForRecipient,
    invisibleCalendarEvents,
    invisibleFootprints,
    invisibleCreationActions,
    invisibleMoodStatuses,
    invisiblePetMemoriesForCreator,
    invalidCoupleMessages,
    invalidCoupleCheckins,
    invalidCoupleMoodStatuses,
    invalidCoupleMedia,
    invalidCoupleLetters,
    invalidCoupleCalendarEvents,
    invalidCoupleFootprints,
    invalidCoupleCreationSpaces,
    invalidCoupleCreationActions,
    invalidCouplePetMemories,
    stalePendingMedia,
    stalePendingAvatarUploads,
    missingMediaObjects,
    missingAvatarObjects,
    missingMediaThumbnailObjects,
    missingAvatarThumbnailObjects,
  ] = await Promise.all([
    totalsSummary(),
    sampleCount(`
      select a.id
        from app_auth.accounts a
        left join public.profiles p on p.id = a.id
       where a.disabled_at is null
         and p.id is null
       order by a.created_at desc
    `),
    sampleCount(`
      select p.id
        from public.profiles p
        left join app_auth.accounts a on a.id = p.id
       where a.id is null
       order by p.created_at desc
    `),
    sampleCount(`
      select cm.user_id as id, count(*)::int as active_couple_count
        from public.couple_members cm
        join public.couples c on c.id = cm.couple_id
       where cm.status = 'active'
         and c.status = 'active'
       group by cm.user_id
      having count(*) > 1
       order by active_couple_count desc, cm.user_id
    `),
    sampleCount(`
      select c.id, count(cm.user_id)::int as active_member_count
        from public.couples c
        left join public.couple_members cm on cm.couple_id = c.id and cm.status = 'active'
       where c.status = 'active'
       group by c.id
      having count(cm.user_id) <> 2
       order by c.id
    `),
    sampleCount(`
      select pi.id
        from public.pair_invites pi
        left join public.couples c on c.id = pi.couple_id
       where pi.status = 'accepted'
         and (
           pi.couple_id is null
           or c.id is null
           or not exists (
             select 1 from public.couple_members cm
              where cm.couple_id = pi.couple_id
                and cm.user_id = pi.inviter_user_id
           )
           or not exists (
             select 1 from public.couple_members cm
              where cm.couple_id = pi.couple_id
                and cm.user_id = pi.accepted_by_user_id
           )
         )
       order by pi.accepted_at desc nulls last, pi.created_at desc
    `),
    invisibleOwnerRows({
      relation: "public.messages",
      ownerColumn: "sender_id",
      filter: "deleted_at is null",
      orderColumn: "created_at",
    }),
    invisibleOwnerRows({
      relation: "public.checkins",
      ownerColumn: "user_id",
      filter: "deleted_at is null",
      orderColumn: "checkin_date",
    }),
    invisibleOwnerRows({
      relation: "public.media_files",
      ownerColumn: "uploader_id",
      filter: "deleted_at is null and upload_status = 'ready'",
      orderColumn: "created_at",
    }),
    invisibleOwnerRows({
      relation: "public.future_letters",
      ownerColumn: "author_id",
      filter: "deleted_at is null",
      orderColumn: "created_at",
    }),
    invisibleOwnerRows({
      relation: "public.future_letters",
      ownerColumn: "recipient_id",
      filter: "deleted_at is null",
      orderColumn: "created_at",
    }),
    invisibleOwnerRows({
      relation: "public.calendar_events",
      ownerColumn: "created_by",
      filter: "deleted_at is null",
      orderColumn: "event_date",
    }),
    invisibleOwnerRows({
      relation: "public.couple_footprints",
      ownerColumn: "created_by",
      filter: "deleted_at is null",
      orderColumn: "visited_at",
    }),
    invisibleOwnerRows({
      relation: "public.creation_actions",
      ownerColumn: "actor_id",
      filter: "true",
      orderColumn: "created_at",
    }),
    invisibleOwnerRows({
      relation: "public.mood_status",
      ownerColumn: "user_id",
      filter: "true",
      orderColumn: "updated_at",
    }),
    invisibleOwnerRows({
      relation: "public.pet_memories",
      ownerColumn: "created_by",
      filter: "created_by is not null and archived_at is null",
      orderColumn: "created_at",
    }),
    invalidCoupleRows({
      relation: "public.messages",
      filter: "deleted_at is null",
      orderColumn: "created_at",
    }),
    invalidCoupleRows({
      relation: "public.checkins",
      filter: "deleted_at is null",
      orderColumn: "checkin_date",
    }),
    invalidCoupleRows({
      relation: "public.mood_status",
      filter: "true",
      orderColumn: "updated_at",
    }),
    invalidCoupleRows({
      relation: "public.media_files",
      filter: "deleted_at is null and upload_status = 'ready'",
      orderColumn: "created_at",
    }),
    invalidCoupleRows({
      relation: "public.future_letters",
      filter: "deleted_at is null",
      orderColumn: "created_at",
    }),
    invalidCoupleRows({
      relation: "public.calendar_events",
      filter: "deleted_at is null",
      orderColumn: "event_date",
    }),
    invalidCoupleRows({
      relation: "public.couple_footprints",
      filter: "deleted_at is null",
      orderColumn: "visited_at",
    }),
    invalidCoupleRows({
      relation: "public.creation_spaces",
      filter: "true",
      orderColumn: "updated_at",
    }),
    invalidCoupleRows({
      relation: "public.creation_actions",
      filter: "true",
      orderColumn: "created_at",
    }),
    invalidCoupleRows({
      relation: "public.pet_memories",
      filter: "archived_at is null",
      orderColumn: "created_at",
    }),
    staleUploads("public.media_files", "upload_status = 'pending'", "created_at"),
    relationExists("public.profile_avatar_uploads").then((exists) => exists
      ? staleUploads("public.profile_avatar_uploads", "upload_status = 'pending'", "created_at")
      : { count: 0, samples: [], skipped: "missing_relation" }),
    missingStorageObjects({
      relation: "public.media_files",
      idColumn: "id",
      pathColumn: "storage_path",
      bucket: storageAudit.mediaBucket,
      filter: "deleted_at is null and upload_status = 'ready'",
      orderColumn: "created_at",
    }),
    missingStorageObjects({
      relation: "public.profiles",
      idColumn: "id",
      pathColumn: "avatar_storage_path",
      bucket: storageAudit.avatarBucket,
      filter: "avatar_storage_path is not null",
      orderColumn: "updated_at",
    }),
    missingStorageObjects({
      relation: "public.media_files",
      idColumn: "id",
      pathColumn: "thumbnail_storage_path",
      bucket: storageAudit.mediaBucket,
      filter: "deleted_at is null and upload_status = 'ready' and thumbnail_storage_path is not null",
      orderColumn: "created_at",
    }),
    missingStorageObjects({
      relation: "public.profiles",
      idColumn: "id",
      pathColumn: "avatar_thumbnail_storage_path",
      bucket: storageAudit.avatarBucket,
      filter: "avatar_thumbnail_storage_path is not null",
      orderColumn: "updated_at",
    }),
  ]);

  const failures = {
    missingProfiles,
    orphanProfiles,
    activeMemberDuplicates,
    activeCoupleWrongMemberCount,
    acceptedInviteBroken,
    invisibleMessages,
    invisibleCheckins,
    invisibleMedia,
    invisibleLettersForAuthor,
    invisibleLettersForRecipient,
    invisibleCalendarEvents,
    invisibleFootprints,
    invisibleCreationActions,
    invisibleMoodStatuses,
    invisiblePetMemoriesForCreator,
    invalidCoupleMessages,
    invalidCoupleCheckins,
    invalidCoupleMoodStatuses,
    invalidCoupleMedia,
    invalidCoupleLetters,
    invalidCoupleCalendarEvents,
    invalidCoupleFootprints,
    invalidCoupleCreationSpaces,
    invalidCoupleCreationActions,
    invalidCouplePetMemories,
    missingMediaObjects,
    missingAvatarObjects,
  };
  const warnings = {
    stalePendingMedia,
    stalePendingAvatarUploads,
    missingMediaThumbnailObjects,
    missingAvatarThumbnailObjects,
  };
  const failureCount = Object.values(failures).reduce((sum, item) => sum + Number(item.count || 0), 0);
  const warningCount = Object.values(warnings).reduce((sum, item) => sum + Number(item.count || 0), 0);

  const report = {
    status: failureCount > 0 ? "needs_attention" : warningCount > 0 ? "warning" : "ok",
    generatedAt: new Date().toISOString(),
    staleUploadHours,
    storageAudit: {
      mode: storageAudit.mode,
      enabled: storageAudit.enabled,
      skipped: storageAudit.enabled ? null : storageAudit.reason,
    },
    totals,
    failures,
    warnings,
  };

  console.log(JSON.stringify(report, null, 2));
  if (failureCount > 0) {
    process.exit(2);
  }
}

async function totalsSummary() {
  const checks = [
    ["accounts", "app_auth.accounts", "disabled_at is null"],
    ["profiles", "public.profiles", "true"],
    ["activeCouples", "public.couples", "status = 'active'"],
    ["activeCoupleMembers", "public.couple_members", "status = 'active'"],
    ["messages", "public.messages", "deleted_at is null"],
    ["checkins", "public.checkins", "deleted_at is null"],
    ["readyMedia", "public.media_files", "deleted_at is null and upload_status = 'ready'"],
    ["letters", "public.future_letters", "deleted_at is null"],
    ["calendarEvents", "public.calendar_events", "deleted_at is null"],
    ["footprints", "public.couple_footprints", "deleted_at is null"],
    ["creationActions", "public.creation_actions", "true"],
    ["notifications", "public.notifications", "dismissed_at is null"],
  ];
  const totals = {};
  for (const [key, relation, predicate] of checks) {
    totals[key] = await countWhere(relation, predicate);
  }
  return totals;
}

async function invisibleOwnerRows({ relation, ownerColumn, filter, orderColumn }) {
  if (!(await relationExists(relation))) {
    return { count: 0, samples: [], skipped: "missing_relation" };
  }
  return sampleCount(`
    select t.id, t.couple_id, t.${ownerColumn} as user_id
      from ${relation} t
     where ${filter}
       and exists (
         select 1
           from public.couples row_couple
          where row_couple.id = t.couple_id
            and row_couple.status = 'active'
       )
       and not exists (
         select 1
           from public.couple_members cm
           join public.couples c on c.id = cm.couple_id
          where cm.couple_id = t.couple_id
            and cm.user_id = t.${ownerColumn}
            and cm.status = 'active'
            and c.status = 'active'
       )
     order by t.${orderColumn} desc nulls last
  `);
}

async function invalidCoupleRows({ relation, filter, orderColumn }) {
  if (!(await relationExists(relation))) {
    return { count: 0, samples: [], skipped: "missing_relation" };
  }
  return sampleCount(`
    select t.id, t.couple_id
      from ${relation} t
      left join public.couples c on c.id = t.couple_id
     where ${filter}
       and (
         c.id is null
         or (
           c.status = 'active'
           and (
             select count(*)::int
               from public.couple_members cm
              where cm.couple_id = t.couple_id
                and cm.status = 'active'
           ) <> 2
         )
       )
     order by t.${orderColumn} desc nulls last
  `);
}

async function staleUploads(relation, predicate, orderColumn) {
  if (!(await relationExists(relation))) {
    return { count: 0, samples: [], skipped: "missing_relation" };
  }
  return sampleCount(
    `
      select id, created_at
        from ${relation}
       where ${predicate}
         and created_at < now() - make_interval(hours => $1)
       order by ${orderColumn} desc nulls last
    `,
    [staleUploadHours],
  );
}

async function missingStorageObjects({ relation, idColumn, pathColumn, bucket, filter, orderColumn }) {
  if (!storageAudit.enabled) {
    return { count: 0, samples: [], skipped: storageAudit.reason };
  }
  if (!(await relationExists(relation))) {
    return { count: 0, samples: [], skipped: "missing_relation" };
  }
  const result = await pool.query(
    `
      select ${idColumn} as id, ${pathColumn} as storage_path, ${orderColumn} as created_at
        from ${relation}
       where ${filter}
       order by ${orderColumn} desc nulls last
    `,
  );
  const missing = [];
  for (const row of result.rows) {
    if (!(await storageObjectExists(bucket, row.storage_path))) {
      missing.push(row);
    }
  }
  return {
    count: missing.length,
    samples: missing.slice(0, sampleLimit).map(sanitizeSample),
  };
}

async function storageObjectExists(bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

function createStorageAudit(env) {
  const mode = normalizeStorageAuditMode(env.INTEGRITY_AUDIT_STORAGE_CHECK);
  if (mode === "false") {
    return { mode, enabled: false, reason: "storage_audit_disabled" };
  }

  const missing = [];
  for (const name of ["MINIO_ENDPOINT", "MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD"]) {
    if (!String(env[name] ?? "").trim()) {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    if (mode === "true") {
      throw new Error(`INTEGRITY_AUDIT_STORAGE_CHECK=true requires ${missing.join(", ")}.`);
    }
    return { mode, enabled: false, reason: "storage_not_configured" };
  }

  return {
    mode,
    enabled: true,
    reason: null,
    mediaBucket: env.MINIO_COUPLE_MEDIA_BUCKET || "couple-media",
    avatarBucket: env.MINIO_PROFILE_AVATAR_BUCKET || "profile-avatars",
    s3ClientConfig: {
      endpoint: endpointUrl(env.MINIO_ENDPOINT),
      region: env.MINIO_REGION || "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.MINIO_ROOT_USER,
        secretAccessKey: env.MINIO_ROOT_PASSWORD,
      },
    },
  };
}

function normalizeStorageAuditMode(value) {
  const text = String(value ?? "auto").trim().toLowerCase();
  if (!text || text === "auto") {
    return "auto";
  }
  if (["1", "true", "yes", "on", "required"].includes(text)) {
    return "true";
  }
  if (["0", "false", "no", "off", "disabled"].includes(text)) {
    return "false";
  }
  throw new Error("INTEGRITY_AUDIT_STORAGE_CHECK must be auto, true, or false.");
}

function endpointUrl(value) {
  const text = String(value ?? "").trim();
  return text.includes("://") ? text : `http://${text}`;
}

async function sampleCount(sql, values = []) {
  const countSql = `select count(*)::int as count from (${sql}) audit_rows`;
  const samplesSql = `select * from (${sql}) audit_rows limit ${sampleLimit}`;
  const [countResult, samplesResult] = await Promise.all([
    pool.query(countSql, values),
    pool.query(samplesSql, values),
  ]);
  return {
    count: Number(countResult.rows[0]?.count ?? 0),
    samples: samplesResult.rows.map(sanitizeSample),
  };
}

async function countWhere(relation, predicate) {
  if (!(await relationExists(relation))) {
    return null;
  }
  const result = await pool.query(`select count(*)::int as count from ${relation} where ${predicate}`);
  return Number(result.rows[0]?.count ?? 0);
}

function sanitizeSample(row) {
  const allowed = ["id", "couple_id", "user_id", "active_couple_count", "active_member_count", "created_at"];
  const sample = {};
  for (const key of allowed) {
    if (row[key] !== undefined) {
      sample[key] = row[key] instanceof Date ? row[key].toISOString() : row[key];
    }
  }
  return sample;
}

async function relationExists(relation) {
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

function positiveInteger(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
