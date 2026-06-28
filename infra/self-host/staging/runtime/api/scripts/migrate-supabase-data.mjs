#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

process.env.AWS_SDK_JS_NODE_VERSION_SUPPORT_WARNING_DISABLED ??= "true";

import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import pg from "pg";
import argon2 from "argon2";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const verifyOnly = args.has("--verify-only");
const includeStorage = args.has("--include-storage");
const copyStorage = args.has("--copy-storage");
const verifyStorage = args.has("--verify-storage") || copyStorage;
const enforceDbVerify = apply || verifyOnly || copyStorage;
const outDir = path.resolve(process.env.MIGRATION_OUT_DIR || "migration-artifacts/supabase-to-self-host");
const allowPlaceholderEmail = process.env.MIGRATION_ALLOW_PLACEHOLDER_EMAIL === "true";
const storageHashSampleLimit = parsePositiveInteger(process.env.MIGRATION_STORAGE_HASH_SAMPLE_LIMIT, 20);

const sourceUrl = process.env.SUPABASE_DB_URL || process.env.MIGRATION_SUPABASE_DB_URL;
const targetUrl = process.env.SELF_HOST_DB_URL || process.env.MIGRATION_SELF_HOST_DB_URL || buildSelfHostDbUrlFromEnv(process.env);

if (!sourceUrl || !targetUrl) {
  console.error("Missing database URLs. Set SUPABASE_DB_URL and either SELF_HOST_DB_URL or POSTGRES_* self-host variables, then rerun.");
  process.exit(1);
}

const source = new pg.Pool({ connectionString: sourceUrl, max: 4 });
const target = new pg.Pool({ connectionString: targetUrl, max: 4 });
let sourceAuthUsersById = new Map();
let sourceCoupleIdByMemberPair = new Map();
let sourceReferencedUserIds = new Set();
let syntheticProfileWarningEmitted = false;
const sourceReadCompatibilityWarnings = new Set();

const sourceColumnCompatibility = {
  "public.profiles": {
    avatar_thumbnail_url: "null::text",
    account_status: "'active'::text",
    deletion_requested_at: "null::timestamptz",
  },
  "public.checkins": {
    deleted_at: "null::timestamptz",
  },
  "public.future_letters": {
    title: "'一封写给你的信'::text",
    read_at: "null::timestamptz",
    dismissed_at: "null::timestamptz",
    updated_at: "created_at",
  },
  "public.media_files": {
    thumbnail_storage_path: "null::text",
    caption: "null::text",
    updated_at: "created_at",
  },
  "public.calendar_events": {
    note: "null::text",
  },
};

