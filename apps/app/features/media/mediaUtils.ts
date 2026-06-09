import type { MediaFile } from "@/lib/supabase/database.types";

export function isCheckinPhotoCaption(caption: string) {
  return caption.startsWith("今日胶囊图片:");
}

export function mediaCaptionLabel(file: Pick<MediaFile, "caption">, fallback = "相册里的瞬间") {
  const caption = file.caption?.trim();
  if (!caption) {
    return fallback;
  }
  return isCheckinPhotoCaption(caption) ? "今日胶囊图片" : caption;
}

export function imagePreviewUrl(file: Pick<MediaFile, "thumbnailSignedUrl" | "signedUrl">) {
  return file.thumbnailSignedUrl ?? file.signedUrl ?? null;
}
