import { rememberLoadedImageSourceKey } from "@/motion/CrossFadeImage";

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
const imagePrefetchRequests = new Map<string, Promise<void>>();
const defaultImagePrefetchConcurrency = 3;

export function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

export function isSupportedImage(file: { type?: string; size?: number }, maxBytes: number) {
  return Boolean(file.type && imageMimeTypes.includes(file.type) && typeof file.size === "number" && file.size <= maxBytes);
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
        void image.decode().catch(() => undefined).finally(() => {
          rememberLoadedImageSourceKey(url);
          resolve();
        });
        return;
      }
      rememberLoadedImageSourceKey(url);
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