const tableSpecs = [
  {
    name: "profiles",
    order: 10,
    source: "public.profiles",
    target: "public.profiles",
    select: "id, display_name, avatar_url, avatar_thumbnail_url, birthdate, account_status, deletion_requested_at, created_at, updated_at",
    map: (row) => ({
      id: row.id,
      display_name: row.display_name,
      avatar_storage_path: row.avatar_url,
      avatar_thumbnail_storage_path: row.avatar_thumbnail_url,
      birthday: row.birthdate,
      account_status: row.account_status ?? "active",
      deletion_requested_at: row.deletion_requested_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }),
  },
  {
    name: "couples",
    order: 20,
    source: "public.couples",
    target: "public.couples",
    select: "id, status, started_at, created_by, created_at, ended_at",
    map: (row) => ({
      id: row.id,
      status: row.status,
      relationship_started_at: row.started_at,
      created_by_user_id: row.created_by,
      created_at: row.created_at,
      ended_at: row.ended_at,
    }),
  },
  {
    name: "couple_members",
    order: 30,
    source: "public.couple_members",
    target: "public.couple_members",
    select: "couple_id, user_id, joined_at, left_at",
    map: (row) => ({
      couple_id: row.couple_id,
      user_id: row.user_id,
      role: "partner",
      status: row.left_at ? "left" : "active",
      joined_at: row.joined_at,
      left_at: row.left_at,
    }),
  },
  {
    name: "pair_invites",
    order: 40,
    source: "public.pair_invites",
    target: "public.pair_invites",
    select: "id, code, created_by, accepted_by, status, expires_at, created_at, accepted_at",
    map: (row) => ({
      id: row.id,
      invite_code: row.code,
      inviter_user_id: row.created_by,
      accepted_by_user_id: row.accepted_by,
      couple_id: row.accepted_by ? sourceCoupleIdByMemberPair.get(memberPairKey(row.created_by, row.accepted_by)) ?? null : null,
      status: row.status,
      expires_at: row.expires_at,
      created_at: row.created_at,
      accepted_at: row.accepted_at,
      cancelled_at: row.status === "cancelled" ? row.accepted_at : null,
    }),
  },
  simpleSpec("messages", 50, "id, couple_id, sender_id, body, created_at, updated_at, deleted_at"),
  simpleSpec("checkins", 60, "id, couple_id, user_id, checkin_date, content, created_at, updated_at, deleted_at"),
  simpleSpec("mood_status", 70, "id, couple_id, user_id, mood, note, created_at, updated_at"),
  {
    name: "future_letters",
    order: 80,
    source: "public.future_letters",
    target: "public.future_letters",
    select: "id, couple_id, author_id, recipient_id, title, body, unlock_at, read_at, dismissed_at, created_at, updated_at, deleted_at",
    where: "recipient_id is not null",
  },
  simpleSpec("media_files", 90, "id, couple_id, uploader_id, storage_path, thumbnail_storage_path, mime_type, size_bytes, caption, created_at, updated_at, deleted_at", {
    upload_status: "ready",
  }),
  simpleSpec("calendar_events", 100, "id, couple_id, created_by, title, event_date, type, note, created_at, updated_at, deleted_at"),
  simpleSpec("couple_footprints", 110, "id, couple_id, created_by, title, note, latitude, longitude, visited_at, created_at, updated_at, deleted_at"),
  simpleSpec("notifications", 120, "id, couple_id, user_id, actor_id, type, title, body, related_table, related_id, read_at, dismissed_at, created_at"),
  simpleSpec("notification_preferences", 130, "user_id, push_enabled, message_enabled, interaction_enabled, checkin_enabled, letter_enabled, calendar_enabled, quiet_hours_enabled, quiet_start, quiet_end, created_at, updated_at"),
  simpleSpec("push_tokens", 140, "id, user_id, token, provider, device_id, platform, app_version, web_p256dh, web_auth, user_agent, enabled, last_seen_at, revoked_at, created_at"),
  simpleSpec("creation_spaces", 150, "id, couple_id, pet_key, pet_species, pet_name, pet_mood, pet_level, growth_points, fullness, cleanliness, affection, energy, boredom, comfort, curiosity, current_action, personality_seed, last_brain_tick_at, last_ai_response_at, last_ai_bubble, last_rig_cue, treat_balance, basic_food_count, premium_food_count, last_fed_food, last_fed_at, last_played_at, home_theme, decor_slot_1, decor_slot_2, decor_slot_3, last_interaction_at, last_world_decision, pet_world_surface, pet_world_state, pet_world_mood, pet_hidden, pet_last_seen_at, pet_last_found_at, pet_last_surface_changed_at, pet_sleep_started_at, pet_sleep_recovered_energy, created_at, updated_at"),
  simpleSpec("creation_actions", 160, "id, couple_id, actor_id, action_type, action_label, metadata, created_at"),
  simpleSpec("pet_memories", 170, "id, couple_id, memory_type, memory_scope, importance, summary, metadata, expires_at, archived_at, created_by, created_at"),
  simpleSpec("reports", 180, "id, couple_id, reporter_id, reported_user_id, reason, details, status, created_at"),
  simpleSpec("blocks", 190, "id, blocker_id, blocked_user_id, couple_id, reason, created_at"),
  simpleSpec("account_deletion_requests", 200, "id, user_id, reason, status, requested_at, resolved_at"),
  simpleSpec("app_feedback", 210, "id, user_id, couple_id, body, status, metadata, created_at"),
];

