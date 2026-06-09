import { useCallback } from "react";
import { Platform } from "react-native";

import { movePetForMemoryEvent } from "@/features/home/homePetWorldHelpers";
import type { PhotoFileList, PhotoPreviewState, PhotoUploadOptions, PhotoUploadResult } from "@/features/home/homeShared";
import { mediaCaptionLabel } from "@/features/media/mediaUtils";
import { supabase } from "@/lib/supabase/client";
import type { MediaFile } from "@/lib/supabase/database.types";
import {
  buildStoragePath,
  buildThumbnailStoragePath,
  createImageThumbnail,
  isSupportedImage,
  storageBuckets,
  uploadImage,
} from "@/lib/supabase/storage";

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
  coupleId,
  mediaFiles,
  showToast,
  reload,
  setActivePhotoPreview,
}: {
  userId?: string;
  coupleId: string;
  mediaFiles: MediaFile[];
  showToast: (toast: ToastValue) => void;
  reload: () => void;
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

      const path = buildStoragePath([coupleId, userId], file.type);
      const { error: uploadError } = await uploadImage(storageBuckets.coupleMedia, path, file);
      if (uploadError) {
        showToast({ title: "上传失败", message: uploadError.message, tone: "error" });
        failedFiles.push(file);
        continue;
      }

      const thumbnailFile = await createImageThumbnail(file, 480, 0.72);
      let thumbnailPath = thumbnailFile ? buildThumbnailStoragePath(path) : null;
      if (thumbnailFile && thumbnailPath) {
        const { error: thumbnailUploadError } = await uploadImage(storageBuckets.coupleMedia, thumbnailPath, thumbnailFile);
        if (thumbnailUploadError) {
          console.warn("Photo thumbnail upload failed:", thumbnailUploadError.message);
          thumbnailPath = null;
        }
      }

      const insertPayload = {
        couple_id: coupleId,
        uploader_id: userId,
        storage_path: path,
        thumbnail_storage_path: thumbnailPath,
        mime_type: file.type,
        size_bytes: file.size,
        caption: options.caption || file.name.replace(/\.[^.]+$/, ""),
      };
      let { error: insertError } = await supabase.from("media_files").insert(insertPayload);
      if (insertError && thumbnailPath && /thumbnail_storage_path|schema cache|column/i.test(insertError.message)) {
        const fallbackPayload = { ...insertPayload };
        delete (fallbackPayload as Partial<typeof insertPayload>).thumbnail_storage_path;
        const fallbackResult = await supabase.from("media_files").insert(fallbackPayload);
        insertError = fallbackResult.error;
        if (!insertError) {
          thumbnailPath = null;
        }
      }

      if (insertError) {
        const pathsToRemove = [path, thumbnailPath].filter((mediaStoragePath): mediaStoragePath is string => Boolean(mediaStoragePath));
        await supabase.storage.from(storageBuckets.coupleMedia).remove(pathsToRemove);
        showToast({ title: "相册保存失败", message: insertError.message, tone: "error" });
        failedFiles.push(file);
        continue;
      }

      uploadedCount += 1;
      uploadedFiles.push(file);
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
  }, [coupleId, mediaFiles.length, reload, showToast, userId]);

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

    const { error } = await supabase.from("media_files").update({ deleted_at: new Date().toISOString() }).eq("id", file.id);
    if (error) {
      showToast({ title: "删除失败", message: error.message, tone: "error" });
      return;
    }

    const pathsToRemove = [file.storage_path, file.thumbnail_storage_path].filter((path): path is string => Boolean(path));
    const { error: storageError } = await supabase.storage.from(storageBuckets.coupleMedia).remove(pathsToRemove);
    if (storageError) {
      showToast({ title: "照片已移除", message: "数据库记录已删，但云端文件清理未完全成功。", tone: "info" });
    } else {
      showToast({ title: "照片已删除", tone: "success" });
    }

    setActivePhotoPreview((current) => {
      if (!current || current.id !== file.id) {
        return current;
      }
      const remaining = mediaFiles.filter((item) => item.id !== file.id);
      return remaining[0] ? { id: remaining[0].id, index: 0 } : null;
    });
    reload();
  }, [mediaFiles, reload, setActivePhotoPreview, showToast]);

  return { handlePhotoFiles, uploadPhoto, deletePhoto };
}
