import type { MediaFile } from "@/lib/supabase/database.types";
import { createSelfHostMediaReadUrl } from "@/lib/selfHost/mediaApi";

export type PreservedMediaUrl = { path?: string | null; signedUrl: string | null; thumbnailSignedUrl: string | null };

export function withPreservedMediaUrls(file: MediaFile, signedMediaUrlById: Map<string, PreservedMediaUrl>) {
  const existingMediaUrl = signedMediaUrlById.get(file.id);
  const shouldPreserve = existingMediaUrl?.path === file.storage_path;
  const existingSignedUrl = shouldPreserve ? existingMediaUrl.signedUrl : null;
  const existingThumbnailSignedUrl = shouldPreserve ? existingMediaUrl.thumbnailSignedUrl : null;
  return {
    ...file,
    signedUrl: file.signedUrl ?? existingSignedUrl,
    thumbnailSignedUrl: file.thumbnailSignedUrl ?? existingThumbnailSignedUrl,
  };
}

export async function hydrateMediaFile(file: MediaFile, signedMediaUrlById: Map<string, PreservedMediaUrl>, accessToken?: string | null) {
  const preservedFile = withPreservedMediaUrls(file, signedMediaUrlById);
  const existingSignedUrl = preservedFile.signedUrl ?? null;
  const existingThumbnailSignedUrl = preservedFile.thumbnailSignedUrl ?? null;
  if (!accessToken) {
    return preservedFile;
  }
  const thumbnailSignedUrl =
    existingThumbnailSignedUrl ??
    (file.thumbnail_storage_path
      ? await createSelfHostMediaReadUrl({
          accessToken,
          mediaId: file.id,
          variant: "thumbnail",
        }).catch((error) => {
          console.warn("Self-host media thumbnail hydration failed:", error);
          return null;
        })
      : null);
  return {
    ...file,
    signedUrl: existingSignedUrl,
    thumbnailSignedUrl,
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
