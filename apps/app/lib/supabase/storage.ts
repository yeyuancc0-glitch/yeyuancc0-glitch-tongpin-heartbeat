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

type TransformedImageFallback = "signed-url" | "local-thumbnail" | "none";

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
const imagePrefetchRequests = new Map<string, Promise<void>>();
const signedUrlTtlSeconds = 60 * 60 * 24;
const signedUrlRefreshBufferMs = 5 * 60 * 1000;
const transformedImageTtlMs = 25 * 60 * 1000;
const transformedImageRefreshBufferMs = 2 * 60 * 1000;
const defaultImagePrefetchConcurrency = 3;

function revokeBlobUrl(url?: string | null) {
  if (url?.startsWith("blob:") && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}

function pruneExpiredTransformedImageUrls(now = Date.now()) {
  transformedImageCache.forEach((entry, key) => {
    if (entry.expiresAt > now) {
      return;
    }
    revokeBlobUrl(entry.url);
    transformedImageCache.delete(key);
  });
}

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

export async function createImageThumbnailFromBlob(blob: Blob, maxSize = 480, quality = 0.72) {
  if (typeof File === "undefined") {
    return null;
  }

  const mimeType = blob.type && imageMimeTypes.includes(blob.type) ? blob.type : "image/jpeg";
  const file = new File([blob], `thumbnail-source.${extensionForMimeType(mimeType)}`, { type: mimeType });
  return createImageThumbnail(file, maxSize, quality);
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

async function createLocalThumbnailUrl(bucket: string, path: string, transform: ImageTransformOptions) {
  const maxSize = Math.max(transform.width ?? 0, transform.height ?? 0, 1);
  const quality = (transform.quality ?? 72) / 100;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    return null;
  }

  const thumbnail = await createImageThumbnailFromBlob(data, maxSize, quality);
  if (!thumbnail || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }
  return URL.createObjectURL(thumbnail);
}

export async function createTransformedImageUrl(
  bucket: string,
  path?: string | null,
  transform: ImageTransformOptions = imageTransforms.albumThumb,
  options: { fallback?: TransformedImageFallback } = {}
) {
  if (!path) {
    return null;
  }

  const fallback = options.fallback ?? "signed-url";

  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return fallback === "none" ? null : createSignedUrl(bucket, path, transform);
  }

  const cacheKey = storageUrlCacheKey(bucket, path, transform);
  pruneExpiredTransformedImageUrls();
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
    .then(async ({ data, error }) => {
      if (error || !data) {
        if (fallback === "local-thumbnail") {
          const localThumbnailUrl = await createLocalThumbnailUrl(bucket, path, transform);
          if (localThumbnailUrl) {
            revokeBlobUrl(cached?.url);
            transformedImageCache.set(cacheKey, {
              url: localThumbnailUrl,
              expiresAt: Date.now() + transformedImageTtlMs,
            });
            return localThumbnailUrl;
          }
        }

        return fallback === "signed-url" ? createSignedUrl(bucket, path, transform) : null;
      }

      revokeBlobUrl(cached?.url);

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

export async function prefetchImageUrl(url?: string | null) {
  if (!url || typeof Image === "undefined") {
    return;
  }

  const activeRequest = imagePrefetchRequests.get(url);
  if (activeRequest) {
    return activeRequest;
  }

  const request = new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (typeof image.decode === "function") {
        void image.decode().catch(() => undefined).finally(resolve);
        return;
      }
      resolve();
    };
    image.onerror = () => resolve();
    image.src = url;
  }).finally(() => {
    imagePrefetchRequests.delete(url);
  });

  imagePrefetchRequests.set(url, request);
  return request;
}

export async function prefetchImageUrls(urls: Array<string | null | undefined>, concurrency = defaultImagePrefetchConcurrency) {
  const uniqueUrls = Array.from(new Set(urls.filter((url): url is string => Boolean(url))));
  if (!uniqueUrls.length) {
    return;
  }

  let cursor = 0;
  const workerCount = Math.min(Math.max(1, concurrency), uniqueUrls.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < uniqueUrls.length) {
        const url = uniqueUrls[cursor];
        cursor += 1;
        await prefetchImageUrl(url);
      }
    })
  );
}

export async function uploadImage(bucket: string, path: string, file: File) {
  return supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
}
