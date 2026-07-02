import { randomUUID } from "node:crypto";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { AuthError } from "./authService.mjs";
import { withTransaction } from "./db.mjs";
import { createAndUploadImageThumbnail } from "./mediaThumbnail.mjs";

const extensionByMime = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const defaultMediaListLimit = 1000;
const maxMediaListLimit = 5000;
const maxDashboardAvatarDataUrlBytes = 360 * 1024;

function publicMedia(row) {
  return {
    id: row.id,
    coupleId: row.couple_id,
    uploaderId: row.uploader_id,
    storagePath: row.storage_path,
    thumbnailStoragePath: row.thumbnail_storage_path,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    caption: row.caption,
    uploadStatus: row.upload_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function publicProfile(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarStoragePath: row.avatar_storage_path,
    avatarThumbnailStoragePath: row.avatar_thumbnail_storage_path,
    birthday: row.birthday instanceof Date ? row.birthday.toISOString().slice(0, 10) : row.birthday ? String(row.birthday).slice(0, 10) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicAvatarUpload(row) {
  return {
    id: row.id,
    userId: row.user_id,
    storagePath: row.storage_path,
    thumbnailStoragePath: row.thumbnail_storage_path,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    thumbnailMimeType: row.thumbnail_mime_type,
    thumbnailSizeBytes: row.thumbnail_size_bytes === null || row.thumbnail_size_bytes === undefined ? null : Number(row.thumbnail_size_bytes),
    uploadStatus: row.upload_status,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertUuid(value, code, message) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""))) {
    throw new AuthError(code, 400, message);
  }
}

function assertMime(config, mimeType) {
  if (!config.storage.allowedMimeTypes.includes(mimeType) || !extensionByMime.has(mimeType)) {
    throw new AuthError("unsupported_media_type", 415, "File type is not allowed.");
  }
}

function assertSize(config, sizeBytes) {
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > config.storage.maxUploadBytes) {
    throw new AuthError("file_too_large", 413, "File size is not allowed.");
  }
}

function assertAvatarSize(sizeBytes, maxBytes, code = "file_too_large") {
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    throw new AuthError(code, 413, "File size is not allowed.");
  }
}

async function ensureActiveCoupleMember(client, coupleId, userId) {
  const result = await client.query("select public.is_active_couple_member($1, $2) as allowed", [coupleId, userId]);
  if (!result.rows[0]?.allowed) {
    throw new AuthError("forbidden", 403, "You do not have access to this couple.");
  }
}

async function ensureProfileAvatarAccess(client, ownerUserId, currentUserId) {
  if (ownerUserId === currentUserId) {
    return;
  }
  const result = await client.query(
    `
      select 1
      from public.couple_members mine
      join public.couple_members owner_member
        on owner_member.couple_id = mine.couple_id
       and owner_member.user_id = $1
       and owner_member.status = 'active'
      join public.couples c
        on c.id = mine.couple_id
       and c.status = 'active'
      where mine.user_id = $2
        and mine.status = 'active'
      limit 1
    `,
    [ownerUserId, currentUserId],
  );
  if (!result.rows[0]) {
    throw new AuthError("forbidden", 403, "You do not have access to this avatar.");
  }
}