function simpleSpec(name, order, select, defaults = {}) {
  return {
    name,
    order,
    source: `public.${name}`,
    target: `public.${name}`,
    select,
    map: (row) => ({ ...row, ...defaults }),
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  await mkdir(outDir, { recursive: true });
  const report = {
    startedAt,
    mode: copyStorage ? "copy-storage" : verifyOnly ? "verify-only" : apply ? "apply" : "dry-run",
    source: "supabase",
    target: "self-host",
    tables: [],
    storage: [],
    warnings: [],
    errors: [],
    gates: {
      dbVerify: enforceDbVerify ? "enforced" : "preview-only",
      storageVerify: verifyStorage ? "enforced" : includeStorage ? "inventory-only" : "not-requested",
    },
  };

  try {
    await preflight(report);
    sourceAuthUsersById = await loadSourceAuthUsers(report);
    sourceReferencedUserIds = await loadSourceReferencedUserIds(report);
    sourceCoupleIdByMemberPair = await loadSourceCouplePairs(report);
    if (!verifyOnly) {
      const ordered = [...tableSpecs].sort((left, right) => left.order - right.order);
      for (const spec of ordered) {
        await migrateTable(spec, report);
      }
    }
    await verifyTables(report);
    if (includeStorage) {
      await inventoryStorage(report);
    }
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    report.finishedAt = new Date().toISOString();
    report.status = report.errors.length ? "failed" : "ok";
    await writeReport(report);
    await source.end();
    await target.end();
  }

  if (report.errors.length) {
    console.error(`Migration ${report.mode} failed. Report: ${path.join(outDir, "latest-report.json")}`);
    for (const error of report.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Migration ${report.mode} completed. Report: ${path.join(outDir, "latest-report.json")}`);
}

async function preflight(report) {
  for (const spec of tableSpecs) {
    const sourceExists = await relationExists(source, spec.source);
    const targetExists = await relationExists(target, spec.target);
    if (!sourceExists) {
      report.warnings.push(`${spec.source} missing in source; treated as empty.`);
    }
    if (!targetExists) {
      throw new Error(`${spec.target} missing in self-host target. Apply self-host migrations first.`);
    }
  }
}

async function relationExists(pool, relation) {
  const { schema, table } = splitRelation(relation);
  const result = await pool.query(
    `select exists (
       select 1 from information_schema.tables
        where table_schema = $1 and table_name = $2
     ) as exists`,
    [schema, table]
  );
  return Boolean(result.rows[0]?.exists);
}

async function columnExists(pool, relation, column) {
  const { schema, table } = splitRelation(relation);
  const result = await pool.query(
    `select exists (
       select 1 from information_schema.columns
        where table_schema = $1
          and table_name = $2
          and column_name = $3
     ) as exists`,
    [schema, table, column]
  );
  return Boolean(result.rows[0]?.exists);
}

async function migrateTable(spec, report) {
  const rows = await sourceRowsForSpec(spec, report);
  const mapped = rows.map((row) => (spec.map ? spec.map(row) : row));
  const artifact = {
    table: spec.name,
    sourceCount: rows.length,
    targetBeforeCount: await countRows(target, spec.target),
    insertedOrUpdated: 0,
    sourceHash: stableHash(mapped),
  };

  if (apply && mapped.length) {
    await withTargetTransaction(async (client) => {
      await withUpdatedAtTriggersDisabled(client, spec.target, async () => {
        if (spec.name === "profiles") {
          await upsertAccounts(client, rows);
        }
        artifact.insertedOrUpdated = await upsertRows(client, spec.target, mapped);
        if (spec.name === "couple_members") {
          await repairAcceptedInviteCoupleIds(client);
        }
      });
    });
  }

  artifact.targetAfterCount = await countRows(target, spec.target);
  artifact.targetSubsetCount = mapped.length ? await countTargetSubsetRows(target, spec.target, mapped) : 0;
  artifact.extraTargetRows = Math.max(0, artifact.targetAfterCount - artifact.targetSubsetCount);
  artifact.targetHash = await tableHashForRows(target, spec.target, mapped, Object.keys(mapped[0] ?? sampleColumns(spec)));
  artifact.matchesAfterApply = apply ? artifact.sourceHash === artifact.targetHash : null;
  if (apply && !artifact.matchesAfterApply) {
    report.errors.push(`${spec.name} hash mismatch after apply.`);
  }
  report.tables.push(artifact);
}

async function readRows(pool, spec, report = null) {
  if (!(await relationExists(pool, spec.source))) {
    return [];
  }
  const readSpec = await sourceReadSpec(pool, spec);
  if (readSpec.skip) {
    if (readSpec.warning) {
      warnSourceReadCompatibility(readSpec.warning, report);
    }
    return [];
  }
  for (const warning of readSpec.warnings) {
    warnSourceReadCompatibility(warning, report);
  }
  const where = readSpec.where ? ` where ${readSpec.where}` : "";
  const result = await pool.query(`select ${readSpec.select} from ${spec.source}${where} order by 1`);
  return result.rows;
}

async function sourceReadSpec(pool, spec) {
  const compatibility = sourceColumnCompatibility[spec.source] ?? {};
  const selectedColumns = parseSelectedColumns(spec.select);
  const selectParts = [];
  const warnings = [];
  const missingColumns = [];

  for (const column of selectedColumns) {
    if (await columnExists(pool, spec.source, column)) {
      selectParts.push(quoteIdent(column));
      continue;
    }
    const fallbackExpression = compatibility[column];
    if (!fallbackExpression) {
      missingColumns.push(column);
      continue;
    }
    selectParts.push(`${fallbackExpression} as ${quoteIdent(column)}`);
    warnings.push(`${spec.source}.${column} missing in source; using migration compatibility fallback.`);
  }

  if (missingColumns.length) {
    return {
      skip: true,
      warning: `${spec.source} missing required source column(s): ${missingColumns.join(", ")}; table treated as empty.`,
    };
  }

  if (spec.name === "future_letters" && !(await columnExists(pool, spec.source, "recipient_id"))) {
    return {
      skip: true,
      warning: "public.future_letters.recipient_id missing in source; old letters cannot be safely assigned to a recipient and are skipped.",
    };
  }

  return {
    skip: false,
    select: selectParts.join(", "),
    where: spec.where ?? "",
    warnings,
  };
}

function parseSelectedColumns(select) {
  return select
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^"|"$/g, ""));
}

function warnSourceReadCompatibility(message, report = null) {
  if (sourceReadCompatibilityWarnings.has(message)) {
    return;
  }
  sourceReadCompatibilityWarnings.add(message);
  if (report) {
    report.warnings.push(message);
  }
  console.warn(`[migration compatibility] ${message}`);
}

async function sourceRowsForSpec(spec, report) {
  const rows = await readRows(source, spec, report);
  if (spec.name !== "profiles") {
    return rows;
  }
  return augmentProfileRows(rows, report);
}

function augmentProfileRows(rows, report) {
  const profileById = new Map(rows.map((row) => [String(row.id), row]));
  const requiredUserIds = new Set([
    ...sourceAuthUsersById.keys(),
    ...sourceReferencedUserIds,
  ]);
  let syntheticCount = 0;
  let syntheticWithoutAuthCount = 0;

  for (const userId of requiredUserIds) {
    if (profileById.has(userId)) {
      continue;
    }
    const authUser = sourceAuthUsersById.get(userId);
    if (!authUser) {
      syntheticWithoutAuthCount += 1;
    }
    profileById.set(userId, {
      id: userId,
      display_name: null,
      avatar_url: null,
      avatar_thumbnail_url: null,
      birthdate: null,
      account_status: "active",
      deletion_requested_at: null,
      created_at: authUser?.createdAt ?? new Date(0),
      updated_at: authUser?.updatedAt ?? authUser?.createdAt ?? new Date(0),
    });
    syntheticCount += 1;
  }

  if (syntheticCount && !syntheticProfileWarningEmitted) {
    report.warnings.push(`profiles synthesized for ${syntheticCount} auth/business-referenced user(s) missing public.profiles in source.`);
  }
  if (syntheticWithoutAuthCount && !syntheticProfileWarningEmitted) {
    report.warnings.push(`profiles synthesized for ${syntheticWithoutAuthCount} business-referenced user(s) missing auth.users in source; placeholder email requires MIGRATION_ALLOW_PLACEHOLDER_EMAIL=true.`);
  }
  syntheticProfileWarningEmitted = syntheticProfileWarningEmitted || syntheticCount > 0 || syntheticWithoutAuthCount > 0;

  return Array.from(profileById.values()).sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

async function upsertAccounts(client, profileRows) {
  const sql = `
    insert into app_auth.accounts (
      id, email, password_hash, password_hash_algorithm, email_verified_at, disabled_at, disabled_reason, created_at, updated_at
    ) values ($1, $2, $3, 'argon2id', $4, $5, $6, $7, $8)
    on conflict (id) do update set
      email = excluded.email,
      email_verified_at = coalesce(app_auth.accounts.email_verified_at, excluded.email_verified_at),
      disabled_at = excluded.disabled_at,
      disabled_reason = excluded.disabled_reason,
      updated_at = excluded.updated_at
  `;
  for (const row of profileRows) {
    const sourceAuthUser = sourceAuthUsersById.get(row.id);
    const email = sourceAuthUser?.email ?? `${row.id}@migrated.invalid`;
    if (!sourceAuthUser?.email && !allowPlaceholderEmail) {
      throw new Error(`Missing auth.users email for profile ${row.id}. Set MIGRATION_ALLOW_PLACEHOLDER_EMAIL=true only for non-production dry runs.`);
    }
    const passwordHash = await argon2.hash(randomBytes(32).toString("hex"), { type: argon2.argon2id });
    await client.query(sql, [
      row.id,
      email,
      passwordHash,
      sourceAuthUser?.emailConfirmedAt ?? row.created_at ?? new Date(),
      sourceAuthUser?.disabledAt ?? (row.account_status === "frozen" ? row.updated_at ?? new Date() : null),
      sourceAuthUser?.disabledReason ?? (row.account_status === "frozen" ? "migrated_from_supabase_frozen" : null),
      sourceAuthUser?.createdAt ?? row.created_at ?? new Date(),
      sourceAuthUser?.updatedAt ?? row.updated_at ?? row.created_at ?? new Date(),
    ]);
  }
}

async function upsertRows(client, relation, rows) {
  if (!rows.length) {
    return 0;
  }
  const columns = Object.keys(rows[0]);
  const conflict = conflictColumns(relation);
  const updateColumns = columns.filter((column) => !conflict.includes(column));
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const updates = updateColumns.length
    ? `do update set ${updateColumns.map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`).join(", ")}`
    : "do nothing";
  const sql = `
    insert into ${relation} (${columns.map(quoteIdent).join(", ")})
    values (${placeholders})
    on conflict (${conflict.map(quoteIdent).join(", ")}) ${updates}
  `;
  for (const row of rows) {
    await client.query(sql, columns.map((column) => row[column]));
  }
  return rows.length;
}

async function withUpdatedAtTriggersDisabled(client, relation, callback) {
  const { schema, table } = splitRelation(relation);
  const result = await client.query(
    `select trigger_name
       from information_schema.triggers
      where trigger_schema = $1
        and event_object_schema = $1
        and event_object_table = $2
        and action_statement like '%set_updated_at%'`,
    [schema, table]
  );
  const triggers = result.rows.map((row) => row.trigger_name);
  for (const trigger of triggers) {
    await client.query(`alter table ${relation} disable trigger ${quoteIdent(trigger)}`);
  }
  try {
    return await callback();
  } finally {
    for (const trigger of triggers) {
      await client.query(`alter table ${relation} enable trigger ${quoteIdent(trigger)}`);
    }
  }
}

function conflictColumns(relation) {
  if (relation.endsWith(".couple_members")) {
    return ["couple_id", "user_id"];
  }
  if (relation.endsWith(".notification_preferences")) {
    return ["user_id"];
  }
  return ["id"];
}

async function repairAcceptedInviteCoupleIds(client) {
  await client.query(`
    update public.pair_invites pi
       set couple_id = cm.couple_id
      from public.couple_members cm
     where pi.status = 'accepted'
       and pi.couple_id is null
       and cm.user_id = pi.inviter_user_id
       and exists (
         select 1
           from public.couple_members accepted
          where accepted.couple_id = cm.couple_id
            and accepted.user_id = pi.accepted_by_user_id
       )
  `);
}

async function verifyTables(report) {
  for (const spec of tableSpecs) {
    const sourceRows = (await sourceRowsForSpec(spec, report)).map((row) => (spec.map ? spec.map(row) : row));
    const columns = Object.keys(sourceRows[0] ?? sampleColumns(spec));
    const sourceHash = stableHash(sourceRows);
    const targetHash = await tableHashForRows(target, spec.target, sourceRows, columns);
    const sourceCount = sourceRows.length;
    const targetCount = await countRows(target, spec.target);
    const targetSubsetCount = sourceRows.length ? await countTargetSubsetRows(target, spec.target, sourceRows) : 0;
    const matched = sourceHash === targetHash;
    report.tables.push({
      table: `${spec.name}:verify`,
      sourceCount,
      targetCount,
      targetSubsetCount,
      extraTargetRows: Math.max(0, targetCount - targetSubsetCount),
      sourceHash,
      targetHash,
      matched,
    });
    if (targetSubsetCount !== sourceCount || !matched) {
      const mismatch = `${spec.name} verify mismatch: source=${sourceCount} targetSubset=${targetSubsetCount} hashMatched=${matched}.`;
      if (enforceDbVerify) {
        report.errors.push(mismatch);
      } else {
        report.warnings.push(`${mismatch} Dry-run is preview-only; run apply then verify before cutover.`);
      }
    }
  }
  await verifyCheckinCoverage(report);
}

async function verifyCheckinCoverage(report) {
  const sourceRows = await readRows(source, tableSpecs.find((spec) => spec.name === "checkins"), report);
  const targetRows = await readRows(target, tableSpecs.find((spec) => spec.name === "checkins"), report);
  const sourceByUser = groupCheckinsByUser(sourceRows);
  const targetByUser = groupCheckinsByUser(targetRows);
  for (const [userId, sourceCount] of sourceByUser.entries()) {
    const targetCount = targetByUser.get(userId) ?? 0;
    if (targetCount < sourceCount) {
      const mismatch = `checkins user coverage mismatch for ${userId}: source=${sourceCount} target=${targetCount}`;
      if (enforceDbVerify) {
        report.errors.push(mismatch);
      } else {
        report.warnings.push(`${mismatch} Dry-run is preview-only; run apply then verify before cutover.`);
      }
    }
  }
}

async function inventoryStorage(report) {
  const mediaRows = await readRows(source, tableSpecs.find((spec) => spec.name === "media_files"), report);
  const profileRows = await readRows(source, tableSpecs.find((spec) => spec.name === "profiles"), report);
  const storageObjects = [];
  for (const row of mediaRows) {
    addStorageObject(storageObjects, { bucket: "couple-media", path: row.storage_path, sourceTable: "media_files", sourceId: row.id, variant: "original" });
    if (row.thumbnail_storage_path) {
      addStorageObject(storageObjects, { bucket: "couple-media", path: row.thumbnail_storage_path, sourceTable: "media_files", sourceId: row.id, variant: "thumbnail" });
    }
  }
  for (const row of profileRows) {
    if (row.avatar_url) {
      addStorageObject(storageObjects, { bucket: "profile-avatars", path: row.avatar_url, sourceTable: "profiles", sourceId: row.id, variant: "original" });
    }
    if (row.avatar_thumbnail_url) {
      addStorageObject(storageObjects, { bucket: "profile-avatars", path: row.avatar_thumbnail_url, sourceTable: "profiles", sourceId: row.id, variant: "thumbnail" });
    }
  }
  const storageSummary = {
    objectCount: storageObjects.length,
    byBucket: storageObjects.reduce((acc, item) => {
      acc[item.bucket] = (acc[item.bucket] ?? 0) + 1;
      return acc;
    }, {}),
    hash: stableHash(storageObjects),
    copied: null,
    verified: null,
    hashSampleLimit: storageHashSampleLimit,
    note: "Copy these objects from Supabase Storage into matching MinIO buckets before production cutover.",
  };
  await writeFile(path.join(outDir, "storage-objects.json"), JSON.stringify(storageObjects, null, 2));
  if (copyStorage || verifyStorage) {
    const storageClients = createStorageClients();
    if (copyStorage) {
      storageSummary.copied = await copyStorageObjects(storageClients, storageObjects, report);
    }
    storageSummary.verified = await verifyStorageObjects(storageClients, storageObjects, report);
  }
  report.storage.push(storageSummary);
}

function groupCheckinsByUser(rows) {
  const counts = new Map();
  for (const row of rows) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }
  return counts;
}

function addStorageObject(storageObjects, item) {
  if (!item.path) {
    return;
  }
  storageObjects.push(item);
}

function createStorageClients() {
  const sourceStorage = sourceStorageConfig(process.env);
  const targetStorage = targetStorageConfig(process.env);
  const missing = [
    ...missingStorageFields("source", sourceStorage),
    ...missingStorageFields("target", targetStorage),
  ];
  if (missing.length) {
    throw new Error(`Missing Storage migration config: ${missing.join(", ")}.`);
  }
  return {
    source: new S3Client({
      endpoint: sourceStorage.endpoint,
      region: sourceStorage.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: sourceStorage.accessKeyId,
        secretAccessKey: sourceStorage.secretAccessKey,
      },
    }),
    target: new S3Client({
      endpoint: targetStorage.endpoint,
      region: targetStorage.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: targetStorage.accessKeyId,
        secretAccessKey: targetStorage.secretAccessKey,
      },
    }),
  };
}

function sourceStorageConfig(env) {
  return {
    endpoint: env.SUPABASE_STORAGE_S3_ENDPOINT || env.MIGRATION_SUPABASE_STORAGE_S3_ENDPOINT || "",
    region: env.SUPABASE_STORAGE_S3_REGION || env.MIGRATION_SUPABASE_STORAGE_S3_REGION || "",
    accessKeyId: env.SUPABASE_STORAGE_S3_ACCESS_KEY_ID || env.MIGRATION_SUPABASE_STORAGE_S3_ACCESS_KEY_ID || "",
    secretAccessKey: env.SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY || env.MIGRATION_SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY || "",
  };
}

function targetStorageConfig(env) {
  return {
    endpoint: endpointUrl(env.MINIO_ENDPOINT || env.MIGRATION_MINIO_ENDPOINT || "127.0.0.1:9000"),
    region: env.MINIO_REGION || env.MIGRATION_MINIO_REGION || "us-east-1",
    accessKeyId: env.MINIO_ROOT_USER || env.MIGRATION_MINIO_ACCESS_KEY_ID || "",
    secretAccessKey: env.MINIO_ROOT_PASSWORD || env.MIGRATION_MINIO_SECRET_ACCESS_KEY || "",
  };
}

function missingStorageFields(label, config) {
  return Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => `${label}.${key}`);
}

