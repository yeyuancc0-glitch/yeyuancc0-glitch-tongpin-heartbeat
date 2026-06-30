#!/usr/bin/env node

import process from "node:process";

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { loadConfig } from "../src/config.mjs";
import { createDbPool } from "../src/db.mjs";
import { createAndUploadImageThumbnail } from "../src/mediaThumbnail.mjs";

const apply = process.argv.includes("--apply");
const limit = positiveInteger(readArg("--limit") ?? process.env.MEDIA_THUMBNAIL_BACKFILL_LIMIT, 200);
const config = loadConfig(process.env);
const pool = createDbPool(config);
const s3 = new S3Client({
  endpoint: config.storage.endpoint,
  region: config.storage.region,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.storage.accessKeyId,
    secretAccessKey: config.storage.secretAccessKey,
  },
});

function readArg(name) {
  const prefix = `${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

function positiveInteger(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return parsed;
}

async function findCandidates() {
  const result = await pool.query(
    `
      select id, storage_path
        from public.media_files
       where deleted_at is null
         and upload_status = 'ready'
         and thumbnail_storage_path is null
       order by created_at asc
       limit $1
    `,
    [limit],
  );
  return result.rows;
}

async function backfillOne(row) {
  const thumbnail = await createAndUploadImageThumbnail({
    bucket: config.storage.bucket,
    key: row.storage_path,
    maxBytes: config.storage.maxThumbnailUploadBytes,
    s3,
  });
  const updated = await pool.query(
    `
      update public.media_files
         set thumbnail_storage_path = $2,
             updated_at = now()
       where id = $1
         and deleted_at is null
         and upload_status = 'ready'
         and thumbnail_storage_path is null
      returning id
    `,
    [row.id, thumbnail.key],
  );
  if (!updated.rows[0]) {
    await s3.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: thumbnail.key })).catch(() => {});
    return { id: row.id, status: "skipped_concurrent_update" };
  }
  return { id: row.id, status: "backfilled" };
}

async function main() {
  const candidates = await findCandidates();
  if (!apply) {
    console.log(JSON.stringify({
      status: "dry_run",
      candidateCount: candidates.length,
      limit,
      sampleIds: candidates.slice(0, 10).map((item) => item.id),
      next: "Run with --apply to generate and store thumbnails.",
    }));
    return;
  }

  const results = [];
  for (const row of candidates) {
    try {
      results.push(await backfillOne(row));
    } catch (error) {
      results.push({
        id: row.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const counts = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({
    status: "ok",
    limit,
    candidateCount: candidates.length,
    counts,
    failedIds: results.filter((item) => item.status === "failed").slice(0, 10).map((item) => item.id),
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