async function ensureBucket(client, bucket) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function createStorageService({ pool, config }) {
  const s3 = new S3Client({
    endpoint: config.storage.endpoint,
    region: config.storage.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.storage.accessKeyId,
      secretAccessKey: config.storage.secretAccessKey,
    },
  });
  const publicS3 = new S3Client({
    endpoint: config.storage.publicEndpoint,
    region: config.storage.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.storage.accessKeyId,
      secretAccessKey: config.storage.secretAccessKey,
    },
  });

  async function createAvatarUpload(input, current) {
    const mimeType = String(input.mimeType || "").toLowerCase();
    const sizeBytes = Number(input.sizeBytes);
    const thumbnailMimeType = input.thumbnailMimeType ? String(input.thumbnailMimeType).toLowerCase() : null;
    const thumbnailSizeBytes = input.thumbnailSizeBytes === null || input.thumbnailSizeBytes === undefined ? null : Number(input.thumbnailSizeBytes);
    assertMime(config, mimeType);
    assertAvatarSize(sizeBytes, config.storage.maxAvatarUploadBytes);
    if ((thumbnailMimeType && !thumbnailSizeBytes) || (!thumbnailMimeType && thumbnailSizeBytes)) {
      throw new AuthError("invalid_thumbnail", 400, "Thumbnail metadata is incomplete.");
    }
    if (thumbnailMimeType) {
      assertMime(config, thumbnailMimeType);
      assertAvatarSize(thumbnailSizeBytes, config.storage.maxAvatarThumbnailBytes, "thumbnail_too_large");
    }

    const objectId = randomUUID();
    const extension = extensionByMime.get(mimeType);
    const thumbnailExtension = thumbnailMimeType ? extensionByMime.get(thumbnailMimeType) : null;
    const storagePath = `${current.user.id}/${objectId}.${extension}`;
    const thumbnailStoragePath = thumbnailExtension ? `${current.user.id}/${objectId}-thumb.${thumbnailExtension}` : null;

    const avatarUpload = await withTransaction(pool, async (client) => {
      const result = await client.query(
        `
          insert into public.profile_avatar_uploads (
            user_id,
            storage_path,
            thumbnail_storage_path,
            mime_type,
            size_bytes,
            thumbnail_mime_type,
            thumbnail_size_bytes,
            upload_status
          )
          values ($1, $2, $3, $4, $5, $6, $7, 'pending')
          returning *
        `,
        [current.user.id, storagePath, thumbnailStoragePath, mimeType, sizeBytes, thumbnailMimeType, thumbnailSizeBytes],
      );
      return publicAvatarUpload(result.rows[0]);
    });

    await ensureBucket(s3, config.storage.avatarBucket);
    const uploadUrl = await getSignedUrl(
      publicS3,
      new PutObjectCommand({
        Bucket: config.storage.avatarBucket,
        Key: storagePath,
        ContentType: mimeType,
        ContentLength: sizeBytes,
      }),
      { expiresIn: config.storage.signedUrlTtlSeconds },
    );
    const thumbnailUploadUrl = thumbnailStoragePath && thumbnailMimeType && thumbnailSizeBytes
      ? await getSignedUrl(
          publicS3,
          new PutObjectCommand({
            Bucket: config.storage.avatarBucket,
            Key: thumbnailStoragePath,
            ContentType: thumbnailMimeType,
            ContentLength: thumbnailSizeBytes,
          }),
          { expiresIn: config.storage.signedUrlTtlSeconds },
        )
      : null;

    return {
      avatarUpload,
      upload: {
        method: "PUT",
        url: uploadUrl,
        expiresInSeconds: config.storage.signedUrlTtlSeconds,
        requiredHeaders: {
          "content-type": mimeType,
        },
      },
      thumbnailUpload: thumbnailUploadUrl
        ? {
            method: "PUT",
            url: thumbnailUploadUrl,
            expiresInSeconds: config.storage.signedUrlTtlSeconds,
            requiredHeaders: {
              "content-type": thumbnailMimeType,
            },
          }
        : null,
    };
  }

  async function completeAvatarUpload(input, current) {
    const avatarUploadId = String(input.avatarUploadId || input.uploadId || "");
    assertUuid(avatarUploadId, "invalid_avatar_upload_id", "A valid avatar upload id is required.");
    let oldStoragePath = null;
    let oldThumbnailStoragePath = null;

    const result = await withTransaction(pool, async (client) => {
      const foundUpload = await client.query(
        `
          select *
          from public.profile_avatar_uploads
          where id = $1
          for update
        `,
        [avatarUploadId],
      );
      const row = foundUpload.rows[0];
      if (!row || row.deleted_at) {
        throw new AuthError("avatar_upload_not_found", 404, "Avatar upload was not found.");
      }
      if (row.user_id !== current.user.id) {
        throw new AuthError("forbidden", 403, "Only the owner can complete this avatar upload.");
      }
      if (row.upload_status === "ready") {
        const currentProfile = await client.query("select * from public.profiles where id = $1", [current.user.id]);
        return { avatarUpload: publicAvatarUpload(row), profile: publicProfile(currentProfile.rows[0]) };
      }
      if (row.upload_status !== "pending") {
        throw new AuthError("avatar_upload_not_pending", 400, "Avatar upload is not pending.");
      }

      const head = await s3.send(new HeadObjectCommand({ Bucket: config.storage.avatarBucket, Key: row.storage_path }));
      const actualSize = Number(head.ContentLength || 0);
      const actualType = String(head.ContentType || "").split(";")[0].toLowerCase();
      let thumbnailOk = true;
      if (row.thumbnail_storage_path) {
        const thumbnailHead = await s3.send(new HeadObjectCommand({ Bucket: config.storage.avatarBucket, Key: row.thumbnail_storage_path }));
        const actualThumbnailSize = Number(thumbnailHead.ContentLength || 0);
        const actualThumbnailType = String(thumbnailHead.ContentType || "").split(";")[0].toLowerCase();
        thumbnailOk = actualThumbnailSize === Number(row.thumbnail_size_bytes) && actualThumbnailType === row.thumbnail_mime_type;
      }

      if (actualSize !== Number(row.size_bytes) || actualType !== row.mime_type || !thumbnailOk) {
        await s3.send(new DeleteObjectCommand({ Bucket: config.storage.avatarBucket, Key: row.storage_path })).catch(() => {});
        if (row.thumbnail_storage_path) {
          await s3.send(new DeleteObjectCommand({ Bucket: config.storage.avatarBucket, Key: row.thumbnail_storage_path })).catch(() => {});
        }
        await client.query(
          `
            update public.profile_avatar_uploads
               set upload_status = 'deleted',
                   deleted_at = coalesce(deleted_at, now())
             where id = $1
          `,
          [row.id],
        );
        throw new AuthError("upload_mismatch", 400, "Uploaded object does not match declared file metadata.");
      }

      const profileResult = await client.query("select * from public.profiles where id = $1 for update", [current.user.id]);
      oldStoragePath = profileResult.rows[0]?.avatar_storage_path ?? null;
      oldThumbnailStoragePath = profileResult.rows[0]?.avatar_thumbnail_storage_path ?? null;

      const updatedUpload = await client.query(
        `
          update public.profile_avatar_uploads
             set upload_status = 'ready',
                 completed_at = coalesce(completed_at, now())
           where id = $1
          returning *
        `,
        [row.id],
      );
      const updatedProfile = await client.query(
        `
          update public.profiles
             set avatar_storage_path = $2,
                 avatar_thumbnail_storage_path = $3,
                 updated_at = now()
           where id = $1
          returning *
        `,
        [current.user.id, row.storage_path, row.thumbnail_storage_path],
      );
      return {
        avatarUpload: publicAvatarUpload(updatedUpload.rows[0]),
        profile: publicProfile(updatedProfile.rows[0]),
      };
    });

    if (oldStoragePath && oldStoragePath !== result.profile.avatarStoragePath) {
      await s3.send(new DeleteObjectCommand({ Bucket: config.storage.avatarBucket, Key: oldStoragePath })).catch(() => {});
    }
    if (oldThumbnailStoragePath && oldThumbnailStoragePath !== result.profile.avatarThumbnailStoragePath) {
      await s3.send(new DeleteObjectCommand({ Bucket: config.storage.avatarBucket, Key: oldThumbnailStoragePath })).catch(() => {});
    }
    return result;
  }

  async function createAvatarReadUrl(input, current) {
    const userId = String(input.userId || current.user.id || "").toLowerCase();
    const variant = input.variant === "original" ? "original" : "thumbnail";
    assertUuid(userId, "invalid_user_id", "A valid user id is required.");

    const row = await withTransaction(pool, async (client) => {
      await ensureProfileAvatarAccess(client, userId, current.user.id);
      const result = await client.query(
        `
          select *
          from public.profiles
          where id = $1
        `,
        [userId],
      );
      return result.rows[0];
    });
    if (!row || !row.avatar_storage_path) {
      throw new AuthError("avatar_not_found", 404, "Avatar was not found.");
    }

    let key = variant === "thumbnail" ? row.avatar_thumbnail_storage_path : row.avatar_storage_path;
    if (!key) {
      key = variant === "thumbnail" ? row.avatar_storage_path : null;
    }
    if (!key) {
      throw new AuthError("avatar_not_found", 404, "Avatar was not found.");
    }
    try {
      await s3.send(new HeadObjectCommand({ Bucket: config.storage.avatarBucket, Key: key }));
    } catch (error) {
      if (variant !== "thumbnail" || key === row.avatar_storage_path) {
        throw error;
      }
      key = row.avatar_storage_path;
      await s3.send(new HeadObjectCommand({ Bucket: config.storage.avatarBucket, Key: key }));
    }
    const url = await getSignedUrl(
      publicS3,
      new GetObjectCommand({ Bucket: config.storage.avatarBucket, Key: key }),
      { expiresIn: config.storage.signedUrlTtlSeconds },
    );
    return {
      profile: publicProfile(row),
      read: {
        url,
        expiresInSeconds: config.storage.signedUrlTtlSeconds,
      },
    };
  }

  async function deleteAvatar(input, current) {
    let oldStoragePath = null;
    let oldThumbnailStoragePath = null;
    const profile = await withTransaction(pool, async (client) => {
      const profileResult = await client.query(
        `
          select *
          from public.profiles
          where id = $1
          for update
        `,
        [current.user.id],
      );
      const row = profileResult.rows[0];
      if (!row) {
        throw new AuthError("profile_not_found", 404, "Profile was not found.");
      }
      oldStoragePath = row.avatar_storage_path;
      oldThumbnailStoragePath = row.avatar_thumbnail_storage_path;

      const updatedProfile = await client.query(
        `
          update public.profiles
             set avatar_storage_path = null,
                 avatar_thumbnail_storage_path = null,
                 updated_at = now()
           where id = $1
          returning *
        `,
        [current.user.id],
      );
      await client.query(
        `
          update public.profile_avatar_uploads
             set upload_status = 'deleted',
                 deleted_at = coalesce(deleted_at, now())
           where user_id = $1
             and upload_status <> 'deleted'
             and (storage_path = $2 or thumbnail_storage_path = $3)
        `,
        [current.user.id, oldStoragePath, oldThumbnailStoragePath],
      );
      return publicProfile(updatedProfile.rows[0]);
    });

    if (oldStoragePath) {
      await s3.send(new DeleteObjectCommand({ Bucket: config.storage.avatarBucket, Key: oldStoragePath })).catch(() => {});
    }
    if (oldThumbnailStoragePath) {
      await s3.send(new DeleteObjectCommand({ Bucket: config.storage.avatarBucket, Key: oldThumbnailStoragePath })).catch(() => {});
    }
    return { profile };
  }

  async function createUpload(input, current) {
    const coupleId = String(input.coupleId || "").toLowerCase();
    const mimeType = String(input.mimeType || "").toLowerCase();
    const sizeBytes = Number(input.sizeBytes);
    const thumbnailMimeType = input.thumbnailMimeType ? String(input.thumbnailMimeType).toLowerCase() : null;
    const thumbnailSizeBytes = input.thumbnailSizeBytes === null || input.thumbnailSizeBytes === undefined ? null : Number(input.thumbnailSizeBytes);
    const caption = typeof input.caption === "string" ? input.caption.trim().slice(0, 500) : null;
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    assertMime(config, mimeType);
    assertSize(config, sizeBytes);
    if ((thumbnailMimeType && !thumbnailSizeBytes) || (!thumbnailMimeType && thumbnailSizeBytes)) {
      throw new AuthError("invalid_thumbnail", 400, "Thumbnail metadata is incomplete.");
    }
    if (thumbnailMimeType) {
      assertMime(config, thumbnailMimeType);
      assertAvatarSize(thumbnailSizeBytes, config.storage.maxThumbnailUploadBytes, "thumbnail_too_large");
    }
    const extension = extensionByMime.get(mimeType);
    const thumbnailExtension = thumbnailMimeType ? extensionByMime.get(thumbnailMimeType) : null;
    const objectId = randomUUID();
    const storagePath = `${coupleId}/${current.user.id}/${objectId}.${extension}`;
    const thumbnailStoragePath = thumbnailExtension ? `${coupleId}/${current.user.id}/${objectId}-thumb.${thumbnailExtension}` : null;

    const media = await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, coupleId, current.user.id);
      const result = await client.query(
        `
          insert into public.media_files (
            couple_id,
            uploader_id,
            storage_path,
            thumbnail_storage_path,
            mime_type,
            size_bytes,
            caption,
            upload_status
          )
          values ($1, $2, $3, $4, $5, $6, $7, 'pending')
          returning *
        `,
        [coupleId, current.user.id, storagePath, thumbnailStoragePath, mimeType, sizeBytes, caption],
      );
      return publicMedia(result.rows[0]);
    });

    await ensureBucket(s3, config.storage.bucket);
    const uploadUrl = await getSignedUrl(
      publicS3,
      new PutObjectCommand({
        Bucket: config.storage.bucket,
        Key: storagePath,
        ContentType: mimeType,
        ContentLength: sizeBytes,
      }),
      { expiresIn: config.storage.signedUrlTtlSeconds },
    );
    const thumbnailUploadUrl = thumbnailStoragePath && thumbnailMimeType && thumbnailSizeBytes
      ? await getSignedUrl(
          publicS3,
          new PutObjectCommand({
            Bucket: config.storage.bucket,
            Key: thumbnailStoragePath,
            ContentType: thumbnailMimeType,
            ContentLength: thumbnailSizeBytes,
          }),
          { expiresIn: config.storage.signedUrlTtlSeconds },
        )
      : null;

    return {
      media,
      upload: {
        method: "PUT",
        url: uploadUrl,
        expiresInSeconds: config.storage.signedUrlTtlSeconds,
        requiredHeaders: {
          "content-type": mimeType,
        },
      },
      thumbnailUpload: thumbnailUploadUrl
        ? {
            method: "PUT",
            url: thumbnailUploadUrl,
            expiresInSeconds: config.storage.signedUrlTtlSeconds,
            requiredHeaders: {
              "content-type": thumbnailMimeType,
            },
          }
        : null,
    };
  }

  async function completeUpload(input, current) {
    const mediaId = String(input.mediaId || "");
    assertUuid(mediaId, "invalid_media_id", "A valid media id is required.");

    const media = await withTransaction(pool, async (client) => {
      const result = await client.query(
        `
          select *
          from public.media_files
          where id = $1
          for update
        `,
        [mediaId],
      );
      const row = result.rows[0];
      if (!row || row.deleted_at) {
        throw new AuthError("media_not_found", 404, "Media file was not found.");
      }
      await ensureActiveCoupleMember(client, row.couple_id, current.user.id);
      if (row.uploader_id !== current.user.id) {
        throw new AuthError("forbidden", 403, "Only the uploader can complete this upload.");
      }

      const head = await s3.send(new HeadObjectCommand({ Bucket: config.storage.bucket, Key: row.storage_path }));
      const actualSize = Number(head.ContentLength || 0);
      const actualType = String(head.ContentType || "").split(";")[0].toLowerCase();
      let thumbnailOk = true;
      let generatedThumbnail = null;
      if (row.thumbnail_storage_path) {
        const thumbnailHead = await s3.send(new HeadObjectCommand({ Bucket: config.storage.bucket, Key: row.thumbnail_storage_path }));
        const actualThumbnailSize = Number(thumbnailHead.ContentLength || 0);
        const actualThumbnailType = String(thumbnailHead.ContentType || "").split(";")[0].toLowerCase();
        thumbnailOk =
          actualThumbnailSize > 0 &&
          actualThumbnailSize <= config.storage.maxThumbnailUploadBytes &&
          config.storage.allowedMimeTypes.includes(actualThumbnailType);
      } else {
        generatedThumbnail = await createAndUploadImageThumbnail({
          bucket: config.storage.bucket,
          key: row.storage_path,
          maxBytes: config.storage.maxThumbnailUploadBytes,
          s3,
        }).catch((error) => {
          console.warn("Media thumbnail generation failed:", {
            mediaId: row.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        });
        thumbnailOk = Boolean(generatedThumbnail?.key);
      }
      if (actualSize !== Number(row.size_bytes) || actualType !== row.mime_type || !thumbnailOk) {
        await s3.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: row.storage_path })).catch(() => {});
        if (row.thumbnail_storage_path) {
          await s3.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: row.thumbnail_storage_path })).catch(() => {});
        }
        if (generatedThumbnail?.key) {
          await s3.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: generatedThumbnail.key })).catch(() => {});
        }
        await client.query(
          `
            update public.media_files
               set upload_status = 'deleted',
                   deleted_at = coalesce(deleted_at, now())
             where id = $1
          `,
          [row.id],
        );
        throw new AuthError("upload_mismatch", 400, "Uploaded object does not match declared file metadata.");
      }

      const updated = await client.query(
        `
          update public.media_files
             set upload_status = 'ready',
                 thumbnail_storage_path = coalesce(thumbnail_storage_path, $2)
           where id = $1
          returning *
        `,
        [row.id, generatedThumbnail?.key ?? null],
      );
      return publicMedia(updated.rows[0]);
    });

    return { media };
  }

  async function listMedia(input, current) {
    const coupleId = String(input.coupleId || "").toLowerCase();
    assertUuid(coupleId, "invalid_couple_id", "A valid couple id is required.");
    const limit = Math.min(Math.max(Number(input.limit || defaultMediaListLimit), 1), maxMediaListLimit);
    const result = await pool.query(
      `
        select *
        from public.media_files
        where couple_id = $1
          and deleted_at is null
          and upload_status = 'ready'
          and public.is_active_couple_member(couple_id, $2)
        order by created_at desc
        limit $3
      `,
      [coupleId, current.user.id, limit],
    );
    return { media: result.rows.map(publicMedia) };
  }

  async function createReadUrl(input, current) {
    const mediaId = String(input.mediaId || "");
    const variant = input.variant === "thumbnail" ? "thumbnail" : "original";
    assertUuid(mediaId, "invalid_media_id", "A valid media id is required.");
    const result = await pool.query(
      `
        select *
        from public.media_files
        where id = $1
          and deleted_at is null
          and upload_status = 'ready'
      `,
      [mediaId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new AuthError("media_not_found", 404, "Media file was not found.");
    }
    await withTransaction(pool, async (client) => {
      await ensureActiveCoupleMember(client, row.couple_id, current.user.id);
    });
    const key = variant === "thumbnail" ? row.thumbnail_storage_path : row.storage_path;
    if (!key) {
      throw new AuthError("media_thumbnail_not_found", 404, "Media thumbnail was not found.");
    }
    try {
      await s3.send(new HeadObjectCommand({ Bucket: config.storage.bucket, Key: key }));
    } catch (error) {
      if (variant === "thumbnail") {
        throw new AuthError("media_thumbnail_not_found", 404, "Media thumbnail was not found.");
      }
      throw error;
    }
    const url = await getSignedUrl(
      publicS3,
      new GetObjectCommand({ Bucket: config.storage.bucket, Key: key }),
      { expiresIn: config.storage.signedUrlTtlSeconds },
    );
    return {
      media: publicMedia(row),
      read: {
        url,
        expiresInSeconds: config.storage.signedUrlTtlSeconds,
      },
    };
  }

  async function createSignedReadUrl(bucket, key) {
    if (!key) {
      return null;
    }
    // Presigning is a client-side operation; skip HEAD check to save an S3 RTT.
    return getSignedUrl(
      publicS3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: config.storage.signedUrlTtlSeconds },
    );
  }

  async function createAvatarDataUrl(key) {
    if (!key) {
      return null;
    }
    const head = await s3.send(new HeadObjectCommand({ Bucket: config.storage.avatarBucket, Key: key }));
    const size = Number(head.ContentLength || 0);
    const contentType = String(head.ContentType || "").split(";")[0].toLowerCase();
    if (size <= 0 || size > maxDashboardAvatarDataUrlBytes || !contentType.startsWith("image/")) {
      return null;
    }
    const object = await s3.send(new GetObjectCommand({ Bucket: config.storage.avatarBucket, Key: key }));
    const body = object.Body ? await streamToBuffer(object.Body) : null;
    if (!body || body.length <= 0 || body.length > maxDashboardAvatarDataUrlBytes) {
      return null;
    }
    return `data:${contentType};base64,${body.toString("base64")}`;
  }

  /**
   * Lightweight avatar-only presigning.  Only creates presigned URLs (a local
   * crypto operation on `publicS3`) — never fetches image bytes from MinIO.
   * Returns the same `{ avatarsByUserId, mediaById }` shape as
   * `createDashboardImageUrls` so callers can use them interchangeably.
   */
  async function createAvatarPresignedUrls(profiles) {
    const entries = await Promise.all(
      (Array.isArray(profiles) ? profiles : []).map(async (profile) => {
        if (!profile?.id) {
          return null;
        }
        const thumbnailKey = profile.avatarThumbnailStoragePath;
        if (!thumbnailKey) {
          return null;
        }
        try {
          const avatarThumbSignedUrl = await createSignedReadUrl(config.storage.avatarBucket, thumbnailKey);
          if (!avatarThumbSignedUrl) {
            return null;
          }
          return [
            profile.id,
            {
              avatarSignedUrl: null,
              avatarThumbSignedUrl,
              avatarThumbDataUrl: null,
            },
          ];
        } catch {
          return null;
        }
      }),
    );
    return {
      avatarsByUserId: Object.fromEntries(entries.filter(Boolean)),
      mediaById: {},
    };
  }

  async function createDashboardImageUrls(input, current) {
    const profiles = Array.isArray(input.profiles) ? input.profiles : [];
    const media = Array.isArray(input.media) ? input.media : [];
    const avatarEntries = await Promise.all(
      profiles.map(async (profile) => {
        if (!profile?.id || !profile.avatarStoragePath) {
          return null;
        }
        try {
          const thumbnailKey = profile.avatarThumbnailStoragePath;
          if (!thumbnailKey) {
            return null;
          }
          // Try inline data URL first (HeadObject + GetObject = 2 S3 calls).
          // Only fall back to a presigned URL when data URL fails (e.g. image
          // too large), saving an extra presign round-trip in the common case.
          const avatarThumbDataUrl = await createAvatarDataUrl(thumbnailKey).catch(() => null);
          let avatarThumbSignedUrl = null;
          if (!avatarThumbDataUrl) {
            avatarThumbSignedUrl = await createSignedReadUrl(config.storage.avatarBucket, thumbnailKey).catch(() => null);
          }
          if (!avatarThumbDataUrl && !avatarThumbSignedUrl) {
            return null;
          }
          return [
            profile.id,
            {
              avatarSignedUrl: null,
              avatarThumbSignedUrl,
              avatarThumbDataUrl,
            },
          ];
        } catch (error) {
          console.warn("Dashboard avatar read-url signing failed:", {
            userId: profile.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }),
    );
    const mediaEntries = await Promise.all(
      media.map(async (mediaFile) => {
        if (!mediaFile?.id || !mediaFile.storagePath) {
          return null;
        }
        try {
          const thumbnailSignedUrl = mediaFile.thumbnailStoragePath
            ? await createSignedReadUrl(config.storage.bucket, mediaFile.thumbnailStoragePath).catch(() => null)
            : null;
          return [
            mediaFile.id,
            {
              signedUrl: null,
              thumbnailSignedUrl,
            },
          ];
        } catch (error) {
          console.warn("Dashboard media thumbnail read-url signing failed:", {
            mediaId: mediaFile.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }),
    );
    return {
      avatarsByUserId: Object.fromEntries(avatarEntries.filter(Boolean)),
      mediaById: Object.fromEntries(mediaEntries.filter(Boolean)),
    };
  }

  async function deleteMedia(input, current) {
    const mediaId = String(input.mediaId || "");
    assertUuid(mediaId, "invalid_media_id", "A valid media id is required.");
    const deleted = await withTransaction(pool, async (client) => {
      const result = await client.query(
        `
          select *
          from public.media_files
          where id = $1
          for update
        `,
        [mediaId],
      );
      const row = result.rows[0];
      if (!row || row.deleted_at) {
        throw new AuthError("media_not_found", 404, "Media file was not found.");
      }
      await ensureActiveCoupleMember(client, row.couple_id, current.user.id);
      if (row.uploader_id !== current.user.id) {
        throw new AuthError("forbidden", 403, "Only the uploader can delete this media file.");
      }
      const updated = await client.query(
        `
          update public.media_files
             set upload_status = 'deleted',
                 deleted_at = coalesce(deleted_at, now())
           where id = $1
          returning *
        `,
        [row.id],
      );
      return publicMedia(updated.rows[0]);
    });

    await s3.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: deleted.storagePath })).catch(() => {});
    if (deleted.thumbnailStoragePath) {
      await s3.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: deleted.thumbnailStoragePath })).catch(() => {});
    }
    return { media: deleted };
  }

  return {
    completeAvatarUpload,
    completeUpload,
    createAvatarPresignedUrls,
    createAvatarReadUrl,
    createAvatarUpload,
    createDashboardImageUrls,
    createReadUrl,
    createUpload,
    deleteAvatar,
    deleteMedia,
    listMedia,
  };
}
