import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Image, Keyboard, Platform, Pressable, Text, View, type ImageSourcePropType } from "react-native";
import Reanimated from "react-native-reanimated";
import { Heart, ImagePlus, Mail, Sparkles } from "lucide-react-native";

import {
  AppTextInput,
  Card,
  CheckinCard,
  CapsuleMark,
  EmptyState,
  PrimaryButton,
} from "@/components/app-ui/AppUI";
import { useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { checkinPhotoCaption, splitStory, storyIconImageFromText } from "@/features/checkins/checkinUtils";
import type { PhotoFileList, PhotoUploadOptions, PhotoUploadResult } from "@/features/home/homeShared";
import { styles } from "@/features/home/homeStyles";
import { petAnchorProps, petSafeActionProps } from "@/features/home/petDomProps";
import { PhotoUploadInput } from "@/features/media/PhotoUploadInput";
import { imagePreviewUrl, mediaCaptionLabel } from "@/features/media/mediaUtils";
import { todayIsoDate } from "@/lib/dates/date";
import { emptyCopy, moodOptions } from "@/lib/constants/appContent";
import { isSupportedImage } from "@/lib/media/imageStorage";
import type { Checkin, CreationSpace, MediaFile } from "@/lib/supabase/database.types";
import { BouncyPressable } from "@/motion/BouncyPressable";
import { BreathingSkeleton } from "@/motion/BreathingSkeleton";
import { CrossFadeImage } from "@/motion/CrossFadeImage";
import { useErrorShake } from "@/motion/useErrorShake";
import { colors } from "@/styles/theme";

const todayCapsulePhotoLimit = 3;

type PetWorldDecisionProp = "photo" | "memory" | "letter" | "none" | null;

type EmotionCandyTone = {
  base: string;
  deep: string;
  glow: string;
  wash: string;
  ink: string;
};

const emotionCandyTones: Record<string, EmotionCandyTone> = {
  开心: { base: "#fff4c8", deep: "#e7b963", glow: "rgba(230, 184, 98, 0.22)", wash: "rgba(255, 229, 165, 0.24)", ink: "#8d6120" },
  想你: { base: "#ffe3eb", deep: "#d97896", glow: "rgba(217, 120, 150, 0.2)", wash: "rgba(255, 192, 211, 0.22)", ink: "#a94f68" },
  难过: { base: "#ebe4f5", deep: "#9c88c7", glow: "rgba(156, 136, 199, 0.2)", wash: "rgba(205, 190, 232, 0.22)", ink: "#6d5a97" },
  委屈: { base: "#e4f6ff", deep: "#77adc8", glow: "rgba(119, 173, 200, 0.2)", wash: "rgba(190, 231, 248, 0.22)", ink: "#4e7d94" },
};

function emotionCandyTone(mood: string): EmotionCandyTone {
  if (emotionCandyTones[mood]) return emotionCandyTones[mood];
  if (mood.includes("想")) return emotionCandyTones.想你;
  if (mood.includes("难")) return emotionCandyTones.难过;
  if (mood.includes("委")) return emotionCandyTones.委屈;
  return emotionCandyTones.开心;
}

function isSameCheckinSlot(left: Checkin, right: Checkin) {
  return (
    left.id === right.id ||
    (left.couple_id === right.couple_id &&
      left.user_id === right.user_id &&
      left.checkin_date === right.checkin_date)
  );
}

function mergeOptimisticCheckin(checkins: Checkin[], optimisticCheckin: Checkin | null) {
  if (!optimisticCheckin) {
    return checkins;
  }
  let replaced = false;
  const merged = checkins.map((item) => {
    if (isSameCheckinSlot(item, optimisticCheckin)) {
      replaced = true;
      return optimisticCheckin;
    }
    return item;
  });
  return replaced ? merged : [optimisticCheckin, ...checkins];
}

export function TodayStoryPage({
  coupleId,
  checkins,
  mediaFiles,
  creationSpace,
  petWorldProp,
  onChanged,
  onPhotoFiles,
  onMovePetForMemoryEvent,
  onSaveCheckin,
  onSaveMoodStatus,
}: {
  coupleId: string;
  checkins: Checkin[];
  mediaFiles: MediaFile[];
  creationSpace: CreationSpace | null;
  petWorldProp: PetWorldDecisionProp;
  onChanged: () => void;
  onPhotoFiles: (files: PhotoFileList, options?: PhotoUploadOptions) => Promise<PhotoUploadResult>;
  onMovePetForMemoryEvent: (coupleId: string, kind: "photo" | "memory" | "anniversary" | "today_capsule") => Promise<void>;
  onSaveCheckin?: (input: { checkinDate: string; content: string | null }) => Promise<Checkin>;
  onSaveMoodStatus?: (input: { mood: string; note: string | null }) => Promise<void>;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [mood, setMood] = useState(moodOptions[0]);
  const [customMood, setCustomMood] = useState("");
  const [content, setContent] = useState("");
  const [noteFocused, setNoteFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingPhotoFiles, setPendingPhotoFiles] = useState<File[]>([]);
  const [pendingPhotoPreviewUrls, setPendingPhotoPreviewUrls] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saveBurst, setSaveBurst] = useState(0);
  const [optimisticCheckin, setOptimisticCheckin] = useState<Checkin | null>(null);
  const saveCardScale = useRef(new Animated.Value(1)).current;
  const washOpacity = useRef(new Animated.Value(0.72)).current;
  const washBreath = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const { triggerShake: triggerSaveErrorShake, shakeStyle: saveErrorShakeStyle } = useErrorShake();

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(washOpacity, { toValue: 0.88, duration: 2500, useNativeDriver: false }),
        Animated.timing(washOpacity, { toValue: 0.72, duration: 2500, useNativeDriver: false }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [washOpacity]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(washBreath, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(washBreath, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [washBreath]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof URL === "undefined") {
      return;
    }
    const urls = pendingPhotoFiles.map((file) => URL.createObjectURL(file));
    setPendingPhotoPreviewUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pendingPhotoFiles]);

  useEffect(() => {
    if (!optimisticCheckin) {
      return;
    }
    const syncedCheckin = checkins.find((item) => isSameCheckinSlot(item, optimisticCheckin));
    if (syncedCheckin && syncedCheckin.updated_at >= optimisticCheckin.updated_at) {
      setOptimisticCheckin(null);
    }
  }, [checkins, optimisticCheckin]);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -1.5, duration: 40, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: 1.5, duration: 40, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: -0.8, duration: 40, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: 0.8, duration: 40, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: false }),
    ]).start();
  };

  const today = todayIsoDate();
  const visibleCheckins = mergeOptimisticCheckin(checkins, optimisticCheckin);
  const todayStories = visibleCheckins.filter((item) => item.checkin_date === today);
  const mineToday = todayStories.find((item) => item.user_id === user?.id);
  const partnerToday = todayStories.find((item) => item.user_id !== user?.id);
  const mineTodayPhotos = mineToday ? mediaFiles.filter((file) => file.caption === checkinPhotoCaption(mineToday)) : [];
  const trimmedContent = content.trim();
  const activeMood = customMood.trim() || mood;
  const capsuleComplete = Boolean(trimmedContent);
  const petDeliveringLetter = creationSpace?.pet_world_surface === "share" && petWorldProp === "letter";
  const selectedStoryImage = storyIconImageFromText(trimmedContent);
  const selectedMoodTone = emotionCandyTone(activeMood);
  const washScale = washBreath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const capsulePhotoPreviews = [
    ...mineTodayPhotos.map((file) => ({
      id: file.id,
      label: mediaCaptionLabel(file, "今日胶囊图片"),
      uri: imagePreviewUrl(file) ?? "",
      status: "已存",
    })),
    ...pendingPhotoFiles.map((file, index) => ({
      id: `pending-${file.name}-${file.lastModified}-${index}`,
      label: file.name,
      uri: pendingPhotoPreviewUrls[index] ?? "",
      status: "待封存",
    })),
  ].slice(0, todayCapsulePhotoLimit);

  async function handleCapsulePhotoFiles(files: PhotoFileList) {
    const selected = Array.from(files)
      .filter((file) => {
        const supported = isSupportedImage(file, 8 * 1024 * 1024);
        if (!supported) {
          showToast({ title: "图片格式不支持", message: "请上传 8MB 以内的 JPG、PNG、WebP 或 GIF 图片。", tone: "error" });
        }
        return supported;
      })
      .slice(0, Math.max(0, todayCapsulePhotoLimit - mineTodayPhotos.length - pendingPhotoFiles.length));
    if (!selected.length) {
      showToast({ title: "图片已满", message: `今日胶囊最多添加 ${todayCapsulePhotoLimit} 张图片。`, tone: "info" });
      return;
    }

    if (!mineToday) {
      setPendingPhotoFiles((current) => [...current, ...selected].slice(0, todayCapsulePhotoLimit));
      showToast({ title: "图片已选好", message: "封存今天后会一起保存。", tone: "success" });
      return;
    }

    setPhotoBusy(true);
    try {
      const uploadResult = await onPhotoFiles(selected, {
        caption: checkinPhotoCaption(mineToday),
        currentCount: mineTodayPhotos.length,
        maxFiles: todayCapsulePhotoLimit,
        successTitle: "图片已加入今日胶囊",
      });
      if (uploadResult.uploadedCount === 0 && uploadResult.failedFiles.length > 0) {
        showToast({ title: "图片未上传成功", message: "请稍后重试。", tone: "info" });
      }
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    if (!user || busy) {
      return;
    }
    if (!trimmedContent) {
      triggerSaveErrorShake();
      showToast({ title: "还没有内容", message: "先写一句今天想封存的话。", tone: "info" });
      return;
    }

    Keyboard.dismiss();
    setNoteFocused(false);
    setBusy(true);
    try {
      const text = trimmedContent ? `${activeMood}｜${trimmedContent}` : activeMood;
      if (!onSaveCheckin) {
        throw new Error("今日胶囊需要自建后端保存接口。");
      }
      const savedCheckin = await onSaveCheckin({ checkinDate: today, content: text });
      setOptimisticCheckin(savedCheckin);
      let pendingPhotosSaved = false;
      if (savedCheckin && pendingPhotoFiles.length > 0) {
        try {
          const uploadResult = await onPhotoFiles(pendingPhotoFiles, {
            caption: checkinPhotoCaption(savedCheckin),
            currentCount: mineTodayPhotos.length,
            maxFiles: todayCapsulePhotoLimit,
            successTitle: "图片已加入今日胶囊",
          });
          pendingPhotosSaved = uploadResult.failedFiles.length === 0;
          setPendingPhotoFiles(uploadResult.failedFiles);
          if (uploadResult.failedFiles.length > 0) {
            showToast({
              title: uploadResult.uploadedCount > 0 ? "部分图片稍后再试" : "文字已封存，图片稍后再试",
              message:
                uploadResult.uploadedCount > 0
                  ? "已成功上传的图片会进入记忆，未成功的图片仍保留在待封存区。"
                  : "今日胶囊正文已经保存，未上传成功的图片仍保留在待封存区。",
              tone: "info",
            });
          }
        } catch (photoError) {
          console.warn("Today capsule photo upload failed:", photoError);
          showToast({
            title: "文字已封存，图片稍后再试",
            message: "今日胶囊正文已经保存，未上传成功的图片仍保留在待封存区。",
            tone: "info",
          });
        }
      }

      if (!onSaveMoodStatus) {
        throw new Error("心情状态需要自建后端保存接口。");
      }
      try {
        await onSaveMoodStatus({ mood: activeMood, note: trimmedContent || null });
      } catch (moodError) {
        console.warn("Today capsule mood sync failed:", moodError instanceof Error ? moodError.message : moodError);
      }

      setSaveBurst((count) => count + 1);
      Animated.sequence([
        Animated.spring(saveCardScale, { toValue: 0.965, friction: 7, tension: 210, useNativeDriver: false }),
        Animated.spring(saveCardScale, { toValue: 1, friction: 5, tension: 170, useNativeDriver: false }),
      ]).start();
      setContent("");
      void onMovePetForMemoryEvent(coupleId, "today_capsule").catch((moveError) => {
        console.warn("Pet memory capsule sync failed:", moveError instanceof Error ? moveError.message : moveError);
      });
      if (!pendingPhotoFiles.length || pendingPhotosSaved) {
        showToast({ title: mineToday ? "今天的胶囊已更新" : "今天的胶囊已存好", message: "这句话已经放进你们的记忆里。", tone: "success" });
      }
      onChanged();
    } catch (error) {
      triggerSaveErrorShake();
      const message = error instanceof Error ? error.message : "请稍后重试。";
      showToast({ title: "保存失败", message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.todayStoryScreen}>
      <Card soft style={styles.capsulePreviewCard}>
        <View style={[styles.capsulePreviewGlow, { backgroundColor: selectedMoodTone.glow }]} />
        <Animated.View style={[styles.capsulePreviewMoodWash, { backgroundColor: selectedMoodTone.wash, opacity: washOpacity, transform: [{ scale: washScale }] }]} />
        <View pointerEvents="none" style={styles.capsulePreviewStageRing} />
        <View pointerEvents="none" style={styles.capsulePreviewSparkOne} />
        <View pointerEvents="none" style={styles.capsulePreviewSparkTwo} />
        <View style={styles.capsulePreviewStage}>
          <View pointerEvents="none" style={styles.capsulePreviewPedestal} />
          <Animated.View style={{ transform: [{ translateX: shakeAnim }, { rotate: shakeAnim.interpolate({ inputRange: [-2, 2], outputRange: ["-3deg", "3deg"] }) }] }}>
            <CapsuleMark
              size={70}
              complete={capsuleComplete}
              icon={<Image source={selectedStoryImage} style={styles.capsulePreviewImage} resizeMode="contain" />}
            />
          </Animated.View>
        </View>
        <View style={styles.capsulePreviewMetaPill}>
          <Sparkles color={selectedMoodTone.deep} size={13} strokeWidth={2.6} />
          <Text style={[styles.capsulePreviewMetaText, { color: selectedMoodTone.ink }]}>把今天存起来吧</Text>
        </View>
        {capsuleComplete ? <Text style={styles.capsulePreviewTitle}>这颗胶囊准备好了</Text> : null}
        {capsuleComplete ? (
          <Text style={styles.capsulePreviewText}>这句话会被安静封存到今天。</Text>
        ) : null}
      </Card>
      {petDeliveringLetter ? <PetLetterDeliveryCard /> : null}
      <Reanimated.View style={saveErrorShakeStyle}>
      <Animated.View style={{ transform: [{ scale: saveCardScale }] }}>
        <Card style={styles.createCapsuleCard}>
        <View pointerEvents="none" style={styles.createCapsuleCardWash} />
        <View pointerEvents="none" style={styles.createCapsulePaperFold} />
        <View {...petAnchorProps("share-capsule-composer", "capsule-composer")} style={styles.capsuleComposerHeader}>
          <View style={styles.capsuleComposerTitleRow}>
            <Text style={styles.centerTitle}>今日胶囊</Text>
            <View style={styles.capsuleComposerSeal}>
              <Heart color="#fff" fill="#fff" size={12} strokeWidth={2.6} />
            </View>
          </View>
          <Text style={styles.capsuleComposerHint}>挑一颗情绪糖，写下今天想封存的一句话。</Text>
        </View>
        <View style={styles.moodOptionalBlock}>
          <View style={styles.moodTrayHeader}>
            <Text style={styles.moodOptionalTitle}>今天的心情</Text>
            <Text style={styles.moodTrayLabel}>糖果盒</Text>
          </View>
          <View {...petSafeActionProps()}>
            <EmotionCandySelector
              moods={moodOptions}
              value={mood}
              onChange={(nextMood) => {
                setMood(nextMood);
                setCustomMood("");
              }}
            />
          </View>
          <AppTextInput
            value={customMood}
            onChangeText={setCustomMood}
            placeholder="也可以自己写：比如 松弛、乱糟糟、很想抱抱"
            style={styles.customMoodInput}
          />
        </View>
        <FoldedMoodNote focused={noteFocused}>
          <AppTextInput
            value={content}
            onChangeText={(text) => {
              setContent(text);
              triggerShake();
            }}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
            placeholder="封存今天的一些碎碎念和小情绪..."
            multiline
            style={styles.storyInput}
          />
        </FoldedMoodNote>
        <View style={styles.capsulePhotoUploadRow}>
          <BouncyPressable
            {...petSafeActionProps()}
            accessibilityRole="button"
            accessibilityLabel="给今日胶囊上传图片"
            disabled={busy || photoBusy || mineTodayPhotos.length + pendingPhotoFiles.length >= todayCapsulePhotoLimit}
            haptic="selection"
            style={[
              styles.capsulePhotoUploadButton,
              busy || photoBusy || mineTodayPhotos.length + pendingPhotoFiles.length >= todayCapsulePhotoLimit ? styles.capsulePhotoUploadButtonDisabled : null,
            ]}
          >
            <ImagePlus color={colors.accentDark} size={16} strokeWidth={2.5} />
            <Text style={styles.capsulePhotoUploadText}>{photoBusy ? "上传中" : "添加图片"}</Text>
            <PhotoUploadInput
              accessibilityLabel="给今日胶囊上传图片"
              disabled={busy || photoBusy || mineTodayPhotos.length + pendingPhotoFiles.length >= todayCapsulePhotoLimit}
              multiple
              onFiles={handleCapsulePhotoFiles}
            />
          </BouncyPressable>
          <Text style={styles.capsulePhotoUploadMeta}>
            {mineTodayPhotos.length + pendingPhotoFiles.length}/{todayCapsulePhotoLimit} 张
          </Text>
        </View>
        {capsulePhotoPreviews.length ? (
          <View style={styles.capsulePhotoPreviewRow}>
            {capsulePhotoPreviews.map((item, index) => (
              <View key={item.id} style={styles.capsulePhotoPreviewItem}>
                {item.uri ? (
                  <CrossFadeImage source={{ uri: item.uri }} style={styles.capsulePhotoPreviewImage} resizeMode="cover" />
                ) : (
                  <BreathingSkeleton style={styles.capsulePhotoPreviewImage} />
                )}
                <View pointerEvents="none" style={styles.capsulePhotoPreviewBadge}>
                  <Text style={styles.capsulePhotoPreviewBadgeText}>{item.status}</Text>
                </View>
                <Text numberOfLines={1} style={styles.capsulePhotoPreviewLabel}>{item.label || `图片 ${index + 1}`}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View {...petSafeActionProps()}>
          <PrimaryButton label={busy ? "封存中" : mineToday ? "更新这颗胶囊" : "封存今天"} onPress={save} loading={busy} />
        </View>
        </Card>
      </Animated.View>
      </Reanimated.View>
      {saveBurst ? <CapsuleSaveFlight key={saveBurst} image={selectedStoryImage} /> : null}

      <View {...petAnchorProps("share-today-capsule", "today-capsule")}>
      <TodayCapsuleSummaryCard>
        {todayStories.length === 0 ? (
          <Pressable {...petSafeActionProps()} accessibilityRole="button" accessibilityLabel="创建第一颗今日胶囊" onPress={() => setContent("")} style={styles.emptyStatePressable}>
            <EmptyState title={emptyCopy.stories.title} />
          </Pressable>
        ) : (
          <View style={styles.doubleCapsulesRow}>
            <View style={[styles.sideCapsuleContainer, { transform: [{ rotate: "-0.8deg" }] }]}>
              {mineToday ? (
                <CheckinCard author="我" mood={splitStory(mineToday.content).mood} body={splitStory(mineToday.content).body} date="今天" compact />
              ) : (
                <Pressable {...petSafeActionProps()} accessibilityRole="button" accessibilityLabel="我今天还空着" onPress={() => setContent("")} style={styles.sideCapsuleEmpty}>
                  <Heart color={colors.accent} size={15} style={{ marginBottom: 4 }} />
                  <Text style={styles.sideCapsuleEmptyText}>+ 我今天还空着</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.doubleCapsulesConnector}>
              <Heart color={colors.accentDark} fill={colors.accentSoft} size={13} />
            </View>
            <View style={[styles.sideCapsuleContainer, { transform: [{ rotate: "0.8deg" }] }]}>
              {partnerToday ? (
                <CheckinCard author="TA" mood={splitStory(partnerToday.content).mood} body={splitStory(partnerToday.content).body} date="今天" compact />
              ) : (
                <View style={styles.sideCapsuleWaiting}>
                  <Sparkles color={colors.faint} size={15} style={{ marginBottom: 4 }} />
                  <Text style={styles.sideCapsuleWaitingText}>TA 正在写...</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </TodayCapsuleSummaryCard>
      </View>

      <Card style={styles.historyCapsuleCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>历史胶囊</Text>
          {visibleCheckins.length ? <Text style={styles.linkText}>共 {visibleCheckins.length} 颗</Text> : null}
        </View>
        {visibleCheckins.length === 0 ? (
          <EmptyState title="还没有历史胶囊" description="第一颗日常胶囊会从今天开始。" />
        ) : (
          visibleCheckins.map((item) => {
            const story = splitStory(item.content);
            return <ActivityRow key={item.id} title={`${story.mood ? `${story.mood}：` : ""}${story.body}`} meta={item.checkin_date} icon={story.iconImage} />;
          })
        )}
      </Card>
    </View>
  );
}

function EmotionCandySelector({
  moods,
  value,
  onChange,
}: {
  moods: string[];
  value: string;
  onChange: (mood: string) => void;
}) {
  const popByMood = useRef(Object.fromEntries(moods.map((mood) => [mood, new Animated.Value(1)]))).current;

  function chooseMood(nextMood: string) {
    Animated.sequence([
      Animated.spring(popByMood[nextMood], { toValue: 0.965, friction: 7, tension: 240, useNativeDriver: false }),
      Animated.spring(popByMood[nextMood], { toValue: 1.018, friction: 7, tension: 170, useNativeDriver: false }),
      Animated.spring(popByMood[nextMood], { toValue: 1, friction: 8, tension: 130, useNativeDriver: false }),
    ]).start();
    onChange(nextMood);
  }

  return (
    <View style={styles.emotionCandyGrid}>
      {moods.map((mood) => {
        const tone = emotionCandyTone(mood);
        const active = mood === value;
        return (
          <Animated.View key={mood} style={[styles.emotionCandyMotion, { transform: [{ scale: popByMood[mood] }] }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => chooseMood(mood)}
              style={[
                styles.emotionCandy,
                {
                  backgroundColor: tone.base,
                  borderColor: active ? tone.deep : "rgba(255,255,255,0.92)",
                  boxShadow: active
                    ? `0 8px 14px ${tone.glow}, inset 0 1px 2px rgba(255,255,255,0.92), inset 0 -6px 12px rgba(124,73,83,0.07)`
                    : "0 6px 12px rgba(82,61,66,0.055), inset 0 1px 2px rgba(255,255,255,0.86)",
                } as never,
              ]}
            >
              <View pointerEvents="none" style={styles.emotionCandyShine} />
              <View pointerEvents="none" style={[styles.emotionCandyLowerShade, { backgroundColor: tone.deep }]} />
              {active ? <View pointerEvents="none" style={[styles.emotionCandyActiveRing, { borderColor: tone.deep }]} /> : null}
              <Text style={[styles.emotionCandyText, { color: tone.ink }]}>{mood}</Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

function FoldedMoodNote({
  focused,
  children,
}: {
  focused: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[styles.foldedMoodNote, focused ? styles.foldedMoodNoteFocused : null]}>
      <View pointerEvents="none" style={styles.foldedMoodNoteLines} />
      <View pointerEvents="none" style={styles.foldedMoodNoteMarginLine} />
      <View pointerEvents="none" style={styles.foldedMoodNoteFold} />
      <View pointerEvents="none" style={styles.foldedMoodNoteFoldShadow} />
      {children}
    </View>
  );
}

function TodayCapsuleSummaryCard({ children }: { children?: ReactNode }) {
  return (
    <Card style={styles.todayCapsuleSummaryCard}>
      <View pointerEvents="none" style={styles.todayCapsuleSummaryGlow} />
      {children}
    </Card>
  );
}

function PetLetterDeliveryCard() {
  return (
    <View {...petAnchorProps("share-letter-delivery", "letter-delivery")}>
      <Card style={styles.petLetterDeliveryCard}>
        <View pointerEvents="none" style={styles.petLetterDeliveryGlow} />
        <View style={styles.petLetterDeliveryIcon}>
          <Mail color={colors.accentDark} size={23} strokeWidth={2.45} />
        </View>
        <View style={styles.petLetterDeliveryCopy}>
          <Text style={styles.petLetterDeliveryTitle}>云宠送信来了</Text>
          <Text style={styles.petLetterDeliveryText}>它只负责送达提醒；打开后看到的仍是伴侣原文。</Text>
        </View>
      </Card>
    </View>
  );
}

function CapsuleSaveFlight({ image }: { image?: ImageSourcePropType }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 900, useNativeDriver: false }).start();
  }, [progress]);

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.capsuleSaveTarget,
          {
            opacity: progress.interpolate({ inputRange: [0, 0.2, 0.84, 1], outputRange: [0, 1, 1, 0] }),
            transform: [{ scale: progress.interpolate({ inputRange: [0, 0.84, 1], outputRange: [0.92, 1, 1.08] }) }],
          },
        ]}
      >
        <Text style={styles.capsuleSaveTargetDay}>{new Date().getDate()}</Text>
        <Text style={styles.capsuleSaveTargetText}>今天</Text>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.capsuleSaveFlight,
          {
            opacity: progress.interpolate({ inputRange: [0, 0.18, 0.82, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 132] }) },
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -236] }) },
              { scale: progress.interpolate({ inputRange: [0, 0.36, 1], outputRange: [1, 0.74, 0.32] }) },
              { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "16deg"] }) },
            ],
          },
        ]}
      >
        <CapsuleMark size={42} complete icon={image ? <Image source={image} style={styles.capsuleSaveFlightImage} resizeMode="contain" /> : null} />
      </Animated.View>
    </>
  );
}

function ActivityRow({ title, meta, icon }: { title: string; meta: string; icon?: ImageSourcePropType }) {
  return (
    <View style={styles.activityRow}>
      {icon ? (
        <View style={styles.activityIconSlot}>
          <Image source={icon} style={styles.activityIconImage} resizeMode="contain" />
        </View>
      ) : (
        <View style={styles.activityDot} />
      )}
      <View style={styles.activityText}>
        <Text style={styles.activityTitle}>{title}</Text>
        <Text style={styles.activityMeta}>{meta}</Text>
      </View>
    </View>
  );
}