async function copyStorageObjects(clients, storageObjects, report) {
  const result = { copied: 0, skippedExisting: 0, failed: 0 };
  const bucketNames = [...new Set(storageObjects.map((item) => item.bucket))];
  for (const bucket of bucketNames) {
    await ensureBucket(clients.target, bucket);
  }

  for (const item of storageObjects) {
    try {
      const existing = await headObjectOrNull(clients.target, item.bucket, item.path);
      if (existing) {
        result.skippedExisting += 1;
        continue;
      }
      const object = await clients.source.send(new GetObjectCommand({ Bucket: item.bucket, Key: item.path }));
      await clients.target.send(new PutObjectCommand({
        Bucket: item.bucket,
        Key: item.path,
        Body: object.Body,
        ContentType: object.ContentType,
        ContentLength: object.ContentLength,
        Metadata: object.Metadata,
      }));
      result.copied += 1;
    } catch (error) {
      result.failed += 1;
      report.errors.push(`Storage copy failed for ${item.bucket}/${item.path}: ${errorMessage(error)}`);
    }
  }
  return result;
}

async function verifyStorageObjects(clients, storageObjects, report) {
  const result = {
    checked: 0,
    missingSource: 0,
    missingTarget: 0,
    sizeMismatches: 0,
    hashedSamples: 0,
    hashMismatches: 0,
  };

  const sampleIndexes = storageHashSampleIndexes(storageObjects.length, storageHashSampleLimit);
  for (let index = 0; index < storageObjects.length; index += 1) {
    const item = storageObjects[index];
    const sourceHead = await headObjectOrNull(clients.source, item.bucket, item.path);
    const targetHead = await headObjectOrNull(clients.target, item.bucket, item.path);
    result.checked += 1;
    if (!sourceHead) {
      result.missingSource += 1;
      report.errors.push(`Storage source object missing: ${item.bucket}/${item.path}`);
      continue;
    }
    if (!targetHead) {
      result.missingTarget += 1;
      report.errors.push(`Storage target object missing: ${item.bucket}/${item.path}`);
      continue;
    }
    if (Number(sourceHead.ContentLength ?? -1) !== Number(targetHead.ContentLength ?? -2)) {
      result.sizeMismatches += 1;
      report.errors.push(`Storage size mismatch for ${item.bucket}/${item.path}`);
      continue;
    }
    if (sampleIndexes.has(index)) {
      const [sourceHash, targetHash] = await Promise.all([
        objectSha256(clients.source, item.bucket, item.path),
        objectSha256(clients.target, item.bucket, item.path),
      ]);
      result.hashedSamples += 1;
      if (sourceHash !== targetHash) {
        result.hashMismatches += 1;
        report.errors.push(`Storage hash mismatch for ${item.bucket}/${item.path}`);
      }
    }
  }
  return result;
}

