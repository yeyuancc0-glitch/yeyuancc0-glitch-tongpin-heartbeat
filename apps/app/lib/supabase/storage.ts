import { supabase } from "@/lib/supabase/client";

export const storageBuckets = {
  avatars: "profile-avatars",
  coupleMedia: "couple-media",
} as const;

export const imageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const signedUrlCache = new Map<string, { url: string | null; expiresAt: number }>();
const signedUrlRequests = new Map<string, Promise<string | null>>();
const signedUrlTtlSeconds = 60 * 60 * 24;
const signedUrlRefreshBufferMs = 5 * 60 * 1000;

export function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

export function isSupportedImage(file: { type?: string; size?: number }, maxBytes: number) {
  return Boolean(file.type && imageMimeTypes.includes(file.type) && typeof file.size === "number" && file.size <= maxBytes);
}

export function buildStoragePath(parts: string[], mimeType: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${parts.join("/")}/${id}.${extensionForMimeType(mimeType)}`;
}

export async function createSignedUrl(bucket: string, path?: string | null) {
  if (!path) {
    return null;
  }

  const cacheKey = `${bucket}:${path}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt - signedUrlRefreshBufferMs > Date.now()) {
    return cached.url;
  }

  const activeRequest = signedUrlRequests.get(cacheKey);
  if (activeRequest) {
    return activeRequest;
  }

  const request = supabase.storage
    .from(bucket)
    .createSignedUrl(path, signedUrlTtlSeconds)
    .then(({ data, error }) => {
      const url = error ? null : data.signedUrl;
      if (!url) {
        signedUrlCache.delete(cacheKey);
        return null;
      }
      signedUrlCache.set(cacheKey, {
        url,
        expiresAt: Date.now() + signedUrlTtlSeconds * 1000,
      });
      return url;
    })
    .finally(() => {
      signedUrlRequests.delete(cacheKey);
    });

  signedUrlRequests.set(cacheKey, request);
  return request;
}

export async function uploadImage(bucket: string, path: string, file: File) {
  return supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
}
