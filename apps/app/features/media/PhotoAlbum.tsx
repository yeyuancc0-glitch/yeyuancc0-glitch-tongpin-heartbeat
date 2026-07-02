import { useEffect, useState } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { ImagePlus, ChevronLeft, Download, Trash2 } from "lucide-react-native";
import { Platform, Text, View } from "react-native";
import Reanimated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { Card } from "@/components/app-ui/AppUI";
import { styles } from "@/features/home/homeStyles";
import type { PhotoFileList, PhotoUploadOptions, PhotoUploadResult } from "@/features/home/homeShared";
import { petAnchorProps } from "@/features/home/petDomProps";
import { PhotoUploadInput } from "@/features/media/PhotoUploadInput";
import { imagePreviewUrl, mediaCaptionLabel } from "@/features/media/mediaUtils";
import { useAuth } from "@/features/auth/AuthProvider";
import { useToast } from "@/components/ui";
import { prefetchImageUrls } from "@/lib/media/imageStorage";
import { createSelfHostMediaReadUrl } from "@/lib/selfHost/mediaApi";
import type { MediaFile } from "@/lib/supabase/database.types";
import { renderPortal } from "@/lib/platform/portal";
import { BouncyPressable } from "@/motion/BouncyPressable";
import { BreathingSkeleton } from "@/motion/BreathingSkeleton";
import { CrossFadeImage } from "@/motion/CrossFadeImage";
import { haptics } from "@/motion/haptics";
import { useMotion } from "@/motion/MotionProvider";
import { motionTokens } from "@/motion/tokens";
import { colors } from "@/styles/theme";

const photoPreviewOriginalPrefetchRadius = 1;

function hasOriginalUrlCacheEntry(cache: Record<string, string | null>, id: string) {
  return Object.prototype.hasOwnProperty.call(cache, id);
}

function photoPreviewOriginalCandidates(files: MediaFile[], currentIndex: number) {
  const candidates: MediaFile[] = [];
  const addCandidate = (index: number) => {
    const file = files[index];
    if (file && !candidates.some((candidate) => candidate.id === file.id)) {
      candidates.push(file);
    }
  };

  addCandidate(currentIndex);
  for (let offset = 1; offset <= photoPreviewOriginalPrefetchRadius; offset += 1) {
    addCandidate(currentIndex + offset);
    addCandidate(currentIndex - offset);
  }
  return candidates;
}