async function ensureBucket(client, bucket) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

async function headObjectOrNull(client, bucket, key) {
  try {
    return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    const statusCode = error?.$metadata?.httpStatusCode;
    const name = error?.name || error?.Code || error?.code;
    if (statusCode === 404 || name === "NotFound" || name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

async function objectSha256(client, bucket, key) {
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await object.Body.transformToByteArray();
  return createHash("sha256").update(body).digest("hex");
}

function storageHashSampleIndexes(length, limit) {
  const indexes = new Set();
  if (length <= 0 || limit <= 0) {
    return indexes;
  }
  if (length <= limit) {
    for (let index = 0; index < length; index += 1) {
      indexes.add(index);
    }
    return indexes;
  }
  for (let index = 0; index < limit; index += 1) {
    indexes.add(Math.floor((index * length) / limit));
  }
  indexes.add(length - 1);
  return indexes;
}

async function countRows(pool, relation) {
  const result = await pool.query(`select count(*)::int as count from ${relation}`);
  return result.rows[0]?.count ?? 0;
}

async function tableHashForRows(pool, relation, sourceRows, columns) {
  if (!sourceRows.length || !columns.length) {
    return stableHash([]);
  }
  const { whereSql, values } = subsetWhere(relation, sourceRows);
  const result = await pool.query(`select ${columns.map(quoteIdent).join(", ")} from ${relation} where ${whereSql} order by 1`, values);
  return stableHash(result.rows);
}

async function countTargetSubsetRows(pool, relation, sourceRows) {
  const { whereSql, values } = subsetWhere(relation, sourceRows);
  const result = await pool.query(`select count(*)::int as count from ${relation} where ${whereSql}`, values);
  return result.rows[0]?.count ?? 0;
}

function subsetWhere(relation, sourceRows) {
  if (relation.endsWith(".couple_members")) {
    const values = [];
    const pairs = sourceRows.map((row, index) => {
      values.push(row.couple_id, row.user_id);
      const offset = index * 2;
      return `(couple_id = $${offset + 1} and user_id = $${offset + 2})`;
    });
    return { whereSql: pairs.length ? pairs.join(" or ") : "false", values };
  }
  if (relation.endsWith(".notification_preferences")) {
    return { whereSql: "user_id = any($1::uuid[])", values: [sourceRows.map((row) => row.user_id)] };
  }
  return { whereSql: "id = any($1::uuid[])", values: [sourceRows.map((row) => row.id)] };
}

function sampleColumns(spec) {
  const firstColumn = spec.select.split(",")[0]?.trim();
  return firstColumn ? { [firstColumn]: null } : {};
}

async function loadSourceAuthUsers(report) {
  if (!(await relationExists(source, "auth.users"))) {
    const message = "auth.users missing in Supabase source; user emails cannot be preserved.";
    if (!allowPlaceholderEmail) {
      throw new Error(`${message} Set MIGRATION_ALLOW_PLACEHOLDER_EMAIL=true only for non-production dry runs.`);
    }
    report.warnings.push(message);
    return new Map();
  }
  const result = await source.query(`
    select id, email, email_confirmed_at, banned_until, deleted_at, created_at, updated_at
      from auth.users
     order by id
  `);
  return new Map(result.rows.map((row) => [
    row.id,
    {
      email: row.email,
      emailConfirmedAt: row.email_confirmed_at,
      disabledAt: row.deleted_at ?? row.banned_until ?? null,
      disabledReason: row.deleted_at ? "migrated_from_supabase_deleted" : row.banned_until ? "migrated_from_supabase_banned" : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  ]));
}

async function loadSourceReferencedUserIds(report) {
  const checks = [
    ["public.couples", ["created_by"]],
    ["public.couple_members", ["user_id"]],
    ["public.pair_invites", ["created_by", "accepted_by"]],
    ["public.messages", ["sender_id"]],
    ["public.checkins", ["user_id"]],
    ["public.mood_status", ["user_id"]],
    ["public.future_letters", ["author_id", "recipient_id"]],
    ["public.media_files", ["uploader_id"]],
    ["public.calendar_events", ["created_by"]],
    ["public.couple_footprints", ["created_by"]],
    ["public.notifications", ["user_id", "actor_id"]],
    ["public.notification_preferences", ["user_id"]],
    ["public.push_tokens", ["user_id"]],
    ["public.creation_actions", ["actor_id"]],
    ["public.pet_memories", ["created_by"]],
    ["public.reports", ["reporter_id", "reported_user_id"]],
    ["public.blocks", ["blocker_id", "blocked_user_id"]],
    ["public.account_deletion_requests", ["user_id"]],
    ["public.app_feedback", ["user_id"]],
  ];
  const userIds = new Set();

  for (const [relation, columns] of checks) {
    if (!(await relationExists(source, relation))) {
      continue;
    }
    const existingColumns = [];
    for (const column of columns) {
      if (await columnExists(source, relation, column)) {
        existingColumns.push(column);
      }
    }
    if (!existingColumns.length) {
      continue;
    }
    const selects = existingColumns.map((column) => `select ${quoteIdent(column)} as user_id from ${relation} where ${quoteIdent(column)} is not null`);
    const result = await source.query(selects.join(" union "));
    for (const row of result.rows) {
      if (row.user_id) {
        userIds.add(String(row.user_id));
      }
    }
  }

  const missingAuthCount = Array.from(userIds).filter((userId) => !sourceAuthUsersById.has(userId)).length;
  if (missingAuthCount) {
    report.warnings.push(`${missingAuthCount} business-referenced user id(s) were not found in auth.users; migration will require placeholder emails or source repair.`);
  }
  return userIds;
}

async function loadSourceCouplePairs(report) {
  if (!(await relationExists(source, "public.couple_members"))) {
    report.warnings.push("public.couple_members missing in source; accepted invite couple_id mapping unavailable.");
    return new Map();
  }
  const result = await source.query(`
    select cm1.couple_id, cm1.user_id as left_user_id, cm2.user_id as right_user_id
      from public.couple_members cm1
      join public.couple_members cm2
        on cm2.couple_id = cm1.couple_id
       and cm2.user_id <> cm1.user_id
     order by cm1.couple_id
  `);
  const map = new Map();
  for (const row of result.rows) {
    map.set(memberPairKey(row.left_user_id, row.right_user_id), row.couple_id);
  }
  return map;
}

function memberPairKey(left, right) {
  return [left, right].sort().join(":");
}

async function withTargetTransaction(callback) {
  const client = await target.connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function stableHash(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value) {
  return JSON.stringify(value, (_key, input) => {
    if (input && typeof input === "object" && !Array.isArray(input)) {
      return Object.keys(input).sort().reduce((next, key) => {
        next[key] = input[key];
        return next;
      }, {});
    }
    return input;
  });
}

function splitRelation(relation) {
  const [schema, table] = relation.split(".");
  return { schema, table };
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
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
  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const encodedDatabase = encodeURIComponent(database);
  return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${encodedDatabase}`;
}

function endpointUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "http://127.0.0.1:9000";
  }
  return text.includes("://") ? text : `http://${text}`;
}

function parsePositiveInteger(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return parsed;
}

function errorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function writeReport(report) {
  await writeFile(path.join(outDir, "latest-report.json"), JSON.stringify(report, null, 2));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(path.join(outDir, `report-${timestamp}.json`), JSON.stringify(report, null, 2));
}

main();
