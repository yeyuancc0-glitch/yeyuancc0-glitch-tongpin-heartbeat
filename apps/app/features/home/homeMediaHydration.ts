import type { MediaFile } from "@/lib/supabase/database.types";
import { createSignedUrl, createTransformedImageUrl, imageTransforms, storageBuckets } from "@/lib/supabase/storage";

export type PreservedMediaUrl = { path?: string | null; signedUrl: string | null; thumbnailSignedUrl: string | null };

export async function hydrateMediaFile(file: MediaFile, signedMediaUrlById: Map<string, PreservedMediaUrl>) {
  const existingMediaUrl = signedMediaUrlById.get(file.id);
  const shouldPreserve = existingMediaUrl?.path === file.storage_path;
  const existingSignedUrl = shouldPreserve ? existingMediaUrl.signedUrl : null;
  const existingThumbnailSignedUrl = shouldPreserve ? existingMediaUrl.thumbnailSignedUrl : null;
  const thumbnailSignedUrl =
    existingThumbnailSignedUrl ??
    (file.thumbnail_storage_path
      ? await createSignedUrl(storageBuckets.coupleMedia, file.thumbnail_storage_path)
      : await createTransformedImageUrl(storageBuckets.coupleMedia, file.storage_path, imageTransforms.albumThumb));
  const fallbackSignedUrl = thumbnailSignedUrl || existingSignedUrl ? existingSignedUrl : await createSignedUrl(storageBuckets.coupleMedia, file.storage_path);
  return {
    ...file,
    signedUrl: fallbackSignedUrl,
    thumbnailSignedUrl: thumbnailSignedUrl ?? fallbackSignedUrl,
  };
}

export function mergeHydratedMediaFiles(currentFiles: MediaFile[], hydratedFiles: MediaFile[]) {
  if (!hydratedFiles.length || !currentFiles.length) {
    return currentFiles;
  }

  const hydratedById = new Map(hydratedFiles.map((file) => [file.id, file]));
  let changed = false;
  const nextFiles = currentFiles.map((file) => {
    const hydrated = hydratedById.get(file.id);
    if (!hydrated || hydrated.storage_path !== file.storage_path) {
      return file;
    }
    if (file.signedUrl === hydrated.signedUrl && file.thumbnailSignedUrl === hydrated.thumbnailSignedUrl) {
      return file;
    }
    changed = true;
    return {
      ...file,
      signedUrl: hydrated.signedUrl,
      thumbnailSignedUrl: hydrated.thumbnailSignedUrl,
    };
  });

  return changed ? nextFiles : currentFiles;
}