export function PhotoAlbumCard({
  mediaFiles,
  onPhotoFiles,
  onPreviewPhoto,
  onDeletePhoto,
  onRequireAccess,
}: {
  mediaFiles: MediaFile[];
  onPhotoFiles: (files: PhotoFileList, options?: PhotoUploadOptions) => Promise<PhotoUploadResult>;
  onPreviewPhoto: (file: MediaFile, index?: number) => void;
  onDeletePhoto: (file: MediaFile) => void;
  onRequireAccess: () => void;
}) {
  const { session } = useAuth();
  const previews = mediaFiles.slice(0, 9);
  const hiddenCount = Math.max(0, mediaFiles.length - previews.length);

  function openPhoto(file: MediaFile, index: number) {
    onPreviewPhoto(file, index);
  }

  return (
    <View {...petAnchorProps("home-photo-album", "photo-album")}>
    <Card style={styles.photoAlbumCard}>
      <View style={styles.photoAlbumHeader}>
        <View style={styles.photoAlbumTitleGroup}>
          <Text style={styles.sectionTitle}>拍立得时光墙</Text>
          <Text style={styles.photoAlbumMeta}>{mediaFiles.length ? `${mediaFiles.length} 张照片` : "还没有照片"}</Text>
        </View>
        <View style={styles.photoAlbumHeaderActions}>
          {mediaFiles.length > 9 ? (
            <BouncyPressable accessibilityRole="button" accessibilityLabel="查看全部照片" onPress={() => openPhoto(mediaFiles[0], 0)} haptic="selection" style={styles.photoAlbumViewAllButton}>
              <Text style={styles.photoAlbumViewAllText}>查看全部</Text>
            </BouncyPressable>
          ) : null}
          <BouncyPressable accessibilityRole="button" accessibilityLabel="上传照片" onPress={onRequireAccess} haptic="selection" style={styles.photoAlbumUploadButton}>
            <ImagePlus color={colors.accentDark} size={17} />
            <PhotoUploadInput accessibilityLabel="上传照片" blocked={!session?.access_token} multiple onFiles={onPhotoFiles} onRequireAccess={onRequireAccess} />
          </BouncyPressable>
        </View>
      </View>
      {previews.length ? (
        <View style={styles.photoAlbumGrid}>
          {previews.map((file, index) => {
            const rotateDeg = `${(index % 3 === 0 ? -2.2 : index % 3 === 1 ? 1.8 : -1.2) * (1 - (index % 2) * 0.4)}deg`;
            const imageUrl = imagePreviewUrl(file);
            return (
              <View key={file.id} style={[styles.photoAlbumThumb, { transform: [{ rotate: rotateDeg }] }]}>
              <BouncyPressable
                accessibilityRole="button"
                accessibilityLabel={`查看照片 ${index + 1}${file.caption ? ` ${mediaCaptionLabel(file)}` : ""}`}
                onPress={() => openPhoto(file, index)}
                haptic="selection"
                style={styles.photoAlbumThumbPressable}
              >
                {imageUrl ? <CrossFadeImage source={{ uri: imageUrl }} style={styles.photoAlbumImage} resizeMode="cover" fadeIn={false} prefetched /> : <BreathingSkeleton style={styles.photoAlbumImage} />}
                {hiddenCount > 0 && index === previews.length - 1 ? (
                  <View pointerEvents="none" style={styles.photoAlbumMoreOverlay}>
                    <Text style={styles.photoAlbumMoreText}>+{hiddenCount}</Text>
                  </View>
                ) : null}
              </BouncyPressable>
              <Text numberOfLines={1} style={styles.photoAlbumCaption}>{mediaCaptionLabel(file, `${index + 1} 号瞬间`)}</Text>
              <BouncyPressable
                accessibilityRole="button"
                accessibilityLabel={`删除照片 ${index + 1}${file.caption ? ` ${mediaCaptionLabel(file)}` : ""}`}
                onPress={() => onDeletePhoto(file)}
                haptic="selection"
                style={styles.photoAlbumDeleteBadge}
              >
                <Trash2 color="#fff" size={12} strokeWidth={2.8} />
              </BouncyPressable>
            </View>
          );
        })}
      </View>
      ) : (
        <BouncyPressable accessibilityRole="button" accessibilityLabel="上传第一张照片" onPress={onRequireAccess} haptic="selection" style={styles.photoAlbumEmpty}>
          <PhotoUploadInput accessibilityLabel="上传第一张照片" blocked={!session?.access_token} multiple onFiles={onPhotoFiles} onRequireAccess={onRequireAccess} />
          <View style={styles.photoAlbumEmptyCamera}>
            <ImagePlus color="rgba(123,103,108,0.52)" size={28} />
          </View>
          <Text style={styles.photoAlbumEmptyTitle}>下一个瞬间</Text>
          <Text style={styles.photoAlbumEmptyText}>在这里，留存我们的下一个瞬间。</Text>
        </BouncyPressable>
      )}
    </Card>
    </View>
  );
}

