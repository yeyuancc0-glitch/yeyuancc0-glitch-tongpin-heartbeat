import { useCallback } from "react";
import { Platform } from "react-native";

import { movePetForMemoryEvent } from "@/features/home/homePetWorldHelpers";
import type { PhotoFileList, PhotoPreviewState, PhotoUploadOptions, PhotoUploadResult } from "@/features/home/homeShared";
import { mediaCaptionLabel } from "@/features/media/mediaUtils";
import { createImageThumbnail, imageTransforms, isSupportedImage } from "@/lib/media/imageStorage";
import { deleteSelfHostMedia, uploadSelfHostMedia } from "@/lib/selfHost/mediaApi";
import type { MediaFile } from "@/lib/supabase/database.types";

const defaultMaxFiles = 99;

const emptyPhotoUploadResult: PhotoUploadResult = {
  uploadedCount: 0,
  uploadedFiles: [],
  failedFiles: [],
};

type ToastValue = {
  title: string;
  message?: string;
  tone: "success" | "error" | "info";
};

export function useHomePhotoActions({
  userId,
  accessToken,
  coupleId,
  mediaFiles,
  showToast,
  reload,
  mergeMediaFile,
  removeMediaFile,
  setActivePhotoPreview,
}: {
  userId?: string;
  accessToken?: string | null;
  coupleId: string;
  mediaFiles: MediaFile[];
  showToast: (toast: ToastValue) => void;
  reload: () => void;
  mergeMediaFile: (mediaFile: MediaFile) => void;
  removeMediaFile: (mediaId: string) => void;
  setActivePhotoPreview: (updater: (current: PhotoPreviewState | null) => PhotoPreviewState | null) => void;
}) {
  const handlePhotoFiles = useCallback(async (files: PhotoFileList, options: PhotoUploadOptions = {}): Promise<PhotoUploadResult> => {
    if (!userId) {
      return emptyPhotoUploadResult;
    }

    const currentCount = options.currentCount ?? mediaFiles.length;
    const maxFiles = options.maxFiles ?? defaultMaxFiles;
    const remaining = Math.max(0, maxFiles - currentCount);
    if (remaining <= 0) {
      showToast({ title: "图片已满", message: `最多上传 ${maxFiles} 张。`, tone: "info" });
      return emptyPhotoUploadResult;
    }

    const selectedFiles = Array.from(files).slice(0, remaining);
    if (!selectedFiles.length) {
      return emptyPhotoUploadResult;
    }

    let uploadedCount = 0;
    const uploadedFiles: File[] = [];
    const failedFiles: File[] = [];

    for (const file of selectedFiles) {
      if (!isSupportedImage(file, 8 * 1024 * 1024)) {
        showToast({ title: "图片格式不支持", message: "请上传 8MB 以内的 JPG、PNG、WebP 或 GIF 图片。", tone: "error" });
        failedFiles.push(file);
        continue;
      }

      if (!accessToken) {
        showToast({ title: "登录已过期", message: "请重新登录后再上传。", tone: "error" });
        failedFiles.push(file);
        continue;
      }
      try {
        const thumbOptions = imageTransforms.albumThumb;
        const thumbnailFile = await createImageThumbnail(file, thumbOptions.width, thumbOptions.quality);
        const uploadedMediaFile = await uploadSelfHostMedia({
          accessToken,
          coupleId,
          file,
          thumbnailFile,
          caption: options.caption || file.name.replace(/\.[^.]+$/, ""),
        });
        mergeMediaFile(uploadedMediaFile);
        uploadedCount += 1;
        uploadedFiles.push(file);
      } catch (error) {
        showToast({ title: "上传失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
        failedFiles.push(file);
      }
    }

    if (uploadedCount > 0) {
      void movePetForMemoryEvent(coupleId, "photo").catch((moveError) => {
        console.warn("Pet memory photo sync failed:", moveError instanceof Error ? moveError.message : moveError);
      });
      showToast({
        title: options.successTitle ?? `已上传 ${uploadedCount} 张照片`,
        message: options.successMessage ?? "它会和日常胶囊一起沉淀在时间线里。",
        tone: "success",
      });
      reload();
    }

    return { uploadedCount, uploadedFiles, failedFiles };
  }, [accessToken, coupleId, mediaFiles.length, mergeMediaFile, reload, showToast, userId]);

  const uploadPhoto = useCallback(async (options: PhotoUploadOptions = {}): Promise<PhotoUploadResult> => {
    if (!userId) {
      return emptyPhotoUploadResult;
    }
    if (Platform.OS !== "web") {
      showToast({ title: "当前端暂不支持", message: "相册上传当前先在 Web 端开放。", tone: "info" });
      return emptyPhotoUploadResult;
    }
    const currentCount = options.currentCount ?? mediaFiles.length;
    const maxFiles = options.maxFiles ?? defaultMaxFiles;
    const remaining = Math.max(0, maxFiles - currentCount);
    if (remaining <= 0) {
      showToast({ title: "图片已满", message: `最多上传 ${maxFiles} 张。`, tone: "info" });
      return emptyPhotoUploadResult;
    }

    showToast({ title: "请选择照片", message: "请点击上传按钮选择照片。", tone: "info" });
    return emptyPhotoUploadResult;
  }, [mediaFiles.length, showToast, userId]);

  const deletePhoto = useCallback(async (file: MediaFile) => {
    const confirmed =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.confirm(`确定删除这张照片吗？\n\n${mediaCaptionLabel(file, "相册里的瞬间")}`)
        : true;
    if (!confirmed) {
      return;
    }

    if (!accessToken) {
      showToast({ title: "登录已过期", message: "请重新登录后再删除。", tone: "error" });
      return;
    }
    try {
      await deleteSelfHostMedia({ accessToken, mediaId: file.id });
      showToast({ title: "照片已删除", tone: "success" });
    } catch (error) {
      showToast({ title: "删除失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
      return;
    }
    setActivePhotoPreview((current) => {
      if (!current || current.id !== file.id) {
        return current;
      }
      const remaining = mediaFiles.filter((item) => item.id !== file.id);
      return remaining[0] ? { id: remaining[0].id, index: 0 } : null;
    });
    removeMediaFile(file.id);
  }, [accessToken, mediaFiles, removeMediaFile, setActivePhotoPreview, showToast]);

  return { handlePhotoFiles, uploadPhoto, deletePhoto };
}
