import { supabase } from "@/lib/supabase/client";

export const storageBuckets = {
  avatars: "profile-avatars",
  coupleMedia: "couple-media",
} as const;

export const imageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export type ImageTransformOptions = {
  width?: number;
  height?: number;
  resize?: "cover" | "contain" | "fill";
  quality?: number;
  format?: "origin";
};

export const imageTransforms = {
  avatarThumb: { width: 160, height: 160, resize: "cover", quality: 72 } satisfies ImageTransformOptions,
  albumThumb: { width: 420, height: 420, resize: "cover", quality: 72 } satisfies ImageTransformOptions,
  previewStripThumb: { width: 112, height: 112, resize: "cover", quality: 68 } satisfies ImageTransformOptions,
} as const;

const generatedThumbnailMimeType = "image/webp";
const signedUrlCache = new Map<string, { url: string | null; expiresAt: number }>();
const signedUrlRequests = new Map<string, Promise<string | null>>();
const transformedImageCache = new Map<string, { url: string | null; expiresAt: number }>();
const transformedImageRequests = new Map<string, Promise<string | null>>();
const signedUrlTtlSeconds = 60 * 60 * 24;
const signedUrlRefreshBufferMs = 5 * 60 * 1000;
const transformedImageTtlMs = 25 * 60 * 1000;
const transformedImageRefreshBufferMs = 2 * 60 * 1000;

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

export function buildThumbnailStoragePath(originalPath: string) {
  const slashIndex = originalPath.lastIndexOf("/");
  const folder = slashIndex >= 0 ? originalPath.slice(0, slashIndex) : "";
  const filename = slashIndex >= 0 ? originalPath.slice(slashIndex + 1) : originalPath;
  const stem = filename.replace(/\.[^.]+$/, "");
  return `${folder ? `${folder}/` : ""}thumbs/${stem}.webp`;
}

export async function createImageThumbnail(file: File, maxSize = 480, quality = 0.72) {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof HTMLCanvasElement === "undefined" ||
    file.type === "image/gif"
  ) {
    return null;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image thumbnail decode failed"));
      element.src = objectUrl;
    });

    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    if (!longestSide) {
      return null;
    }
    const scale = Math.min(1, maxSize / longestSide);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    context.drawImage(image, 0, 0, width, height);

    return await new Promise<File | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          resolve(new File([blob], "thumbnail.webp", { type: generatedThumbnailMimeType }));
        },
        generatedThumbnailMimeType,
        quality
      );
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function signedUrlCacheKey(bucket: string, path: string, transform?: ImageTransformOptions) {
  if (!transform || Object.keys(transform).length === 0) {
    return `${bucket}:${path}:original`;
  }

  const normalizedTransform = Object.entries(transform)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `${bucket}:${path}:transform:${JSON.stringify(normalizedTransform)}`;
}

function storageUrlCacheKey(bucket: string, path: string, transform: ImageTransformOptions) {
  return signedUrlCacheKey(bucket, path, transform);
}

export async function createSignedUrl(bucket: string, path?: string | null, transform?: ImageTransformOptions) {
  if (!path) {
    return null;
  }

  const cacheKey = signedUrlCacheKey(bucket, path, transform);
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
    .createSignedUrl(path, signedUrlTtlSeconds, transform ? { transform } : undefined)
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

export async function createTransformedImageUrl(bucket: string, path?: string | null, transform: ImageTransformOptions = imageTransforms.albumThumb) {
  if (!path) {
    return null;
  }

  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return createSignedUrl(bucket, path, transform);
  }

  const cacheKey = storageUrlCacheKey(bucket, path, transform);
  const cached = transformedImageCache.get(cacheKey);
  if (cached && cached.expiresAt - transformedImageRefreshBufferMs > Date.now()) {
    return cached.url;
  }

  const activeRequest = transformedImageRequests.get(cacheKey);
  if (activeRequest) {
    return activeRequest;
  }

  const request = supabase.storage
    .from(bucket)
    .download(path, { transform })
    .then(({ data, error }) => {
      if (error || !data) {
        return createSignedUrl(bucket, path, transform);
      }

      if (cached?.url?.startsWith("blob:")) {
        URL.revokeObjectURL(cached.url);
      }

      const url = URL.createObjectURL(data);
      transformedImageCache.set(cacheKey, {
        url,
        expiresAt: Date.now() + transformedImageTtlMs,
      });
      return url;
    })
    .finally(() => {
      transformedImageRequests.delete(cacheKey);
    });

  transformedImageRequests.set(cacheKey, request);
  return request;
}

export async function uploadImage(bucket: string, path: string, file: File) {
  return supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
}