async function downloadImageWeb(url: string, filename: string) {
  const response = await fetch(url, { cache: "force-cache" });
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

export function PhotoPreviewPopup({
  files,
  activeId,
  activeIndex,
  onClose,
  onDelete,
  onSelect,
}: {
  files: MediaFile[];
  activeId: string;
  activeIndex: number;
  onClose: () => void;
  onDelete: (file: MediaFile) => void;
  onSelect: (file: MediaFile, index: number) => void;
}) {
  const { session } = useAuth();
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const { reducedMotion } = useMotion();
  const intro = useSharedValue(reducedMotion ? 1 : 0);
  const dragY = useSharedValue(0);
  const dragX = useSharedValue(0);
  const activeIdIndex = files.findIndex((item) => item.id === activeId);
  const fallbackIndex = Number.isFinite(activeIndex) ? Math.min(Math.max(activeIndex, 0), Math.max(files.length - 1, 0)) : 0;
  const currentIndex = activeIdIndex >= 0 ? activeIdIndex : fallbackIndex;
  const file = files[currentIndex] ?? files[0];
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < files.length - 1;
  const [originalUrlById, setOriginalUrlById] = useState<Record<string, string | null>>({});

  const hasCachedOriginalUrl = file ? hasOriginalUrlCacheEntry(originalUrlById, file.id) : false;
  const cachedOriginalUrl = file && hasCachedOriginalUrl ? originalUrlById[file.id] : null;
  const originalUrl = file && hasCachedOriginalUrl ? cachedOriginalUrl : null;
  const previewUrl = file ? originalUrl ?? file.thumbnailSignedUrl ?? file.signedUrl ?? null : null;
  const previewIsPrefetchedOriginal = Boolean(originalUrl);

  useEffect(() => {
    intro.value = reducedMotion ? 1 : 0;
    intro.value = withSpring(1, motionTokens.spring.sheet);
    dragX.value = 0;
    dragY.value = 0;
  }, [activeId, dragX, dragY, intro, reducedMotion]);

  useEffect(() => {
    let active = true;
    const candidates = photoPreviewOriginalCandidates(files, currentIndex).filter(
      (candidate) => candidate.storage_path && !hasOriginalUrlCacheEntry(originalUrlById, candidate.id)
    );
    if (!candidates.length) {
      return () => {
        active = false;
      };
    }

    void (async () => {
      const resolvedEntries = await Promise.all(
        candidates.map(async (candidate) => {
          const url =
            candidate.signedUrl ??
            (session?.access_token
              ? await createSelfHostMediaReadUrl({ accessToken: session.access_token, mediaId: candidate.id, variant: "original" }).catch((error) => {
                  console.warn("Self-host media original prefetch failed:", error);
                  return null;
                })
              : null);
          return [candidate.id, url] as const;
        })
      );
      await prefetchImageUrls(resolvedEntries.map(([, url]) => url), 2);
      if (!active) {
        return;
      }
      setOriginalUrlById((current) => {
        let changed = false;
        const next = { ...current };
        resolvedEntries.forEach(([id, url]) => {
          if (hasOriginalUrlCacheEntry(current, id)) {
            return;
          }
          next[id] = url;
          changed = true;
        });
        return changed ? next : current;
      });
    })();

    return () => {
      active = false;
    };
  }, [currentIndex, files, originalUrlById, session?.access_token]);

  if (!file) {
    return null;
  }

  const viewportHeight = Platform.OS === "web" && typeof window !== "undefined" ? window.innerHeight : 760;

  function closeFromGesture() {
    haptics.selection();
    onClose();
  }

  const pan = Gesture.Pan()
    .runOnJS(false)
    .onUpdate((event) => {
      dragX.value = event.translationX * 0.16;
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > motionTokens.photoDismissDistance || event.velocityY > motionTokens.photoDismissVelocity) {
        dragY.value = withTiming(viewportHeight * 0.46, { duration: 180, easing: Easing.out(Easing.quad) }, (finished) => {
          if (finished) {
            runOnJS(closeFromGesture)();
          }
        });
        return;
      }
      dragX.value = withSpring(0, motionTokens.spring.sheet);
      dragY.value = withSpring(0, motionTokens.spring.sheet);
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragY.value, [0, motionTokens.photoDismissDistance * 1.5], [intro.value, 0.1]),
  }));

  const cardStyle = useAnimatedStyle(() => {
    const dragScale = interpolate(dragY.value, [0, motionTokens.photoDismissDistance * 1.8], [1, 0.78]);
    return {
      opacity: interpolate(intro.value, [0, 0.12, 1], [0, 1, 1]),
      transform: [
        { translateX: dragX.value },
        { translateY: interpolate(intro.value, [0, 1], [16, 0]) + dragY.value },
        { scale: interpolate(intro.value, [0, 1], [0.985, 1]) * dragScale },
      ],
    };
  });

  const popup = (
    <View role="dialog" aria-modal={true} pointerEvents="box-none" style={styles.photoPreviewLayer}>
      <Reanimated.View style={[styles.photoPreviewBackdrop, backdropStyle]} />
      <GestureDetector gesture={pan}>
      <Reanimated.View style={[styles.photoPreviewCard, cardStyle]}>
        <View style={styles.photoPreviewHeader}>
          <View style={styles.photoPreviewCounterPill}>
            <Text style={styles.photoPreviewCounterText}>
              {currentIndex + 1} / {files.length}
            </Text>
          </View>
          <BouncyPressable accessibilityRole="button" accessibilityLabel="关闭预览" onPress={onClose} haptic="selection" style={styles.photoPreviewCloseIcon}>
            <Text style={styles.photoPreviewCloseIconText}>×</Text>
          </BouncyPressable>
        </View>
        <View style={styles.photoPreviewFrame}>
          {previewUrl ? <CrossFadeImage source={{ uri: previewUrl }} style={styles.photoPreviewImage} resizeMode="contain" prefetched={previewIsPrefetchedOriginal} /> : <BreathingSkeleton style={styles.photoPreviewImage} />}
          {canGoPrev ? (
            <BouncyPressable
              accessibilityRole="button"
              accessibilityLabel="上一张"
              onPress={() => {
                haptics.selection();
                onSelect(files[currentIndex - 1], currentIndex - 1);
              }}
              haptic="selection"
              style={[styles.photoPreviewNavButton, styles.photoPreviewNavLeft]}
            >
              <ChevronLeft color={colors.accentDark} size={18} strokeWidth={2.8} />
            </BouncyPressable>
          ) : null}
          {canGoNext ? (
            <BouncyPressable
              accessibilityRole="button"
              accessibilityLabel="下一张"
              onPress={() => {
                haptics.selection();
                onSelect(files[currentIndex + 1], currentIndex + 1);
              }}
              haptic="selection"
              style={[styles.photoPreviewNavButton, styles.photoPreviewNavRight]}
            >
              <Text style={styles.photoPreviewNavText}>›</Text>
            </BouncyPressable>
          ) : null}
        </View>
        <View style={styles.photoPreviewMeta}>
          <Text style={styles.photoPreviewTitle}>{mediaCaptionLabel(file, "相册里的瞬间")}</Text>
          <Text style={styles.photoPreviewBody}>这是你们相册中的第 {currentIndex + 1} 张照片。</Text>
        </View>
        <View style={styles.photoPreviewActions}>
          <BouncyPressable accessibilityRole="button" accessibilityLabel="删除这张照片" onPress={() => onDelete(file)} haptic="selection" style={styles.photoPreviewDelete}>
            <Trash2 color={colors.accentDark} size={16} strokeWidth={2.5} />
            <Text style={styles.photoPreviewDeleteText}>删除</Text>
          </BouncyPressable>
          <BouncyPressable
            accessibilityRole="button"
            accessibilityLabel="保存照片"
            disabled={downloading || !previewUrl}
            onPress={async () => {
              if (!previewUrl || downloading) return;
              setDownloading(true);
              try {
                if (Platform.OS === "web") {
                  const ext = file.mime_type?.split("/")[1] ?? "jpg";
                  await downloadImageWeb(previewUrl, `photo_${file.id.slice(0, 8)}.${ext}`);
                }
                haptics.success();
                showToast({ title: "照片已保存", tone: "success" });
              } catch {
                showToast({ title: "保存失败", message: "请稍后重试。", tone: "error" });
              } finally {
                setDownloading(false);
              }
            }}
            haptic="selection"
            style={styles.photoPreviewClose}
          >
            <Download color={colors.accentDark} size={16} strokeWidth={2.5} />
            <Text style={styles.photoPreviewCloseText}>{downloading ? "保存中" : "保存"}</Text>
          </BouncyPressable>
        </View>
        {files.length > 1 ? (
          <View style={styles.photoPreviewStrip}>
            {files.map((item, index) => {
              const stripImageUrl = imagePreviewUrl(item);
              return (
                <BouncyPressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`切换到照片 ${index + 1}${item.caption ? ` ${mediaCaptionLabel(item)}` : ""}`}
                  onPress={() => {
                    haptics.selection();
                    onSelect(item, index);
                  }}
                  haptic="selection"
                  style={[styles.photoPreviewStripThumb, item.id === file.id ? styles.photoPreviewStripThumbActive : null]}
                >
                  {stripImageUrl ? <CrossFadeImage source={{ uri: stripImageUrl }} style={styles.photoPreviewStripImage} resizeMode="cover" /> : <BreathingSkeleton style={styles.photoPreviewStripImage} />}
                </BouncyPressable>
              );
            })}
          </View>
        ) : null}
      </Reanimated.View>
      </GestureDetector>
    </View>
  );

  return renderPortal(popup);
}
