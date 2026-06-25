#!/usr/bin/env node

import process from "node:process";

process.env.AWS_SDK_JS_NODE_VERSION_SUPPORT_WARNING_DISABLED ??= "true";

import {
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import pg from "pg";

const sourceUrl = process.env.SUPABASE_DB_URL || process.env.MIGRATION_SUPABASE_DB_URL;
const targetUrl = process.env.SELF_HOST_DB_URL || process.env.MIGRATION_SELF_HOST_DB_URL || buildSelfHostDbUrlFromEnv(process.env);

const requiredSourceRelations = [
  "auth.users",
  "public.profiles",
  "public.couples",
  "public.couple_members",
];

const optionalSourceRelations = [
  "public.pair_invites",
  "public.messages",
  "public.checkins",
  "public.mood_status",
  "public.future_letters",
  "public.media_files",
  "public.calendar_events",
  "public.couple_footprints",
  "public.notifications",
  "public.notification_preferences",
  "public.push_tokens",
  "public.creation_spaces",
  "public.creation_actions",
  "public.pet_memories",
  "public.reports",
  "public.blocks",
  "public.account_deletion_requests",
  "public.app_feedback",
];

const requiredTargetRelations = [
  "app_auth.accounts",
  "public.profiles",
  "public.couples",
  "public.couple_members",
  "public.pair_invites",
  ...optionalSourceRelations.filter((relation) => relation !== "public.pair_invites"),
];

const storageBuckets = ["couple-media", "profile-avatars"];
const checks = [];
const warnings = [];
const errors = [];

async function main() {
  const sourceStorage = sourceStorageConfig(process.env);
  const targetStorage = targetStorageConfig(process.env);
  requireEnv("SUPABASE_DB_URL or MIGRATION_SUPABASE_DB_URL", sourceUrl);
  requireEnv("SELF_HOST_DB_URL/MIGRATION_SELF_HOST_DB_URL or POSTGRES_*", targetUrl);
  requireStorageConfig("Supabase Storage S3", sourceStorage, [
    "SUPABASE_STORAGE_S3_ENDPOINT",
    "SUPABASE_STORAGE_S3_REGION",
    "SUPABASE_STORAGE_S3_ACCESS_KEY_ID",
    "SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY",
  ]);
  requireStorageConfig("MinIO", targetStorage, [
    "MINIO_ENDPOINT",
    "MINIO_REGION",
    "MINIO_ROOT_USER or MIGRATION_MINIO_ACCESS_KEY_ID",
    "MINIO_ROOT_PASSWORD or MIGRATION_MINIO_SECRET_ACCESS_KEY",
  ]);

  await checkDatabases();
  await checkStorage(sourceStorage, targetStorage);

  const status = errors.length ? "failed" : "ok";
  for (const line of checks) {
    console.log(`OK ${line}`);
  }
  for (const line of warnings) {
    console.log(`WARN ${line}`);
  }
  for (const line of errors) {
    console.error(`ERROR ${line}`);
  }
  console.log(`SUMMARY migration_readiness status=${status} checks=${checks.length} warnings=${warnings.length} errors=${errors.length}`);
  process.exit(errors.length ? 1 : 0);
}

function requireEnv(label, value) {
  if (value) {
    checks.push(`env ${label}=present`);
  } else {
    errors.push(`env ${label}=missing`);
  }
}

function requireStorageConfig(label, config, envLabels) {
  const keys = Object.keys(config);
  keys.forEach((key, index) => {
    if (config[key]) {
      checks.push(`env ${label}.${key}=present`);
    } else {
      errors.push(`env ${envLabels[index]}=missing`);
    }
  });
}

async function checkDatabases() {
  const source = sourceUrl ? new pg.Pool({ connectionString: sourceUrl, max: 2 }) : null;
  const target = targetUrl ? new pg.Pool({ connectionString: targetUrl, max: 2 }) : null;
  try {
    if (source) {
      await queryOne(source, "select 1");
      checks.push("source_db connect=ok");
      for (const relation of requiredSourceRelations) {
        await requireRelation(source, relation, "source");
      }
      for (const relation of optionalSourceRelations) {
        await optionalRelation(source, relation, "source");
      }
      await checkSourceEmailCoverage(source);
    }
    if (target) {
      await queryOne(target, "select 1");
      checks.push("target_db connect=ok");
      for (const relation of requiredTargetRelations) {
        await requireRelation(target, relation, "target");
      }
    }
  } finally {
    await source?.end();
    await target?.end();
  }
}

async function checkSourceEmailCoverage(pool) {
  const result = await pool.query(`
    select count(*)::int as missing_email_count
      from public.profiles p
      left join auth.users u
        on u.id = p.id
     where nullif(u.email, '') is null
  `);
  const missing = Number(result.rows[0]?.missing_email_count ?? 0);
  if (missing > 0) {
    errors.push(`source_auth email_missing_for_profiles count=${missing}`);
  } else {
    checks.push("source_auth profile_email_coverage=ok");
  }
}

async function checkStorage(sourceStorage, targetStorage) {
  if (allStorageFieldsPresent(sourceStorage)) {
    const source = createStorageClient(sourceStorage);
    for (const bucket of storageBuckets) {
      await requireBucket(source, bucket, "source_storage");
    }
  }
  if (allStorageFieldsPresent(targetStorage)) {
    const target = createStorageClient(targetStorage);
    for (const bucket of storageBuckets) {
      await requireBucket(target, bucket, "target_storage");
    }
  }
}

function allStorageFieldsPresent(config) {
  return Object.values(config).every(Boolean);
}

function createStorageClient(config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

async function requireBucket(client, bucket, label) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    checks.push(`${label} bucket=${bucket} access=ok`);
  } catch (error) {
    errors.push(`${label} bucket=${bucket} access=failed reason=${safeErrorName(error)}`);
  }
}

async function requireRelation(pool, relation, label) {
  if (await relationExists(pool, relation)) {
    checks.push(`${label} relation=${relation} exists=true`);
  } else {
    errors.push(`${label} relation=${relation} exists=false`);
  }
}

async function optionalRelation(pool, relation, label) {
  if (await relationExists(pool, relation)) {
    checks.push(`${label} relation=${relation} exists=true`);
  } else {
    warnings.push(`${label} relation=${relation} exists=false treated_as_empty`);
  }
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

async function queryOne(pool, sql) {
  return pool.query(sql);
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

function endpointUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "http://127.0.0.1:9000";
  }
  return text.includes("://") ? text : `http://${text}`;
}

function safeErrorName(error) {
  return String(error?.name || error?.Code || error?.code || error?.$metadata?.httpStatusCode || "unknown").replace(/[^A-Za-z0-9_.-]/g, "_");
}

main().catch((error) => {
  console.error(`ERROR readiness unexpected_failure reason=${safeErrorName(error)}`);
  console.log("SUMMARY migration_readiness status=failed checks=0 warnings=0 errors=1");
  process.exit(1);
});
