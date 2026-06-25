import { selfHostRequest } from "./apiClient";
import type { MediaFile } from "@/lib/supabase/database.types";

type SelfHostMedia = {
  id: string;
  coupleId: string;
  uploaderId: string;
  storagePath: string;
  thumbnailStoragePath: string | null;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  uploadStatus: "pending" | "ready" | "deleted";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type CreateUploadResponse = {
  media: SelfHostMedia;
  upload: {
    method: "PUT";
    url: string;
    expiresInSeconds: number;
    requiredHeaders: Record<string, string>;
  };
  thumbnailUpload: {
    method: "PUT";
    url: string;
    expiresInSeconds: number;
    requiredHeaders: Record<string, string>;
  } | null;
};

type ReadUrlResponse = {
  media: SelfHostMedia;
  read: {
    url: string;
    expiresInSeconds: number;
  };
};

function browserSafeUploadHeaders(headers: Record<string, string>) {
  const safeHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "content-length") {
      continue;
    }
    safeHeaders[key] = value;
  }
  return safeHeaders;
}

export function mapSelfHostMedia(media: SelfHostMedia): MediaFile {
  return {
    id: media.id,
    couple_id: media.coupleId,
    uploader_id: media.uploaderId,
    storage_path: media.storagePath,
    thumbnail_storage_path: media.thumbnailStoragePath,
    mime_type: media.mimeType,
    size_bytes: media.sizeBytes,
    caption: media.caption,
    created_at: media.createdAt,
    updated_at: media.updatedAt,
    deleted_at: media.deletedAt,
  };
}

export async function listSelfHostMedia(input: {
  accessToken: string;
  coupleId: string;
  limit?: number;
}) {
  const response = await selfHostRequest<{ media: SelfHostMedia[] }>("/api/media", {
    accessToken: input.accessToken,
    query: {
      coupleId: input.coupleId,
      limit: input.limit ?? 30,
    },
  });
  return response.media.map(mapSelfHostMedia);
}

export async function uploadSelfHostMedia(input: {
  accessToken: string;
  coupleId: string;
  file: File;
  thumbnailFile?: File | null;
  caption?: string | null;
}) {
  const created = await selfHostRequest<CreateUploadResponse>("/api/media/uploads", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      mimeType: input.file.type,
      sizeBytes: input.file.size,
      thumbnailMimeType: input.thumbnailFile?.type ?? null,
      thumbnailSizeBytes: input.thumbnailFile?.size ?? null,
      caption: input.caption,
    },
  });

  const put = await fetch(created.upload.url, {
    method: created.upload.method,
    headers: browserSafeUploadHeaders(created.upload.requiredHeaders),
    body: input.file,
  });
  if (!put.ok) {
    throw new Error(`上传文件失败：${put.status}`);
  }
  if (created.thumbnailUpload && input.thumbnailFile) {
    const thumbnailPut = await fetch(created.thumbnailUpload.url, {
      method: created.thumbnailUpload.method,
      headers: browserSafeUploadHeaders(created.thumbnailUpload.requiredHeaders),
      body: input.thumbnailFile,
    });
    if (!thumbnailPut.ok) {
      throw new Error(`上传缩略图失败：${thumbnailPut.status}`);
    }
  }

  const completed = await selfHostRequest<{ media: SelfHostMedia }>("/api/media/uploads/complete", {
    method: "POST",
    accessToken: input.accessToken,
    body: { mediaId: created.media.id },
  });
  return mapSelfHostMedia(completed.media);
}

export async function createSelfHostMediaReadUrl(input: {
  accessToken: string;
  mediaId: string;
  variant?: "original" | "thumbnail";
}) {
  const response = await selfHostRequest<ReadUrlResponse>("/api/media/read-url", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      mediaId: input.mediaId,
      variant: input.variant,
    },
  });
  return response.read.url;
}

export async function deleteSelfHostMedia(input: {
  accessToken: string;
  mediaId: string;
}) {
  const response = await selfHostRequest<{ media: SelfHostMedia }>("/api/media/delete", {
    method: "POST",
    accessToken: input.accessToken,
    body: { mediaId: input.mediaId },
  });
  return mapSelfHostMedia(response.media);
}
