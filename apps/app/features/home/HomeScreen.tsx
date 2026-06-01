import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Alert, Animated, Image, Keyboard, Platform, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import {
  Bell,
  Bone,
  Brain,
  CalendarPlus,
  Check,
  ChevronLeft,
  Gamepad2,
  ImagePlus,
  Heart,
  Info,
  Mail,
  PawPrint,
  Send,
  ShoppingBag,
  Sparkles,
  Utensils,
  Lock,
  LogOut,
  MessageCircle,
  Shield,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react-native";

const glassDockStyle = {
  backdropFilter: "blur(14px) saturate(1.2) contrast(1.02)",
  WebkitBackdropFilter: "blur(14px) saturate(1.2) contrast(1.02)",
} as never;

import {
  AppTextInput,
  BottomTabBar,
  FloatingEntryButton,
  type BottomTabKey,
  Card,
  CheckinCard,
  CapsuleMark,
  CoupleAvatarGroup,
  EmptyState,
  InteractionButton,
  MessageCard,
  PageContainer,
  PrimaryButton,
  SecondaryButton,
  SettingRow,
  TopBar,
  LoadingState,
} from "@/components/app-ui/AppUI";
import { DateField, InlineNotice, useAppScrollY, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCoupleData } from "@/features/home/useCoupleData";
import { PairingScreen } from "@/features/pairing/PairingScreen";
import { ProfileScreen } from "@/features/profile/ProfileScreen";
import { daysBetween, formatShortDate, todayIsoDate } from "@/lib/dates/date";
import {
  mockEmptyCopy,
  mockInteractions,
  mockMoodLabels,
  mockMoods,
} from "@/lib/mock/appMock";
import { supabase } from "@/lib/supabase/client";
import type { CalendarEvent, Checkin, CoupleFootprint, CreationAction, CreationSpace, LetterPreview, MediaFile, Message, MoodStatus, Notification } from "@/lib/supabase/database.types";
import { buildStoragePath, isSupportedImage, storageBuckets, uploadImage } from "@/lib/supabase/storage";
import { colors } from "@/styles/theme";

const cartoonIcons = {
  milkTea: require("@/assets/interaction-icons/milk-tea.png") as ImageSourcePropType,
  hug: require("@/assets/interaction-icons/hug.png") as ImageSourcePropType,
  missYou: require("@/assets/interaction-icons/miss-you.png") as ImageSourcePropType,
  cuddle: require("@/assets/interaction-icons/cuddle.png") as ImageSourcePropType,
  loveNote: require("@/assets/interaction-icons/love-note.png") as ImageSourcePropType,
  calendar: require("@/assets/interaction-icons/cute-calendar.png") as ImageSourcePropType,
};

const quickInteractionIcons = {
  miss: require("@/assets/quick-interaction-icons/miss-you.png") as ImageSourcePropType,
  hug: require("@/assets/quick-interaction-icons/hug.png") as ImageSourcePropType,
  close: require("@/assets/quick-interaction-icons/close.png") as ImageSourcePropType,
  custom: require("@/assets/quick-interaction-icons/custom.png") as ImageSourcePropType,
};

const capsuleIcons = {
  daily: require("@/assets/capsule-icons/daily.png") as ImageSourcePropType,
  flower: require("@/assets/capsule-icons/flower.png") as ImageSourcePropType,
  gift: require("@/assets/capsule-icons/gift.png") as ImageSourcePropType,
  health: require("@/assets/capsule-icons/health.png") as ImageSourcePropType,
  home: require("@/assets/capsule-icons/home.png") as ImageSourcePropType,
  hug: require("@/assets/capsule-icons/hug.png") as ImageSourcePropType,
  meal: require("@/assets/capsule-icons/meal.png") as ImageSourcePropType,
  milkTea: require("@/assets/capsule-icons/milk-tea.png") as ImageSourcePropType,
  miss: require("@/assets/capsule-icons/miss.png") as ImageSourcePropType,
  movie: require("@/assets/capsule-icons/movie.png") as ImageSourcePropType,
  music: require("@/assets/capsule-icons/music.png") as ImageSourcePropType,
  note: require("@/assets/capsule-icons/note.png") as ImageSourcePropType,
  pet: require("@/assets/capsule-icons/pet.png") as ImageSourcePropType,
  photo: require("@/assets/capsule-icons/photo.png") as ImageSourcePropType,
  travel: require("@/assets/capsule-icons/travel.png") as ImageSourcePropType,
  walk: require("@/assets/capsule-icons/walk.png") as ImageSourcePropType,
  work: require("@/assets/capsule-icons/work.png") as ImageSourcePropType,
};

const creationPetAssets = {
  silver_tabby: require("@/assets/creation-pets/silver-tabby-cat.png") as ImageSourcePropType,
  golden_retriever: require("@/assets/creation-pets/golden-retriever-puppy.png") as ImageSourcePropType,
  cream_shorthair: require("@/assets/creation-pets/cream-british-shorthair.png") as ImageSourcePropType,
  corgi: require("@/assets/creation-pets/corgi-dog.png") as ImageSourcePropType,
};

type SettingPage = "profile" | "couple" | "notifications" | "privacy" | "relationship" | "feedback" | "about";
type SubPage = "main" | "messages" | "addEvent" | "writeLetter" | "letterInbox" | "creation" | SettingPage;
type QuickInteractionItem = { id: string; label: string; tone: string; icon?: ImageSourcePropType };
type CreationPetKey = CreationSpace["pet_key"];
type CreationFoodType = "basic" | "premium";
type CreationPuzzle = {
  id: string;
  type: "解谜" | "脑筋急转弯";
  question: string;
  options: string[];
  answer: string;
  hint: string;
};
type PhotoUploadOptions = {
  caption?: string;
  currentCount?: number;
  maxFiles?: number;
  successTitle?: string;
};
type PhotoPreviewState = {
  id: string;
  index: number;
};

const maxQuickInteractionCards = 8;
const maxMemoryPhotos = 10;
const quickInteractionNotificationTitle = "TA 投递了一点心情";
const quickInteractionMessagePattern = /^投递了「.+」$/;
const quickInteractionPresetItems = mockInteractions.filter((item) => item.id !== "message");
const quickInteractionAddItem = mockInteractions.find((item) => item.id === "message") ?? {
  id: "message",
  label: "自定义互动",
  tone: "#eef4f6",
  icon: quickInteractionIcons.custom,
};
const maxCustomQuickInteractions = Math.max(0, maxQuickInteractionCards - quickInteractionPresetItems.length - 1);

const creationPetOptions: Array<{
  key: CreationPetKey;
  species: "cat" | "dog";
  name: string;
  title: string;
  description: string;
  trait: string;
  image: ImageSourcePropType;
}> = [
  {
    key: "silver_tabby",
    species: "cat",
    name: "银纹",
    title: "银纹云猫",
    description: "安静、黏人，喜欢在柔软窝垫上观察你们。",
    trait: "陪伴型猫咪",
    image: creationPetAssets.silver_tabby,
  },
  {
    key: "cream_shorthair",
    species: "cat",
    name: "奶霜",
    title: "奶霜短毛猫",
    description: "圆脸慢热，被照顾好后会贴近你们的日常。",
    trait: "治愈型猫咪",
    image: creationPetAssets.cream_shorthair,
  },
  {
    key: "golden_retriever",
    species: "dog",
    name: "小金",
    title: "金毛云狗",
    description: "热情、明亮，看到你们回来就会兴奋迎接。",
    trait: "陪玩型狗狗",
    image: creationPetAssets.golden_retriever,
  },
  {
    key: "corgi",
    species: "dog",
    name: "柚柚",
    title: "柯基云狗",
    description: "短腿、爱笑，最喜欢把小屋踩得热热闹闹。",
    trait: "活力型狗狗",
    image: creationPetAssets.corgi,
  },
];

const creationPuzzles: CreationPuzzle[] = [
  {
    id: "shadow-window",
    type: "解谜",
    question: "小屋窗边有三样东西：影子、花香、铃声。哪一样最容易被太阳带走？",
    options: ["影子", "花香", "铃声"],
    answer: "影子",
    hint: "太阳变换角度时，它最先移动。",
  },
  {
    id: "brain-door",
    type: "脑筋急转弯",
    question: "什么门永远关不上，却总能让两个人走近一点？",
    options: ["心门", "房门", "车门"],
    answer: "心门",
    hint: "它不在小屋墙上。",
  },
  {
    id: "pet-bowl",
    type: "解谜",
    question: "云宠饭碗里有 2 份粮，又买了 1 份，喂掉 1 份，还剩几份？",
    options: ["1 份", "2 份", "3 份"],
    answer: "2 份",
    hint: "先加，再减。",
  },
];

function isQuickInteractionMessage(message: Message) {
  return quickInteractionMessagePattern.test(message.body.trim());
}

function isQuickInteractionNotification(notification: Notification) {
  return notification.type === "message" && notification.title === quickInteractionNotificationTitle;
}

function isTodayTimestamp(value: string) {
  return value.slice(0, 10) === todayIsoDate();
}

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

export function HomeScreenShell() {
  return (
    <View style={styles.stack}>
      <Card soft style={styles.heroCard}>
        <View style={styles.shellAvatarRow}>
          <View style={styles.shellAvatar} />
          <View style={[styles.shellAvatar, styles.shellAvatarSecond]} />
        </View>
        <View style={styles.shellHeroTitle} />
        <View style={styles.shellHeroNumber} />
        <View style={styles.shellHeroDate} />
      </Card>

      <Card style={styles.moodStatusCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.shellSectionTitle} />
          <View style={styles.shellPill} />
        </View>
        <View style={styles.statusGrid}>
          <ShellStatusPill />
          <ShellStatusPill />
        </View>
        <View style={styles.interactionGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <View key={index} style={styles.shellInteractionButton}>
              <View style={styles.shellInteractionIcon} />
              <View style={styles.shellInteractionText} />
            </View>
          ))}
        </View>
      </Card>

      <Card style={styles.photoAlbumCard}>
        <View style={styles.photoAlbumHeader}>
          <View style={styles.photoAlbumTitleGroup}>
            <View style={styles.shellSectionTitle} />
            <View style={styles.shellSmallText} />
          </View>
          <View style={styles.shellRoundButton} />
        </View>
        <View style={styles.photoAlbumGrid}>
          {Array.from({ length: 9 }).map((_, index) => (
            <View key={index} style={[styles.photoAlbumThumb, styles.shellPhotoThumb]} />
          ))}
        </View>
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <View style={styles.shellSectionTitle} />
          <View style={styles.shellRoundButton} />
        </View>
        <View style={styles.shellMessageInput} />
        <View style={styles.shellPrimaryButton} />
      </Card>
    </View>
  );
}

function ShellStatusPill() {
  return (
    <View style={styles.statusPill}>
      <View style={styles.shellSmallText} />
      <View style={styles.shellStatusValue} />
    </View>
  );
}

export function HomeScreen() {
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const { data, loading, reload } = useCoupleData(user?.id);
  const [activeTab, setActiveTab] = useState<BottomTabKey>("home");
  const [subPage, setSubPage] = useState<SubPage>("main");
  const [endingCouple, setEndingCouple] = useState(false);
  const [interactionText, setInteractionText] = useState("");
  const [quickSending, setQuickSending] = useState(false);
  const [dismissedPopupIds, setDismissedPopupIds] = useState<string[]>([]);
  const [dismissedLetterPopupIds, setDismissedLetterPopupIds] = useState<string[]>([]);
  const [customQuickInteractions, setCustomQuickInteractions] = useState<QuickInteractionItem[]>([]);
  const [customQuickComposerOpen, setCustomQuickComposerOpen] = useState(false);
  const [customQuickDraft, setCustomQuickDraft] = useState("");
  const [customQuickLoadedCoupleId, setCustomQuickLoadedCoupleId] = useState<string | null>(null);
  const [activePhotoPreview, setActivePhotoPreview] = useState<PhotoPreviewState | null>(null);
  const [localTodayInteractionCount, setLocalTodayInteractionCount] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }

    if (!data.couple?.id) {
      setCustomQuickInteractions([]);
      setCustomQuickComposerOpen(false);
      setCustomQuickDraft("");
      setCustomQuickLoadedCoupleId(null);
      setLocalTodayInteractionCount(0);
      return;
    }

    const rawItems = window.localStorage.getItem(`quick-interactions:${data.couple.id}`);
    const rawCount = window.localStorage.getItem(`quick-interactions-count:${data.couple.id}:${todayIsoDate()}`);
    let nextItems: QuickInteractionItem[] = [];
    if (rawItems) {
      try {
        const parsed = JSON.parse(rawItems) as Array<{ id: string; label: string; tone: string }>;
        nextItems = parsed.slice(0, maxCustomQuickInteractions).map((item) => ({
          ...item,
          icon: quickInteractionIcons.custom,
        }));
      } catch {
        nextItems = [];
      }
    }
    setCustomQuickInteractions(nextItems);
    setCustomQuickComposerOpen(false);
    setCustomQuickDraft("");
    setCustomQuickLoadedCoupleId(data.couple.id);
    setLocalTodayInteractionCount(rawCount ? Number(rawCount) || 0 : 0);
  }, [data.couple?.id]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !data.couple?.id || customQuickLoadedCoupleId !== data.couple.id) {
      return;
    }
    const serializable = customQuickInteractions.map(({ id, label, tone }) => ({ id, label, tone }));
    window.localStorage.setItem(`quick-interactions:${data.couple.id}`, JSON.stringify(serializable));
  }, [customQuickInteractions, customQuickLoadedCoupleId, data.couple?.id]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !data.couple?.id) {
      return;
    }
    window.localStorage.setItem(`quick-interactions-count:${data.couple.id}:${todayIsoDate()}`, String(localTodayInteractionCount));
  }, [localTodayInteractionCount, data.couple?.id]);

  useEffect(() => {
    if (activePhotoPreview && !data.mediaFiles.some((file) => file.id === activePhotoPreview.id)) {
      setActivePhotoPreview(null);
    }
  }, [activePhotoPreview, data.mediaFiles]);

  const hasUsableContent = Boolean(data.profile);

  if (loading && !hasUsableContent) {
    return <HomeScreenShell />;
  }

  if (!data.profile) {
    return (
      <PageContainer>
        <ProfileScreen onSaved={reload} />
      </PageContainer>
    );
  }

  if (!data.couple) {
    return (
      <PageContainer>
        <PairingScreen pendingInvites={data.pendingInvites} onChanged={reload} />
      </PageContainer>
    );
  }

  const partner = data.couple.couple_members.find((member) => member.user_id !== user?.id);
  const myDisplayName = data.profile.display_name?.trim() || "我";
  const partnerDisplayName = partner?.profile?.display_name?.trim() || "TA";
  const me = {
    name: myDisplayName,
    initial: myDisplayName.slice(0, 1),
    avatarUrl: data.profile.avatar_signed_url,
  };
  const partnerProfile = {
    name: partnerDisplayName,
    initial: partnerDisplayName.slice(0, 1),
    avatarUrl: partner?.profile?.avatar_signed_url,
  };
  const coupleId = data.couple.id;
  const loveDays = daysBetween(data.couple.started_at);
  const visibleMessages = data.messages.filter((message) => !isQuickInteractionMessage(message));
  const quickInteractionItems = [...quickInteractionPresetItems, ...customQuickInteractions, quickInteractionAddItem].slice(0, maxQuickInteractionCards);
  const todayInteractionCount =
    data.notifications.filter((notification) => isQuickInteractionNotification(notification) && isTodayTimestamp(notification.created_at)).length + localTodayInteractionCount;
  const pendingMoodPopup =
    subPage === "main" && activeTab === "home"
      ? data.notifications.find(
          (notification) =>
            !notification.read_at &&
            isQuickInteractionNotification(notification) &&
            !dismissedPopupIds.includes(notification.id)
        )
      : undefined;
  const pendingLetterPopup =
    subPage === "main" && activeTab === "home" && !pendingMoodPopup
      ? data.notifications.find(
          (notification) =>
            !notification.read_at &&
            notification.type === "letter" &&
            !dismissedLetterPopupIds.includes(notification.id)
        )
      : undefined;

  async function endCouple() {
    if (Platform.OS !== "web") {
      Alert.alert("解除当前关系", "解绑后双方不能继续写入当前情侣空间。确定解绑吗？", [
        { text: "取消", style: "cancel" },
        { text: "解除", style: "destructive", onPress: () => void submitEndCouple() },
      ]);
      return;
    }

    if (window.confirm("解绑后双方不能继续写入当前情侣空间。确定解绑吗？")) {
      await submitEndCouple();
    }
  }

  async function submitEndCouple() {
    setEndingCouple(true);
    const { error } = await supabase.rpc("end_active_couple", {});
    setEndingCouple(false);
    if (error) {
      showToast({ title: "解绑失败", message: error.message, tone: "error" });
      return;
    }
    showToast({ title: "已解除关系", message: "双方不能继续写入原情侣空间。", tone: "success" });
    reload();
  }

  function goTab(tab: BottomTabKey) {
    setSubPage("main");
    setActiveTab(tab);
  }

  async function closeMoodPopup(notification: Notification) {
    setDismissedPopupIds((ids) => (ids.includes(notification.id) ? ids : [...ids, notification.id]));
    const { error } = await supabase.rpc("mark_notification_read", { notification_id: notification.id });
    if (error) {
      showToast({ title: "提醒状态同步失败", message: error.message, tone: "error" });
      return;
    }
    reload();
  }

  async function openLetterPopup(notification: Notification) {
    setDismissedLetterPopupIds((ids) => (ids.includes(notification.id) ? ids : [...ids, notification.id]));
    const { error } = await supabase.rpc("mark_notification_read", { notification_id: notification.id });
    if (error) {
      showToast({ title: "提醒状态同步失败", message: error.message, tone: "error" });
    }
    setSubPage("letterInbox");
    setActiveTab("home");
    reload();
  }

  async function closeLetterPopup(notification: Notification) {
    setDismissedLetterPopupIds((ids) => (ids.includes(notification.id) ? ids : [...ids, notification.id]));
    const { error } = await supabase.rpc("mark_notification_read", { notification_id: notification.id });
    if (error) {
      showToast({ title: "提醒状态同步失败", message: error.message, tone: "error" });
      return;
    }
    reload();
  }

  function addCustomQuickInteraction() {
    if (quickInteractionItems.length >= maxQuickInteractionCards) {
      showToast({ title: "快捷互动已满", message: `最多保留 ${maxQuickInteractionCards} 个。`, tone: "info" });
      return;
    }
    if (Platform.OS === "web" && typeof window !== "undefined") {
      setCustomQuickDraft("");
      setCustomQuickComposerOpen(true);
      return;
    }
    showToast({ title: "当前端暂不支持", message: "自定义快捷互动先在 Web MVP 中开放。", tone: "info" });
  }

  function saveCustomQuickInteraction() {
    const trimmed = customQuickDraft.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      showToast({ title: "先写一句互动", message: "比如“晚安抱抱”或“想喝奶茶”。", tone: "info" });
      return;
    }
    if (quickInteractionItems.length >= maxQuickInteractionCards) {
      showToast({ title: "快捷互动已满", message: `最多保留 ${maxQuickInteractionCards} 个。`, tone: "info" });
      return;
    }

    setCustomQuickInteractions((items) => {
      if (items.length >= maxCustomQuickInteractions) {
        return items;
      }
      return [
        ...items,
        {
          id: `custom-${Date.now()}`,
          label: trimmed.slice(0, 8),
          tone: customQuickTone(items.length),
          icon: quickInteractionIcons.custom,
        },
      ];
    });
    setCustomQuickComposerOpen(false);
    setCustomQuickDraft("");
    showToast({ title: "已添加互动", message: "新的快捷互动已经放进此刻同频。", tone: "success" });
  }

  async function uploadPhoto(options: PhotoUploadOptions = {}) {
    if (!user) {
      return;
    }
    if (Platform.OS !== "web") {
      showToast({ title: "当前端暂不支持", message: "相册上传先在 Web MVP 中开放。", tone: "info" });
      return;
    }
    const currentCount = options.currentCount ?? data.mediaFiles.length;
    const maxFiles = options.maxFiles ?? 99;
    const remaining = Math.max(0, maxFiles - currentCount);
    if (remaining <= 0) {
      showToast({ title: "图片已满", message: `最多上传 ${maxFiles} 张。`, tone: "info" });
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.multiple = remaining > 1;
    input.onchange = async () => {
      const selectedFiles = Array.from(input.files ?? []).slice(0, remaining);
      if (!selectedFiles.length) {
        return;
      }
      let uploadedCount = 0;
      for (const file of selectedFiles) {
        if (!isSupportedImage(file, 8 * 1024 * 1024)) {
          showToast({ title: "图片格式不支持", message: "请上传 8MB 以内的 JPG、PNG、WebP 或 GIF 图片。", tone: "error" });
          continue;
        }
        const path = buildStoragePath([coupleId, user.id], file.type);
        const { error: uploadError } = await uploadImage(storageBuckets.coupleMedia, path, file);
        if (uploadError) {
          showToast({ title: "上传失败", message: uploadError.message, tone: "error" });
          continue;
        }
        const { error: insertError } = await supabase.from("media_files").insert({
          couple_id: coupleId,
          uploader_id: user.id,
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          caption: options.caption || file.name.replace(/\.[^.]+$/, ""),
        });
        if (insertError) {
          showToast({ title: "相册保存失败", message: insertError.message, tone: "error" });
          continue;
        }
        uploadedCount += 1;
      }
      if (uploadedCount > 0) {
        showToast({
          title: options.successTitle ?? `已上传 ${uploadedCount} 张照片`,
          message: "它会和日常胶囊一起沉淀在时间线里。",
          tone: "success",
        });
        reload();
      }
    };
    input.click();
  }

  async function deletePhoto(file: MediaFile) {
    const confirmed =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.confirm(`确定删除这张照片吗？\n\n${file.caption || "相册里的瞬间"}`)
        : true;
    if (!confirmed) {
      return;
    }

    const { error } = await supabase.from("media_files").update({ deleted_at: new Date().toISOString() }).eq("id", file.id);
    if (error) {
      showToast({ title: "删除失败", message: error.message, tone: "error" });
      return;
    }

    const { error: storageError } = await supabase.storage.from(storageBuckets.coupleMedia).remove([file.storage_path]);
    if (storageError) {
      showToast({ title: "照片已移除", message: "数据库记录已删，但云端文件清理未完全成功。", tone: "info" });
    } else {
      showToast({ title: "照片已删除", tone: "success" });
    }

    setActivePhotoPreview((current) => {
      if (!current || current.id !== file.id) {
        return current;
      }
      const remaining = data.mediaFiles.filter((item) => item.id !== file.id);
      return remaining[0] ? { id: remaining[0].id, index: 0 } : null;
    });
    reload();
  }

  let content = null;
  if (subPage === "messages") {
    content = <MessagesPage coupleId={coupleId} messages={visibleMessages} onChanged={reload} onBack={() => setSubPage("main")} />;
  } else if (subPage === "addEvent") {
    content = <AddEventPage coupleId={coupleId} onSaved={reload} onBack={() => setSubPage("main")} />;
  } else if (subPage === "writeLetter") {
    content = <WriteLetterPage coupleId={coupleId} partner={partnerProfile} onSaved={reload} onBack={() => setSubPage("main")} />;
  } else if (subPage === "letterInbox") {
    content = <LetterInboxPage letters={data.letters} me={me} partner={partnerProfile} onBack={() => setSubPage("main")} onReply={() => setSubPage("writeLetter")} onChanged={reload} />;
  } else if (subPage === "creation") {
    content = (
      <CreationSpacePage
        coupleId={coupleId}
        me={me}
        partner={partnerProfile}
        creationSpace={data.creationSpace}
        creationActions={data.creationActions}
        footprints={data.footprints}
        onBack={() => setSubPage("main")}
        onChanged={reload}
      />
    );
  } else if (subPage !== "main") {
    content = (
      <SettingsDetailPage
        page={subPage}
        me={me}
        partner={partnerProfile}
        loveDays={loveDays}
        startedAt={data.couple.started_at}
        onBack={() => setSubPage("main")}
        onSignOut={signOut}
        onEndCouple={endCouple}
        endingCouple={endingCouple}
        coupleId={coupleId}
        partnerId={partner?.user_id}
        notifications={data.notifications}
        onChanged={reload}
        onOpenLetters={() => setSubPage("letterInbox")}
      />
    );
  } else if (activeTab === "home") {
    content = (
      <CoupleHomePage
        me={me}
        partner={partnerProfile}
        startedAt={data.couple.started_at}
        loveDays={loveDays}
        coupleId={coupleId}
        checkins={data.checkins}
        messages={visibleMessages}
        currentUserId={user?.id ?? ""}
        quickInteractions={quickInteractionItems}
        todayInteractionCount={todayInteractionCount}
        onAddCustomQuickInteraction={addCustomQuickInteraction}
        customQuickComposerOpen={customQuickComposerOpen}
        customQuickDraft={customQuickDraft}
        onChangeCustomQuickDraft={setCustomQuickDraft}
        onSaveCustomQuickInteraction={saveCustomQuickInteraction}
        onCancelCustomQuickInteraction={() => {
          setCustomQuickComposerOpen(false);
          setCustomQuickDraft("");
        }}
        onCreateCapsule={() => {
          setSubPage("main");
          setActiveTab("checkins");
        }}
        onWriteLetter={() => setSubPage("writeLetter")}
        onUploadPhoto={(options) => uploadPhoto({ maxFiles: maxMemoryPhotos, currentCount: data.mediaFiles.length, ...options })}
        onPreviewPhoto={(file, index) => setActivePhotoPreview({ id: file.id, index: index ?? 0 })}
        onDeletePhoto={deletePhoto}
        onChanged={reload}
        onQuickInteraction={async (label) => {
          if (!user || quickSending) {
            return false;
          }

          const partnerId = partner?.user_id;
          if (!partnerId) {
            showToast({ title: "投递失败", message: "还没有找到对方账号，请刷新后再试。", tone: "error" });
            return false;
          }

          setQuickSending(true);
          const { data: notification, error: notificationError } = await supabase
            .rpc("send_quick_interaction", {
              target_couple_id: coupleId,
              interaction_label: label,
            })
            .maybeSingle();
          setQuickSending(false);

          if (notificationError || !notification?.notification_id) {
            showToast({ title: "投递失败", message: notificationError?.message ?? "对方提醒没有创建。", tone: "error" });
            reload();
            return false;
          }
          setDismissedPopupIds((ids) => (ids.includes(notification.notification_id) ? ids : [...ids, notification.notification_id]));
          setLocalTodayInteractionCount((count) => count + 1);
          setInteractionText(`“${label}”已经投递给对方。`);
          showToast({ title: `已投递 ${label}`, message: "对方会在首页收到一个小提醒。", tone: "success" });
          setTimeout(() => setInteractionText(""), 1600);
          reload();
          return true;
        }}
        interactionText={interactionText}
        quickSending={quickSending}
        events={data.events}
        mediaFiles={data.mediaFiles}
        moodStatuses={data.moodStatuses}
        letters={data.letters}
      />
    );
  } else if (activeTab === "checkins") {
    content = <TodayStoryPage coupleId={coupleId} checkins={data.checkins} onChanged={reload} />;
  } else if (activeTab === "calendar") {
    content = (
      <CalendarPage
        checkins={data.checkins}
        messages={visibleMessages}
        events={data.events}
        mediaFiles={data.mediaFiles}
        letters={data.letters}
        footprints={data.footprints}
        currentUserId={user?.id ?? ""}
        onAddEvent={() => setSubPage("addEvent")}
        onOpenLetter={() => setSubPage("letterInbox")}
        onChanged={reload}
        onUploadMemoryPhoto={(memory, currentCount) => uploadPhoto({ caption: memory.title, currentCount, maxFiles: maxMemoryPhotos, successTitle: "图片已加入这段记忆" })}
        onCreateCapsule={() => {
          setSubPage("main");
          setActiveTab("checkins");
        }}
      />
    );
  } else {
    content = (
      <MePage
        me={me}
        partner={partnerProfile}
        loveDays={loveDays}
        onSignOut={signOut}
        onEndCouple={endCouple}
        endingCouple={endingCouple}
        coupleId={coupleId}
        notifications={data.notifications}
        onChanged={reload}
        onOpenSetting={setSubPage}
      />
    );
  }

  return (
    <PageContainer>
      {content}
      {subPage === "main" ? <BottomTabBar activeTab={activeTab} onChange={goTab} /> : null}
      {pendingMoodPopup ? (
        <MoodNotificationPopup
          notification={pendingMoodPopup}
          partnerName={partnerProfile.name}
          onClose={() => void closeMoodPopup(pendingMoodPopup)}
        />
      ) : null}
      {pendingLetterPopup ? (
        <LetterArrivalPopup
          notification={pendingLetterPopup}
          partnerName={partnerProfile.name}
          onOpen={() => void openLetterPopup(pendingLetterPopup)}
          onClose={() => void closeLetterPopup(pendingLetterPopup)}
        />
      ) : null}
      {subPage === "main" && activeTab === "home" ? <FloatingCreationEntry onOpen={() => setSubPage("creation")} /> : null}
      {activePhotoPreview ? (
        <PhotoPreviewPopup
          files={data.mediaFiles}
          activeId={activePhotoPreview.id}
          activeIndex={activePhotoPreview.index}
          onClose={() => setActivePhotoPreview(null)}
          onDelete={deletePhoto}
          onSelect={(file, index) => setActivePhotoPreview({ id: file.id, index })}
        />
      ) : null}
    </PageContainer>
  );
}

function FloatingCreationEntry({ onOpen }: { onOpen: () => void }) {
  const button = (
    <View pointerEvents="box-none" style={styles.creationFloatingDock}>
      <FloatingEntryButton label="共创" accessibilityLabel="打开共创空间" onPress={onOpen} icon={<Sparkles size={18} color={colors.accentDark} />} />
    </View>
  );

  if (Platform.OS === "web" && typeof document !== "undefined") {
    return createPortal(button, document.body) as ReactNode;
  }

  return button;
}

function CoupleHomePage({
  me,
  partner,
  startedAt,
  loveDays,
  coupleId,
  checkins,
  messages,
  currentUserId,
  quickInteractions,
  todayInteractionCount,
  onAddCustomQuickInteraction,
  customQuickComposerOpen,
  customQuickDraft,
  onChangeCustomQuickDraft,
  onSaveCustomQuickInteraction,
  onCancelCustomQuickInteraction,
  onQuickInteraction,
  onCreateCapsule,
  onWriteLetter,
  onUploadPhoto,
  onPreviewPhoto,
  onDeletePhoto,
  onChanged,
  interactionText,
  quickSending,
  events,
  mediaFiles,
  moodStatuses,
  letters,
}: {
  me: { name: string; initial: string; avatarUrl?: string | null };
  partner: { name: string; initial: string; avatarUrl?: string | null };
  startedAt: string;
  loveDays: number;
  coupleId: string;
  checkins: Checkin[];
  messages: Message[];
  currentUserId: string;
  quickInteractions: QuickInteractionItem[];
  todayInteractionCount: number;
  onAddCustomQuickInteraction: () => void;
  customQuickComposerOpen: boolean;
  customQuickDraft: string;
  onChangeCustomQuickDraft: (value: string) => void;
  onSaveCustomQuickInteraction: () => void;
  onCancelCustomQuickInteraction: () => void;
  onQuickInteraction: (label: string) => Promise<boolean> | boolean;
  onCreateCapsule: () => void;
  onWriteLetter: () => void;
  onUploadPhoto: (options?: PhotoUploadOptions) => void;
  onPreviewPhoto: (file: MediaFile, index?: number) => void;
  onDeletePhoto: (file: MediaFile) => void;
  onChanged: () => void;
  interactionText: string;
  quickSending: boolean;
  events: CalendarEvent[];
  mediaFiles: MediaFile[];
  moodStatuses: MoodStatus[];
  letters: LetterPreview[];
}) {
  const [reaction, setReaction] = useState<{ id: number; label: string; icon: string; image?: ImageSourcePropType } | null>(null);
  const today = todayIsoDate();
  const todayStories = checkins.filter((item) => item.checkin_date === today);
  const latestStory = todayStories[0] ? splitStory(todayStories[0].content) : null;
  const todayCapsuleStatus = latestStory ? latestStory.mood || "已存下" : "还空着";
  const latestMessage = messages[0]?.body || "";
  const myMood = moodStatuses.find((item) => item.user_id === currentUserId);
  const partnerMood = moodStatuses.find((item) => item.user_id !== currentUserId);

  async function sendQuickInteraction(label: string, icon: string, image?: ImageSourcePropType) {
    setReaction({ id: Date.now(), label, icon, image });
    const delivered = await onQuickInteraction(label);
    if (!delivered) {
      setReaction(null);
    }
  }

  return (
    <View style={styles.stack}>
      <Card soft style={styles.heroCard}>
        <CoupleAvatarGroup me={me} partner={partner} size={52} />
        <Text style={styles.heroRelationText}>我们已经在一起</Text>
        <View style={styles.loveNumberRow}>
          <Text style={styles.loveNumber}>{loveDays}</Text>
          <Text style={styles.loveUnit}>天</Text>
        </View>
        <Text style={styles.startedText}>开始于 {formatShortDate(startedAt)}</Text>
        <LoveLetterEntryCard partnerName={partner.name} onPress={onWriteLetter} />
      </Card>

      <Card style={styles.moodStatusCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>此刻同频</Text>
          <View style={styles.interactionCountPill}>
            <Heart color={colors.accentDark} size={13} fill={todayInteractionCount ? colors.accentDark : "transparent"} />
            <Text style={styles.interactionCountText}>今日 {todayInteractionCount} 次</Text>
          </View>
        </View>
        <View style={styles.statusGrid}>
          <StatusPill label="我的心情" value={myMood?.mood || todayCapsuleStatus} />
          <StatusPill label="TA 的心情" value={partnerMood?.mood || "等一封回应"} />
        </View>
        <View style={styles.interactionGrid}>
          {quickInteractions.map((item) => (
            <InteractionButton
              key={item.id}
              label={item.label}
              color={item.tone}
              icon={item.icon ?? interactionIconFor(item.id)}
              onPress={
                item.id === "message"
                  ? onAddCustomQuickInteraction
                  : quickSending
                    ? undefined
                    : () => void sendQuickInteraction(item.label, floatingIconForInteraction(item.id), item.icon ?? interactionIconFor(item.id))
              }
            />
          ))}
        </View>
        {customQuickComposerOpen ? (
          <View style={styles.customQuickComposer}>
            <AppTextInput
              value={customQuickDraft}
              onChangeText={onChangeCustomQuickDraft}
              placeholder="写一个快捷互动"
              maxLength={8}
              style={styles.customQuickInput}
            />
            <View style={styles.customQuickActions}>
              <SecondaryButton label="取消" onPress={onCancelCustomQuickInteraction} />
              <PrimaryButton label="保存" onPress={onSaveCustomQuickInteraction} disabled={!customQuickDraft.trim()} />
            </View>
          </View>
        ) : null}
        {reaction ? <FloatingReaction key={reaction.id} icon={reaction.icon} label={reaction.label} image={reaction.image} /> : null}
        {interactionText ? <InlineNotice tone="success">{interactionText}</InlineNotice> : null}
      </Card>

      <HomeMessageBoard
        coupleId={coupleId}
        messages={messages}
        currentUserId={currentUserId}
        latestMessage={latestMessage}
        onChanged={onChanged}
      />

      <PhotoAlbumCard mediaFiles={mediaFiles} onUploadPhoto={onUploadPhoto} onPreviewPhoto={onPreviewPhoto} onDeletePhoto={onDeletePhoto} />
    </View>
  );
}

function LoveLetterEntryCard({ partnerName, onPress }: { partnerName: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`给 ${partnerName} 写一封情书`} onPress={onPress} style={({ pressed }) => [styles.loveLetterEntryCard, pressed ? styles.loveLetterEntryCardPressed : null, Platform.OS === "web" ? glassDockStyle : null]}>
      <View style={styles.loveLetterEntryIcon}>
        <Mail color={colors.accentDark} size={24} strokeWidth={2.35} />
        <View style={styles.loveLetterEntryHeart}>
          <Heart color="#fff" size={11} fill="#fff" strokeWidth={2.5} />
        </View>
      </View>
      <View style={styles.loveLetterEntryCopy}>
        <Text style={styles.loveLetterEntryTitle}>给 {partnerName} 写一封情书</Text>
      </View>
      <View style={styles.loveLetterEntryAction}>
        <Text style={styles.loveLetterEntryActionText}>打开信纸</Text>
      </View>
    </Pressable>
  );
}

function MoodNotificationPopup({
  notification,
  partnerName,
  onClose,
}: {
  notification: Notification;
  partnerName: string;
  onClose: () => void;
}) {
  const mood = notification.body || "一点心情";
  const moodIcon = interactionIconForLabel(mood) || storyIconImageFromText(mood);

  return (
    <View pointerEvents="box-none" style={styles.moodPopupLayer}>
      <View style={styles.moodPopupCard}>
        <View style={styles.moodPopupIconWrap}>
          <Image source={moodIcon} style={styles.moodPopupIcon} resizeMode="contain" />
        </View>
        <View style={styles.moodPopupCopy}>
          <Text style={styles.moodPopupEyebrow}>{partnerName} 投递了一点心情</Text>
          <Text style={styles.moodPopupTitle}>{mood}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.moodPopupPrimaryButtonWide}>
          <Text style={styles.moodPopupPrimaryText}>知道了</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LetterArrivalPopup({
  notification,
  partnerName,
  onOpen,
  onClose,
}: {
  notification: Notification;
  partnerName: string;
  onOpen: () => void;
  onClose: () => void;
}) {
  const popup = (
    <View pointerEvents="box-none" style={styles.letterPopupLayer}>
      <View style={styles.letterPopupCard}>
        <View pointerEvents="none" style={styles.letterPopupHalo} />
        <View pointerEvents="none" style={styles.letterPopupSparkOne} />
        <View pointerEvents="none" style={styles.letterPopupSparkTwo} />
        <View style={styles.letterPopupStamp}>
          <Heart color="#fff" size={15} fill="#fff" strokeWidth={2.4} />
        </View>
        <View style={styles.letterPopupEnvelope}>
          <View style={styles.letterPopupFlap} />
          <View style={styles.letterPopupPaper}>
            <Text style={styles.letterPopupPaperText}>For you</Text>
          </View>
          <Mail color={colors.accentDark} size={36} strokeWidth={2.25} />
        </View>
        <Text style={styles.letterPopupEyebrow}>{partnerName} 给你寄来一封信</Text>
        <Text style={styles.letterPopupTitle}>{notification.title || "你收到了一封信"}</Text>
        <Text style={styles.letterPopupBody}>{notification.body || "有一句认真写下的话，正在等你打开。"}</Text>
        <View style={styles.letterPopupActions}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.letterPopupSecondary}>
            <Text style={styles.letterPopupSecondaryText}>稍后再看</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onOpen} style={styles.letterPopupPrimary}>
            <Text style={styles.letterPopupPrimaryText}>打开来信</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  if (Platform.OS === "web" && typeof document !== "undefined") {
    return createPortal(popup, document.body);
  }

  return popup;
}

function TodayStoryPage({
  coupleId,
  checkins,
  onChanged,
}: {
  coupleId: string;
  checkins: Array<{ id: string; user_id: string; checkin_date: string; content: string | null }>;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [mood, setMood] = useState(mockMoods[0]);
  const [customMood, setCustomMood] = useState("");
  const [content, setContent] = useState("");
  const [noteFocused, setNoteFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveBurst, setSaveBurst] = useState(0);
  const saveCardScale = useRef(new Animated.Value(1)).current;
  const washOpacity = useRef(new Animated.Value(0.72)).current;
  const washBreath = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(washOpacity, { toValue: 0.88, duration: 2500, useNativeDriver: false }),
        Animated.timing(washOpacity, { toValue: 0.72, duration: 2500, useNativeDriver: false }),
      ])
    ).start();
  }, [washOpacity]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(washBreath, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(washBreath, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ])
    ).start();
  }, [washBreath]);

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
  const todayStories = checkins.filter((item) => item.checkin_date === today);
  const mineToday = todayStories.find((item) => item.user_id === user?.id);
  const partnerToday = todayStories.find((item) => item.user_id !== user?.id);
  const trimmedContent = content.trim();
  const activeMood = customMood.trim() || mood;
  const capsuleComplete = Boolean(trimmedContent);
  const selectedStoryImage = storyIconImageFromText(trimmedContent);
  const selectedMoodTone = emotionCandyTone(activeMood);
  const washScale = washBreath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  async function save() {
    if (!user || busy) {
      return;
    }

    Keyboard.dismiss();
    setNoteFocused(false);
    setBusy(true);
    try {
      const text = trimmedContent ? `${activeMood}｜${trimmedContent}` : activeMood;
      const result = mineToday
        ? await supabase.from("checkins").update({ content: text, updated_at: new Date().toISOString() }).eq("id", mineToday.id)
        : await supabase.from("checkins").insert({ couple_id: coupleId, user_id: user.id, checkin_date: today, content: text });

      if (result.error) {
        showToast({ title: "保存失败", message: result.error.message, tone: "error" });
        return;
      }

      const { error: moodError } = await supabase.from("mood_status").upsert({
        couple_id: coupleId,
        user_id: user.id,
        mood: activeMood,
        note: trimmedContent || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "couple_id,user_id" });
      if (moodError) {
        console.warn("Today capsule mood sync failed:", moodError.message);
      }

      const { data: members, error: membersError } = await supabase.from("couple_members").select("user_id").eq("couple_id", coupleId).is("left_at", null);
      if (membersError) {
        console.warn("Today capsule member lookup failed:", membersError.message);
      }
      const partnerMember = members?.find((member) => member.user_id !== user.id);
      if (partnerMember) {
        const { error: notificationError } = await supabase.from("notifications").insert({
          couple_id: coupleId,
          user_id: partnerMember.user_id,
          actor_id: user.id,
          type: "checkin",
          title: "TA 存下了一颗今日胶囊",
          body: trimmedContent || `投递了「${activeMood}」心情`,
          related_table: "checkins",
        });
        if (notificationError) {
          console.warn("Today capsule notification sync failed:", notificationError.message);
        }
      }

      setSaveBurst((count) => count + 1);
      Animated.sequence([
        Animated.spring(saveCardScale, { toValue: 0.965, friction: 7, tension: 210, useNativeDriver: false }),
        Animated.spring(saveCardScale, { toValue: 1, friction: 5, tension: 170, useNativeDriver: false }),
      ]).start();
      setContent("");
      showToast({ title: mineToday ? "今天的胶囊已更新" : "今天的胶囊已存好", message: "这句话已经放进你们的记忆里。", tone: "success" });
      onChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : "请稍后重试。";
      showToast({ title: "保存失败", message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.stack}>
      <Card soft style={styles.capsulePreviewCard}>
        <View style={[styles.capsulePreviewGlow, { backgroundColor: selectedMoodTone.glow }]} />
        <Animated.View style={[styles.capsulePreviewMoodWash, { backgroundColor: selectedMoodTone.wash, opacity: washOpacity, transform: [{ scale: washScale }] }]} />
        <Animated.View style={{ transform: [{ translateX: shakeAnim }, { rotate: shakeAnim.interpolate({ inputRange: [-2, 2], outputRange: ["-3deg", "3deg"] }) }] }}>
          <CapsuleMark
            size={64}
            complete={capsuleComplete}
            icon={<Image source={selectedStoryImage} style={styles.capsulePreviewImage} resizeMode="contain" />}
          />
        </Animated.View>
        <Text style={styles.capsulePreviewTitle}>{capsuleComplete ? "这颗胶囊准备好了" : "把今天慢慢装进去"}</Text>
        {capsuleComplete ? (
          <Text style={styles.capsulePreviewText}>这句话会被安静封存到今天。</Text>
        ) : null}
      </Card>
      <Animated.View style={{ transform: [{ scale: saveCardScale }] }}>
        <Card style={styles.createCapsuleCard}>
        <View style={styles.capsuleComposerHeader}>
          <Text style={styles.centerTitle}>今日胶囊</Text>
        </View>
        <View style={styles.moodOptionalBlock}>
          <Text style={styles.moodOptionalTitle}>今天的心情</Text>
          <EmotionCandySelector moods={mockMoods} value={mood} onChange={setMood} />
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
        <PrimaryButton label={busy ? "封存中" : mineToday ? "更新这颗胶囊" : "封存今天"} onPress={save} loading={busy} />
        </Card>
      </Animated.View>
      {saveBurst ? <CapsuleSaveFlight key={saveBurst} image={selectedStoryImage} /> : null}

      <TodayCapsuleSummaryCard
        latestStory={mineToday ? splitStory(mineToday.content) : partnerToday ? splitStory(partnerToday.content) : null}
        onCreateCapsule={() => setContent("")}
      >
        {todayStories.length === 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="创建第一颗今日胶囊" onPress={() => setContent("")} style={styles.emptyStatePressable}>
            <EmptyState title={mockEmptyCopy.stories.title} description="点一下这里，记录你今天想留下的话。" />
          </Pressable>
        ) : (
          <View style={styles.doubleCapsulesRow}>
            <View style={[styles.sideCapsuleContainer, { transform: [{ rotate: "-0.8deg" }] }]}>
              {mineToday ? (
                <CheckinCard author="我" mood={splitStory(mineToday.content).mood} body={splitStory(mineToday.content).body} date="今天" />
              ) : (
                <Pressable onPress={() => setContent("")} style={styles.sideCapsuleEmpty}>
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
                <CheckinCard author="TA" mood={splitStory(partnerToday.content).mood} body={splitStory(partnerToday.content).body} date="今天" />
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

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>历史胶囊</Text>
          <Text style={styles.linkText}>查看全部</Text>
        </View>
        {checkins.length === 0 ? (
          <EmptyState title="还没有历史胶囊" description="第一颗日常胶囊会从今天开始。" />
        ) : (
          checkins.slice(0, 4).map((item) => {
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
      <View pointerEvents="none" style={styles.foldedMoodNoteFold} />
      <View pointerEvents="none" style={styles.foldedMoodNoteFoldShadow} />
      {children}
    </View>
  );
}

function MessagesPage({
  coupleId,
  messages,
  onChanged,
  onBack,
}: {
  coupleId: string;
  messages: Message[];
  onChanged: () => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function send() {
    if (!user || !body.trim()) {
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("messages").insert({ couple_id: coupleId, sender_id: user.id, body: body.trim() });
    setBusy(false);
    if (error) {
      showToast({ title: "留言失败", message: error.message, tone: "error" });
      return;
    }
    const { data: members } = await supabase.from("couple_members").select("user_id").eq("couple_id", coupleId).is("left_at", null);
    const partnerMember = members?.find((member) => member.user_id !== user.id);
    if (partnerMember) {
      await supabase.from("notifications").insert({
        couple_id: coupleId,
        user_id: partnerMember.user_id,
        actor_id: user.id,
        type: "message",
        title: "你收到了一条留言",
        body: body.trim(),
        related_table: "messages",
      });
    }
    setBody("");
    showToast({ title: "留言已发送", tone: "success" });
    onChanged();
  }

  async function remove(message: Message) {
    setDeletingId(message.id);
    const { error } = await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", message.id);
    setDeletingId(null);
    if (error) {
      showToast({ title: "删除失败", message: error.message, tone: "error" });
      return;
    }
    showToast({ title: "留言已删除", tone: "success" });
    onChanged();
  }

  return (
    <View style={styles.stack}>
      <TopBar title="留言" subtitle="把聊天里容易被冲走的话，留在这里。" left={<BackButton onPress={onBack} />} />
      <Card>
        <AppTextInput value={body} onChangeText={setBody} placeholder="新增一条留言" multiline style={styles.messageInput} />
        <PrimaryButton label={busy ? "发送中" : "发送留言"} onPress={send} disabled={!body.trim()} loading={busy} />
      </Card>
      <Card>
        <Text style={styles.sectionTitle}>留言列表</Text>
        {messages.length === 0 ? (
          <EmptyState title={mockEmptyCopy.messages.title} description={mockEmptyCopy.messages.description} />
        ) : (
          messages.map((message) => (
            <MessageCard
              key={message.id}
              author={message.sender?.display_name || "匿名用户"}
              body={message.body}
              time={new Date(message.created_at).toLocaleString("zh-CN")}
              canDelete={message.sender_id === user?.id && deletingId !== message.id}
              onDelete={() => remove(message)}
            />
          ))
        )}
      </Card>
    </View>
  );
}

function HomeMessageBoard({
  coupleId,
  messages,
  currentUserId,
  latestMessage,
  onChanged,
}: {
  coupleId: string;
  messages: Message[];
  currentUserId: string;
  latestMessage: string;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function send() {
    if (!currentUserId || !body.trim()) {
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("messages").insert({ couple_id: coupleId, sender_id: currentUserId, body: body.trim() });
    setBusy(false);
    if (error) {
      showToast({ title: "留言失败", message: error.message, tone: "error" });
      return;
    }
    const { data: members } = await supabase.from("couple_members").select("user_id").eq("couple_id", coupleId).is("left_at", null);
    const partnerMember = members?.find((member) => member.user_id !== currentUserId);
    if (partnerMember) {
      await supabase.from("notifications").insert({
        couple_id: coupleId,
        user_id: partnerMember.user_id,
        actor_id: currentUserId,
        type: "message",
        title: "你收到了一条留言",
        body: body.trim(),
        related_table: "messages",
      });
    }
    setBody("");
    showToast({ title: "留言已发送", tone: "success" });
    onChanged();
  }

  async function remove(message: Message) {
    setDeletingId(message.id);
    const { error } = await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", message.id);
    setDeletingId(null);
    if (error) {
      showToast({ title: "删除失败", message: error.message, tone: "error" });
      return;
    }
    showToast({ title: "留言已删除", tone: "success" });
    onChanged();
  }

  return (
    <Card style={{ paddingVertical: 14, gap: 10 }}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>留言板</Text>
        <MessageCircle color={colors.accentDark} size={18} />
      </View>
      {messages.length === 0 ? <Text style={styles.bodyText}>{latestMessage}</Text> : null}
      <AppTextInput value={body} onChangeText={setBody} placeholder="写给对方的一句话" multiline style={styles.homeMessageInput} />
      <PrimaryButton label={busy ? "发送中" : "发送留言"} onPress={send} disabled={!body.trim()} loading={busy} icon={<Send color="#fff" size={16} />} />
      <View style={styles.homeMessageList}>
        {messages.slice(0, 4).map((message) => (
          <MessageCard
            key={message.id}
            author={message.sender?.display_name || "匿名用户"}
            body={message.body}
            time={new Date(message.created_at).toLocaleString("zh-CN")}
            canDelete={message.sender_id === currentUserId && deletingId !== message.id}
            onDelete={() => remove(message)}
          />
        ))}
      </View>
    </Card>
  );
}

function TodayCapsuleSummaryCard({
  latestStory,
  onCreateCapsule,
  children,
}: {
  latestStory: ReturnType<typeof splitStory> | null;
  onCreateCapsule: () => void;
  children?: ReactNode;
}) {
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="创建今日胶囊"
        onPress={latestStory ? undefined : onCreateCapsule}
        style={({ pressed }) => [
          styles.todayCapsuleBody,
          !latestStory ? styles.todayCapsuleBodyGuide : null,
          pressed && !latestStory ? styles.todayCapsuleBodyPressed : null,
        ]}
      >
        <View style={styles.moodOrb}>
          <CapsuleMark
            size={42}
            complete={Boolean(latestStory)}
            icon={
              latestStory ? (
                <Image source={latestStory.iconImage} style={styles.moodOrbImage} resizeMode="contain" />
              ) : (
                <Heart color={colors.accentDark} size={17} />
              )
            }
          />
        </View>
        <View style={styles.todayCapsuleCopy}>
          <Text style={styles.todayCapsuleLabel}>今日胶囊</Text>
          <Text style={styles.todayCapsuleText}>{latestStory?.body || "写一句想留下的话，放进今天的胶囊。"}</Text>
        </View>
        <View style={styles.capsuleStatusPill}>
          <Heart color={colors.accentDark} fill={latestStory ? colors.accentDark : "transparent"} size={15} />
          <Text style={styles.capsuleStatusText}>{latestStory ? "已存" : "待存"}</Text>
        </View>
      </Pressable>
      {children}
    </Card>
  );
}

function WriteLetterPage({
  coupleId,
  partner,
  onSaved,
  onBack,
}: {
  coupleId: string;
  partner: { name: string; initial: string; avatarUrl?: string | null };
  onSaved: () => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"now" | "later">("now");
  const [deliverDate, setDeliverDate] = useState(todayIsoDate());
  const [busy, setBusy] = useState(false);

  async function sendLetter() {
    if (!user || !body.trim()) {
      return;
    }
    setBusy(true);
    const { data: members } = await supabase.from("couple_members").select("user_id").eq("couple_id", coupleId).is("left_at", null);
    const recipient = members?.find((member) => member.user_id !== user.id);
    if (!recipient) {
      setBusy(false);
      showToast({ title: "发送失败", message: "没有找到当前关系里的收信人。", tone: "error" });
      return;
    }
    const dateInputValue =
      Platform.OS === "web" && typeof document !== "undefined"
        ? document.querySelector<HTMLInputElement>('input[aria-label="选择送达日期"]')?.value
        : undefined;
    const selectedDeliverDate = dateInputValue || deliverDate;
    const deliverAt = mode === "now" ? new Date().toISOString() : new Date(`${selectedDeliverDate}T08:00:00`).toISOString();
    const letterId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const { error } = await supabase
      .from("future_letters")
      .insert({
        id: letterId,
        couple_id: coupleId,
        author_id: user.id,
        recipient_id: recipient.user_id,
        title: title.trim() || "一封写给你的信",
        body: body.trim(),
        unlock_at: deliverAt,
      });
    if (error) {
      setBusy(false);
      showToast({ title: "发送失败", message: error.message, tone: "error" });
      return;
    }
    await supabase.from("notifications").insert({
      couple_id: coupleId,
      user_id: recipient.user_id,
      actor_id: user.id,
      type: "letter",
      title: mode === "now" ? "你收到了一封信" : "一封信已经寄到未来",
      body: mode === "now" ? "现在就可以打开。" : `等到 ${selectedDeliverDate} 再打开。`,
      related_table: "future_letters",
      related_id: letterId,
    });
    setBusy(false);
    showToast({ title: mode === "now" ? "信已送达" : "信已寄出", message: "TA 会在来信提醒和记忆里看到它。", tone: "success" });
    onSaved();
    onBack();
  }

  return (
    <View style={styles.stack}>
      <TopBar title="写一封信" subtitle={`写给 ${partner.name}，可以现在送达，也可以寄到未来。`} left={<BackButton onPress={onBack} />} />
      <Card soft style={styles.letterComposeHero}>
        <CoupleAvatarGroup me={{ name: "我", initial: "我" }} partner={partner} size={54} />
        <View style={styles.letterEnvelopePreview}>
          <Mail color={colors.accentDark} size={32} strokeWidth={2.4} />
        </View>
      </Card>
      <Card>
        <AppTextInput value={title} onChangeText={setTitle} placeholder="信的标题（可选）" />
        <AppTextInput value={body} onChangeText={setBody} placeholder="写下想让 TA 收到的话" multiline style={styles.letterInput} />
        <View style={styles.modeRow}>
          <SecondaryButton label="立即送达" active={mode === "now"} onPress={() => setMode("now")} icon={<Send color={mode === "now" ? "#fff" : colors.accentDark} size={16} />} />
          <SecondaryButton label="寄到未来" active={mode === "later"} onPress={() => setMode("later")} icon={<Mail color={mode === "later" ? "#fff" : colors.accentDark} size={16} />} />
        </View>
        {mode === "later" ? <DateField value={deliverDate} onChangeText={setDeliverDate} placeholder="选择送达日期" /> : null}
        <PrimaryButton label={busy ? "投递中" : mode === "now" ? "送达这封信" : "寄出这封信"} onPress={sendLetter} disabled={!body.trim()} loading={busy} />
      </Card>
    </View>
  );
}

function LetterInboxPage({
  letters,
  me,
  partner,
  onBack,
  onReply,
  onChanged,
}: {
  letters: LetterPreview[];
  me: { name: string; initial: string; avatarUrl?: string | null };
  partner: { name: string; initial: string; avatarUrl?: string | null };
  onBack: () => void;
  onReply: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState(letters[0]?.id ?? "");
  const selected = letters.find((letter) => letter.id === selectedId) ?? letters[0];
  const isMine = selected?.author_id === user?.id;
  const canRead = Boolean(selected && (!selected.is_locked || isMine));
  const from = isMine ? me : partner;

  useEffect(() => {
    if (!selectedId || !letters.some((letter) => letter.id === selectedId)) {
      setSelectedId(letters[0]?.id ?? "");
    }
  }, [letters, selectedId]);

  async function dismiss(letter: LetterPreview) {
    const { error } = await supabase.rpc("dismiss_letter", { letter_id: letter.id });
    if (error) {
      showToast({ title: "关闭失败", message: error.message, tone: "error" });
      return;
    }
    showToast({ title: "已收下这封信", message: "它仍会留在记忆里的小信封中。", tone: "success" });
    onChanged();
  }

  async function markRead(letter: LetterPreview) {
    if (!letter.is_locked && !isMine) {
      await supabase.rpc("mark_letter_read", { letter_id: letter.id });
    }
    onChanged();
  }

  async function deleteLetter(letter: LetterPreview) {
    const { error } = await supabase.rpc("delete_letter", { letter_id: letter.id });
    if (error) {
      showToast({ title: "删除失败", message: error.message, tone: "error" });
      return;
    }
    const nextLetter = letters.find((item) => item.id !== letter.id);
    setSelectedId(nextLetter?.id ?? "");
    showToast({
      title: "信件已删除",
      message: isMine ? "这封信已从双方的来信和记忆中移除。" : "这封信已从你的来信和记忆中移除。",
      tone: "success",
    });
    onChanged();
  }

  return (
    <View style={styles.stack}>
      <TopBar title="来信" subtitle="那些没有被聊天冲走的话，都放在这里。" left={<BackButton onPress={onBack} />} />
      {letters.length === 0 ? (
        <Card>
          <EmptyState title="还没有信" description="写一封信给 TA，它会成为记忆里的小信封。" />
          <PrimaryButton label="写一封情书" onPress={onReply} icon={<Send color="#fff" size={16} />} />
        </Card>
      ) : null}
      {letters.length > 1 ? (
        <View style={styles.memoryFilterRow}>
          {letters.slice(0, 6).map((letter) => (
            <Pressable key={letter.id} onPress={() => setSelectedId(letter.id)} style={[styles.memoryFilterChip, selected?.id === letter.id ? styles.memoryFilterChipActive : null]}>
              <Text style={[styles.memoryFilterText, selected?.id === letter.id ? styles.memoryFilterTextActive : null]}>{letter.is_locked ? "待开启" : "可阅读"}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {selected ? (
        <Card soft style={styles.letterReminderCard}>
          <View style={styles.letterGlow} />
          <View style={styles.letterSenderRow}>
            <CoupleAvatarGroup me={from} partner={isMine ? partner : me} size={46} />
          </View>
          <View style={[styles.letterEnvelope, canRead ? styles.letterEnvelopeOpen : null]}>
            <Mail color={colors.accentDark} size={44} strokeWidth={2.3} />
          </View>
          <Text style={styles.letterReminderTitle}>{canRead ? selected.title : "有一封信正在等你"}</Text>
          <Text style={styles.letterReminderMeta}>
            {isMine ? "你写出的信" : `${selected.author_display_name || partner.name} 写给你的信`} · {formatMemoryDate(selected.deliver_at)}
          </Text>
          <Text style={styles.letterReminderBody}>
            {canRead ? selected.body || "这封信安静地留在这里。" : `还没到打开时间。等到 ${new Date(selected.deliver_at).toLocaleDateString("zh-CN")}，它会完整展开。`}
          </Text>
          <View style={styles.letterActionRow}>
            {canRead ? <SecondaryButton label="存入记忆" onPress={() => void markRead(selected)} icon={<Heart color={colors.accentDark} size={16} />} /> : null}
            {canRead && !isMine ? <SecondaryButton label="回复一封" onPress={onReply} icon={<Send color={colors.accentDark} size={16} />} /> : null}
            {!isMine ? <SecondaryButton label={canRead ? "关闭" : "先收下"} onPress={() => void dismiss(selected)} icon={<Mail color={colors.accentDark} size={16} />} /> : null}
            <SecondaryButton label="删除" danger onPress={() => void deleteLetter(selected)} icon={<Trash2 color={colors.accentDark} size={16} />} />
            <SecondaryButton label={canRead ? "关闭" : "稍后再看"} onPress={onBack} />
          </View>
        </Card>
      ) : null}
    </View>
  );
}

function CreationSpacePage({
  coupleId,
  me,
  partner,
  creationSpace,
  creationActions,
  footprints,
  onBack,
  onChanged,
}: {
  coupleId: string;
  me: { name: string; initial: string; avatarUrl?: string | null };
  partner: { name: string; initial: string; avatarUrl?: string | null };
  creationSpace: CreationSpace | null;
  creationActions: CreationAction[];
  footprints: CoupleFootprint[];
  onBack: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [space, setSpace] = useState<CreationSpace | null>(creationSpace);
  const activeSpace = space ?? creationSpace;
  const [selectedPetKey, setSelectedPetKey] = useState<CreationPetKey>(creationPetOptionFor(activeSpace?.pet_key).key);
  const [petName, setPetName] = useState(activeSpace?.pet_name ?? creationPetOptionFor(activeSpace?.pet_key).name);
  const [homeTheme, setHomeTheme] = useState(activeSpace?.home_theme ?? "cream");
  const [decorOne, setDecorOne] = useState(activeSpace?.decor_slot_1 ?? "软软窝垫");
  const [decorTwo, setDecorTwo] = useState(activeSpace?.decor_slot_2 ?? "暖光小灯");
  const [decorThree, setDecorThree] = useState(activeSpace?.decor_slot_3 ?? "胶囊花窗");
  const [homeBusy, setHomeBusy] = useState(false);
  const [choosePetBusy, setChoosePetBusy] = useState<CreationPetKey | null>(null);
  const [petBusy, setPetBusy] = useState<CreationFoodType | "pet" | "clean" | null>(null);
  const [storeBusy, setStoreBusy] = useState<CreationFoodType | null>(null);
  const [selectedPuzzleId, setSelectedPuzzleId] = useState(creationPuzzles[0].id);
  const [selectedPuzzleAnswer, setSelectedPuzzleAnswer] = useState("");
  const [puzzleFeedback, setPuzzleFeedback] = useState<"correct" | "wrong" | null>(null);
  const [gameBusy, setGameBusy] = useState(false);
  const [footprintTitle, setFootprintTitle] = useState("");
  const [footprintNote, setFootprintNote] = useState("");
  const [footprintDate, setFootprintDate] = useState(todayIsoDate());
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [editingFootprintId, setEditingFootprintId] = useState<string | null>(null);
  const [footprintBusy, setFootprintBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!creationSpace) {
      return;
    }
    setSpace((current) => {
      if (!current) {
        return creationSpace;
      }
      return creationSpace.updated_at > current.updated_at ? creationSpace : current;
    });
  }, [creationSpace]);

  useEffect(() => {
    const nextSpace = space ?? creationSpace;
    const nextPet = creationPetOptionFor(nextSpace?.pet_key);
    setSelectedPetKey(nextPet.key);
    setPetName(nextSpace?.pet_name ?? nextPet.name);
    setHomeTheme(nextSpace?.home_theme ?? "cream");
    setDecorOne(nextSpace?.decor_slot_1 ?? "软软窝垫");
    setDecorTwo(nextSpace?.decor_slot_2 ?? "暖光小灯");
    setDecorThree(nextSpace?.decor_slot_3 ?? "胶囊花窗");
  }, [creationSpace, space]);

  useEffect(() => {
    if (activeSpace) {
      return;
    }
    void ensureSpace(false);
  }, [activeSpace, coupleId]);

  async function ensureSpace(showSuccess = true) {
    const { data, error } = await supabase.rpc("ensure_creation_space", { target_couple_id: coupleId }).maybeSingle();
    if (error) {
      showToast({ title: "共创空间暂时打不开", message: error.message, tone: "error" });
      return null;
    }
    setSpace(data ?? null);
    if (showSuccess) {
      showToast({ title: "小屋已准备好", tone: "success" });
    }
    onChanged();
    return data ?? null;
  }

  async function choosePet(petKey: CreationPetKey) {
    if (choosePetBusy) {
      return;
    }
    const petOption = creationPetOptionFor(petKey);
    const enteredName = petName.trim();
    const nextName = !enteredName || enteredName === "小胶囊" ? petOption.name : enteredName;
    setChoosePetBusy(petKey);
    const { data, error } = await supabase.rpc("choose_creation_pet", {
      target_couple_id: coupleId,
      chosen_pet_key: petKey,
      chosen_pet_name: nextName,
    }).maybeSingle();
    setChoosePetBusy(null);
    if (error) {
      showToast({ title: "选择失败", message: error.message, tone: "error" });
      return;
    }
    setSelectedPetKey(petKey);
    setPetName(nextName);
    setSpace(data ?? null);
    showToast({ title: "云宠已入住", message: `${petOption.title} 会和你们一起住在小屋里。`, tone: "success" });
    onChanged();
  }

  async function feedPet(foodType: CreationFoodType) {
    if (petBusy) {
      return;
    }
    setPetBusy(foodType);
    const { data, error } = await supabase.rpc("feed_creation_pet", { target_couple_id: coupleId, food_type: foodType }).maybeSingle();
    setPetBusy(null);
    if (error) {
      showToast({ title: "喂养失败", message: creationFoodErrorMessage(error.message), tone: "error" });
      return;
    }
    setSpace(data ?? null);
    showToast({ title: `已喂${creationFoodLabel(foodType)}`, message: "粮食库存和云宠状态已同步给你们两个人。", tone: "success" });
    onChanged();
  }

  async function interactPet(type: "pet" | "clean") {
    if (petBusy) {
      return;
    }
    setPetBusy(type);
    const { data, error } = await supabase.rpc("interact_creation_pet", { target_couple_id: coupleId, interaction_type: type }).maybeSingle();
    setPetBusy(null);
    if (error) {
      showToast({ title: "互动失败", message: error.message, tone: "error" });
      return;
    }
    setSpace(data ?? null);
    showToast({ title: petActionToastTitle(type), message: "小屋状态已同步给你们两个人。", tone: "success" });
    onChanged();
  }

  async function buyFood(foodType: CreationFoodType) {
    if (storeBusy) {
      return;
    }
    setStoreBusy(foodType);
    const { data, error } = await supabase.rpc("buy_creation_food", {
      target_couple_id: coupleId,
      food_type: foodType,
      quantity: 1,
    }).maybeSingle();
    setStoreBusy(null);
    if (error) {
      showToast({ title: "购买失败", message: creationFoodErrorMessage(error.message), tone: "error" });
      return;
    }
    setSpace(data ?? null);
    showToast({ title: "粮仓已补充", message: `已买入 1 份${creationFoodLabel(foodType)}。`, tone: "success" });
    onChanged();
  }

  function switchPuzzle() {
    const currentIndex = creationPuzzles.findIndex((puzzle) => puzzle.id === selectedPuzzleId);
    const nextPuzzle = creationPuzzles[(currentIndex + 1) % creationPuzzles.length];
    setSelectedPuzzleId(nextPuzzle.id);
    setSelectedPuzzleAnswer("");
    setPuzzleFeedback(null);
  }

  async function claimPuzzleReward() {
    const currentPuzzle = creationPuzzles.find((puzzle) => puzzle.id === selectedPuzzleId) ?? creationPuzzles[0];
    if (!selectedPuzzleAnswer) {
      showToast({ title: "先选一个答案", message: currentPuzzle.hint, tone: "info" });
      return;
    }
    if (selectedPuzzleAnswer !== currentPuzzle.answer) {
      setPuzzleFeedback("wrong");
      showToast({ title: "还差一点", message: currentPuzzle.hint, tone: "info" });
      return;
    }

    setPuzzleFeedback("correct");
    setGameBusy(true);
    const { data, error } = await supabase.rpc("claim_creation_game_reward", {
      target_couple_id: coupleId,
      puzzle_id: currentPuzzle.id,
      solved: true,
    }).maybeSingle();
    setGameBusy(false);
    if (error) {
      showToast({ title: "奖励领取失败", message: creationGameErrorMessage(error.message), tone: "error" });
      return;
    }
    setSpace(data ?? null);
    showToast({ title: "获得 10 点奖励", message: "可以去粮仓给云宠买粮。", tone: "success" });
    onChanged();
  }

  async function saveHome() {
    if (homeBusy) {
      return;
    }
    setHomeBusy(true);
    const { data, error } = await supabase.rpc("update_creation_home", {
      target_couple_id: coupleId,
      pet_name: petName,
      home_theme: homeTheme,
      decor_slot_1: decorOne,
      decor_slot_2: decorTwo,
      decor_slot_3: decorThree,
    }).maybeSingle();
    setHomeBusy(false);
    if (error) {
      showToast({ title: "保存失败", message: error.message, tone: "error" });
      return;
    }
    setSpace(data ?? null);
    showToast({ title: "小屋已保存", message: "这次整理会留在共创动态里。", tone: "success" });
    onChanged();
  }

  function beginEditFootprint(footprint: CoupleFootprint) {
    setEditingFootprintId(footprint.id);
    setFootprintTitle(footprint.title);
    setFootprintNote(footprint.note ?? "");
    setFootprintDate(footprint.visited_at);
    setLatitude(footprint.latitude === null ? "" : String(footprint.latitude));
    setLongitude(footprint.longitude === null ? "" : String(footprint.longitude));
  }

  function resetFootprintForm() {
    setEditingFootprintId(null);
    setFootprintTitle("");
    setFootprintNote("");
    setFootprintDate(todayIsoDate());
    setLatitude("");
    setLongitude("");
  }

  function parsedCoordinates() {
    const latText = latitude.trim();
    const lngText = longitude.trim();
    if (!latText && !lngText) {
      return { latitude: null, longitude: null, error: null };
    }
    if (!latText || !lngText) {
      return { latitude: null, longitude: null, error: "经纬度需要同时填写，也可以都留空。" };
    }
    const lat = Number(latText);
    const lng = Number(lngText);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { latitude: null, longitude: null, error: "经纬度格式不正确。" };
    }
    return { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)), error: null };
  }

  async function saveFootprint() {
    if (!user || !footprintTitle.trim() || !footprintDate || footprintBusy) {
      return;
    }
    const coords = parsedCoordinates();
    if (coords.error) {
      showToast({ title: "足迹未保存", message: coords.error, tone: "error" });
      return;
    }

    setFootprintBusy(true);
    if (editingFootprintId) {
      const { error } = await supabase
        .from("couple_footprints")
        .update({
          title: footprintTitle.trim(),
          note: footprintNote.trim() || null,
          visited_at: footprintDate,
          latitude: coords.latitude,
          longitude: coords.longitude,
        })
        .eq("id", editingFootprintId);
      if (!error) {
        await writeCreationAction("footprint_update", `更新了足迹「${footprintTitle.trim()}」`);
      }
      setFootprintBusy(false);
      if (error) {
        showToast({ title: "更新失败", message: error.message, tone: "error" });
        return;
      }
      showToast({ title: "足迹已更新", tone: "success" });
    } else {
      const { error } = await supabase.from("couple_footprints").insert({
        couple_id: coupleId,
        created_by: user.id,
        title: footprintTitle.trim(),
        note: footprintNote.trim() || null,
        visited_at: footprintDate,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      if (!error) {
        await writeCreationAction("footprint_add", `记录了足迹「${footprintTitle.trim()}」`);
      }
      setFootprintBusy(false);
      if (error) {
        showToast({ title: "保存失败", message: error.message, tone: "error" });
        return;
      }
      showToast({ title: "足迹已记录", message: "它也会沉淀到记忆页的日常里。", tone: "success" });
    }
    resetFootprintForm();
    onChanged();
  }

  async function deleteFootprint(footprint: CoupleFootprint) {
    const { error } = await supabase.from("couple_footprints").update({ deleted_at: new Date().toISOString() }).eq("id", footprint.id);
    if (!error) {
      await writeCreationAction("footprint_delete", `删除了足迹「${footprint.title}」`);
    }
    if (error) {
      showToast({ title: "删除失败", message: error.message, tone: "error" });
      return;
    }
    if (editingFootprintId === footprint.id) {
      resetFootprintForm();
    }
    showToast({ title: "足迹已删除", tone: "success" });
    onChanged();
  }

  async function writeCreationAction(actionType: CreationAction["action_type"], actionLabel: string) {
    if (!user) {
      return;
    }
    await supabase.from("creation_actions").insert({
      couple_id: coupleId,
      actor_id: user.id,
      action_type: actionType,
      action_label: actionLabel,
    });
  }

  function useCurrentLocation() {
    if (Platform.OS !== "web" || typeof navigator === "undefined" || !navigator.geolocation) {
      showToast({ title: "无法定位", message: "当前环境不支持定位，可以手动填写地点名。", tone: "info" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setLocating(false);
        showToast({ title: "已填入当前位置", message: "也可以清空坐标，只保留地点名。", tone: "success" });
      },
      () => {
        setLocating(false);
        showToast({ title: "定位未开启", message: "没关系，可以只记录地点名和备注。", tone: "info" });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }

  const recentActions = creationActions.slice(0, 5);
  const displayedFootprints = footprints.slice(0, 6);
  const canSaveFootprint = Boolean(footprintTitle.trim() && footprintDate);
  const selectedPet = creationPetOptionFor(selectedPetKey);
  const currentPet = creationPetOptionFor(activeSpace?.pet_key ?? selectedPetKey);
  const currentPuzzle = creationPuzzles.find((puzzle) => puzzle.id === selectedPuzzleId) ?? creationPuzzles[0];
  const basicFoodCount = activeSpace?.basic_food_count ?? 2;
  const premiumFoodCount = activeSpace?.premium_food_count ?? 0;
  const treatBalance = activeSpace?.treat_balance ?? 0;

  return (
    <View style={styles.stack}>
      <TopBar title="共创空间" subtitle="一起养一只真实感云宠，靠解谜赚口粮，慢慢布置小屋和足迹。" left={<BackButton onPress={onBack} />} />

      <Card soft style={styles.creationHeroCard}>
        <View style={styles.creationHeroTop}>
          <CoupleAvatarGroup me={me} partner={partner} size={46} />
          <View style={styles.creationHeroBadge}>
            <PawPrint color={colors.accentDark} size={14} strokeWidth={2.6} />
            <Text style={styles.creationHeroBadgeText}>{currentPet.species === "cat" ? "云猫小屋" : "云狗小屋"}</Text>
          </View>
        </View>
        <View style={styles.creationPetStage}>
          <Image source={currentPet.image} style={styles.creationPetHeroImage} resizeMode="cover" />
          <View style={styles.creationPetStageShade} />
          <View style={styles.creationPetInfoPill}>
            <Text style={styles.creationPetInfoTitle}>{activeSpace?.pet_name ?? petName}</Text>
            <Text style={styles.creationPetInfoMeta}>{currentPet.title} · {currentPet.trait}</Text>
          </View>
        </View>
        <Text style={styles.creationHeroTitle}>{activeSpace?.pet_name ?? petName} 的云端小屋</Text>
        <Text style={styles.creationHeroText}>{activeSpace?.pet_mood ?? "小屋刚刚打开，等你们一起把它养得更亲近。"}</Text>
        <View style={styles.creationMeters}>
          <CreationMeter label="饱腹" value={activeSpace?.fullness ?? 62} color="#d9a766" />
          <CreationMeter label="洁净" value={activeSpace?.cleanliness ?? 64} color="#7da9bd" />
          <CreationMeter label="亲密" value={activeSpace?.affection ?? 68} color={colors.accentDark} />
        </View>
        <View style={styles.creationResourceRow}>
          <CreationResourcePill label="奖励" value={`${treatBalance} 点`} icon={<Bone color={colors.accentDark} size={14} strokeWidth={2.5} />} />
          <CreationResourcePill label="日常粮" value={`${basicFoodCount} 份`} icon={<Utensils color={colors.accentDark} size={14} strokeWidth={2.5} />} />
          <CreationResourcePill label="鲜食粮" value={`${premiumFoodCount} 份`} icon={<Sparkles color={colors.accentDark} size={14} strokeWidth={2.5} />} />
        </View>
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>选择云宠</Text>
          <Text style={styles.creationLevelText}>Lv.{activeSpace?.pet_level ?? 1} · {activeSpace?.growth_points ?? 0} 成长</Text>
        </View>
        <View style={styles.creationPetGrid}>
          {creationPetOptions.map((petOption) => {
            const active = selectedPetKey === petOption.key;
            return (
              <Pressable
                key={petOption.key}
                accessibilityRole="button"
                accessibilityLabel={`选择${petOption.title}`}
                onPress={() => void choosePet(petOption.key)}
                style={({ pressed }) => [
                  styles.creationPetOption,
                  active ? styles.creationPetOptionActive : null,
                  pressed ? styles.creationPetOptionPressed : null,
                ]}
              >
                <Image source={petOption.image} style={styles.creationPetOptionImage} resizeMode="cover" />
                <View style={styles.creationPetOptionText}>
                  <Text style={styles.creationPetOptionTitle}>{petOption.title}</Text>
                  <Text style={styles.creationPetOptionMeta}>{petOption.trait}</Text>
                </View>
                {active ? (
                  <View style={styles.creationPetCheck}>
                    {choosePetBusy === petOption.key ? <Text style={styles.creationPetCheckText}>...</Text> : <Check color="#fff" size={13} strokeWidth={3} />}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.creationPetDescription}>{selectedPet.description}</Text>
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>喂养和互动</Text>
          <Text style={styles.creationLevelText}>粮仓 {basicFoodCount + premiumFoodCount} 份</Text>
        </View>
        <View style={styles.creationActionRow}>
          <SecondaryButton label={`喂日常粮 · ${basicFoodCount}`} active={petBusy === "basic"} loading={petBusy === "basic"} disabled={basicFoodCount <= 0} onPress={() => void feedPet("basic")} icon={<Utensils color={colors.accentDark} size={16} />} />
          <SecondaryButton label={`喂鲜食粮 · ${premiumFoodCount}`} active={petBusy === "premium"} loading={petBusy === "premium"} disabled={premiumFoodCount <= 0} onPress={() => void feedPet("premium")} icon={<Sparkles color={colors.accentDark} size={16} />} />
          <SecondaryButton label="抚摸" active={petBusy === "pet"} loading={petBusy === "pet"} onPress={() => void interactPet("pet")} icon={<Heart color={colors.accentDark} size={16} />} />
          <SecondaryButton label="清洁小屋" active={petBusy === "clean"} loading={petBusy === "clean"} onPress={() => void interactPet("clean")} icon={<ImagePlus color={colors.accentDark} size={16} />} />
        </View>
        <InlineNotice tone="info">日常粮来自初始库存或奖励购买；鲜食粮更贵，但成长和亲密提升更明显。</InlineNotice>
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>小屋设置</Text>
          <ShoppingBag color={colors.accentDark} size={18} strokeWidth={2.4} />
        </View>
        <AppTextInput value={petName} onChangeText={setPetName} placeholder="给共享宠物取个名字" maxLength={16} />
        <AppTextInput value={homeTheme} onChangeText={setHomeTheme} placeholder="小屋主题，例如 cream / sea / night" maxLength={24} />
        <View style={styles.creationDecorRow}>
          <AppTextInput value={decorOne} onChangeText={setDecorOne} placeholder="装饰位 1" maxLength={18} style={styles.creationDecorInput} />
          <AppTextInput value={decorTwo} onChangeText={setDecorTwo} placeholder="装饰位 2" maxLength={18} style={styles.creationDecorInput} />
          <AppTextInput value={decorThree} onChangeText={setDecorThree} placeholder="装饰位 3" maxLength={18} style={styles.creationDecorInput} />
        </View>
        <PrimaryButton label={homeBusy ? "保存中" : "保存小屋"} onPress={saveHome} loading={homeBusy} />
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>粮仓商店</Text>
          <Text style={styles.creationLevelText}>{treatBalance} 点奖励</Text>
        </View>
        <View style={styles.creationShopGrid}>
          <CreationFoodCard
            title="日常粮"
            description="基础饱腹，适合每天照顾。"
            price={6}
            count={basicFoodCount}
            icon={<Utensils color={colors.accentDark} size={18} strokeWidth={2.5} />}
            loading={storeBusy === "basic"}
            disabled={treatBalance < 6}
            onBuy={() => void buyFood("basic")}
          />
          <CreationFoodCard
            title="鲜食粮"
            description="更高成长和亲密，奖励足够时再买。"
            price={14}
            count={premiumFoodCount}
            icon={<Sparkles color={colors.accentDark} size={18} strokeWidth={2.5} />}
            loading={storeBusy === "premium"}
            disabled={treatBalance < 14}
            onBuy={() => void buyFood("premium")}
          />
        </View>
      </Card>

      <Card style={styles.creationGameCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>解谜奖励</Text>
          <Gamepad2 color={colors.accentDark} size={18} strokeWidth={2.5} />
        </View>
        <View style={styles.creationPuzzleHeader}>
          <View style={styles.creationPuzzleBadge}>
            <Brain color={colors.accentDark} size={15} strokeWidth={2.5} />
            <Text style={styles.creationPuzzleBadgeText}>{currentPuzzle.type}</Text>
          </View>
          <SecondaryButton label="换一题" onPress={switchPuzzle} />
        </View>
        <Text style={styles.creationPuzzleQuestion}>{currentPuzzle.question}</Text>
        <View style={styles.creationPuzzleOptions}>
          {currentPuzzle.options.map((option) => {
            const active = selectedPuzzleAnswer === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={`选择答案 ${option}`}
                onPress={() => {
                  setSelectedPuzzleAnswer(option);
                  setPuzzleFeedback(null);
                }}
                style={[styles.creationPuzzleOption, active ? styles.creationPuzzleOptionActive : null]}
              >
                <Text style={[styles.creationPuzzleOptionText, active ? styles.creationPuzzleOptionTextActive : null]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
        {puzzleFeedback === "wrong" ? <InlineNotice tone="info">{currentPuzzle.hint}</InlineNotice> : null}
        {puzzleFeedback === "correct" ? <InlineNotice tone="success">答对了。奖励会进入你们共享粮仓账户。</InlineNotice> : null}
        <PrimaryButton label={gameBusy ? "领取中" : "答对领取 10 点奖励"} onPress={() => void claimPuzzleReward()} loading={gameBusy} icon={<Bone color="#fff" size={16} strokeWidth={2.5} />} />
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>足迹地图</Text>
          <SecondaryButton label={locating ? "定位中" : "辅助定位"} onPress={useCurrentLocation} loading={locating} />
        </View>
        <View style={styles.footprintForm}>
          <AppTextInput value={footprintTitle} onChangeText={setFootprintTitle} placeholder="地点名，例如 晚风桥边" maxLength={28} />
          <DateField value={footprintDate} onChangeText={setFootprintDate} placeholder="选择日期" />
          <AppTextInput value={footprintNote} onChangeText={setFootprintNote} placeholder="备注（可选）" multiline style={styles.footprintNoteInput} />
          <View style={styles.footprintCoordRow}>
            <AppTextInput value={latitude} onChangeText={setLatitude} placeholder="纬度（可空）" keyboardType="decimal-pad" style={styles.footprintCoordInput} />
            <AppTextInput value={longitude} onChangeText={setLongitude} placeholder="经度（可空）" keyboardType="decimal-pad" style={styles.footprintCoordInput} />
          </View>
          <InlineNotice tone="info">拒绝定位也可以继续记录；坐标可留空，只保存地点名和备注。</InlineNotice>
          <View style={styles.creationActionRow}>
            {editingFootprintId ? <SecondaryButton label="取消编辑" onPress={resetFootprintForm} /> : null}
            <PrimaryButton label={footprintBusy ? "保存中" : editingFootprintId ? "更新足迹" : "记录足迹"} onPress={saveFootprint} disabled={!canSaveFootprint} loading={footprintBusy} />
          </View>
        </View>
        <View style={styles.creationFootprintList}>
          {displayedFootprints.length ? (
            displayedFootprints.map((footprint) => {
              const mine = footprint.created_by === user?.id;
              return (
                <View key={footprint.id} style={styles.creationFootprintItem}>
                  <View style={styles.creationFootprintText}>
                    <Text style={styles.creationFootprintTitle}>{footprint.title}</Text>
                    <Text style={styles.creationFootprintMeta}>{formatMemoryDate(footprint.visited_at)}{footprint.note ? ` · ${footprint.note}` : ""}</Text>
                    {footprint.latitude !== null && footprint.longitude !== null ? (
                      <Text style={styles.creationFootprintCoords}>{formatCoordinate(footprint.latitude)}, {formatCoordinate(footprint.longitude)}</Text>
                    ) : null}
                  </View>
                  {mine ? (
                    <View style={styles.creationFootprintActions}>
                      <SecondaryButton label="编辑" onPress={() => beginEditFootprint(footprint)} />
                      <SecondaryButton label="删除" danger onPress={() => void deleteFootprint(footprint)} icon={<Trash2 color={colors.accentDark} size={15} />} />
                    </View>
                  ) : null}
                </View>
              );
            })
          ) : (
            <EmptyState title="还没有足迹" description="先手动记录一个地点，之后会出现在记忆页的日常里。" />
          )}
        </View>
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>共创动态</Text>
          <Text style={styles.creationLevelText}>最近 {recentActions.length} 条</Text>
        </View>
        {recentActions.length ? (
          recentActions.map((action) => (
            <View key={action.id} style={styles.creationActionItem}>
              <Text style={styles.creationActionTitle}>{action.action_label}</Text>
              <Text style={styles.creationActionMeta}>{formatMemoryDate(action.created_at)}</Text>
            </View>
          ))
        ) : (
          <EmptyState title="还没有动态" description="喂养、整理小屋或记录足迹后，会在这里留下轻量记录。" />
        )}
      </Card>
    </View>
  );
}

function CreationMeter({ label, value, color }: { label: string; value: number; color: string }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View style={styles.creationMeter}>
      <View style={styles.creationMeterHead}>
        <Text style={styles.creationMeterLabel}>{label}</Text>
        <Text style={styles.creationMeterValue}>{safeValue}</Text>
      </View>
      <View style={styles.creationMeterTrack}>
        <View style={[styles.creationMeterFill, { width: `${safeValue}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function CreationResourcePill({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <View style={styles.creationResourcePill}>
      <View style={styles.creationResourceIcon}>{icon}</View>
      <View style={styles.creationResourceText}>
        <Text style={styles.creationResourceLabel}>{label}</Text>
        <Text style={styles.creationResourceValue}>{value}</Text>
      </View>
    </View>
  );
}

function CreationFoodCard({
  title,
  description,
  price,
  count,
  icon,
  loading,
  disabled,
  onBuy,
}: {
  title: string;
  description: string;
  price: number;
  count: number;
  icon: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onBuy: () => void;
}) {
  return (
    <View style={styles.creationFoodCard}>
      <View style={styles.creationFoodTop}>
        <View style={styles.creationFoodIcon}>{icon}</View>
        <Text style={styles.creationFoodCount}>{count} 份</Text>
      </View>
      <Text style={styles.creationFoodTitle}>{title}</Text>
      <Text style={styles.creationFoodDescription}>{description}</Text>
      <SecondaryButton label={`${price} 点购买`} onPress={onBuy} loading={loading} disabled={disabled} icon={<ShoppingBag color={colors.accentDark} size={15} />} />
    </View>
  );
}

function CalendarPage({
  checkins,
  messages,
  events,
  mediaFiles,
  letters,
  footprints,
  currentUserId,
  onAddEvent,
  onOpenLetter,
  onChanged,
  onUploadMemoryPhoto,
  onCreateCapsule,
}: {
  checkins: Checkin[];
  messages: Message[];
  events: CalendarEvent[];
  mediaFiles: MediaFile[];
  letters: LetterPreview[];
  footprints: CoupleFootprint[];
  currentUserId: string;
  onAddEvent: () => void;
  onOpenLetter: (letter: LetterPreview) => void;
  onChanged: () => void;
  onUploadMemoryPhoto: (memory: MemoryTimelineItem, currentCount: number) => void;
  onCreateCapsule: () => void;
}) {
  const memories = buildMemoryTimeline(checkins, messages, events, mediaFiles, letters, footprints, currentUserId);
  const [filter, setFilter] = useState<MemoryFilter>("全部");
  const visibleMemories = filter === "全部" ? memories : memories.filter((memory) => memory.filter === filter);
  const filterOptions: MemoryFilter[] = ["全部", "日常", "留言", "纪念日", "信件"];
  return (
    <View style={styles.memoryScreen}>
      <View style={styles.memoryHero}>
        <Text style={styles.memorySubtitle}>把那些小小的瞬间，慢慢存起来。</Text>
      </View>
      <Card style={styles.memoryCalendarCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>我们的日历</Text>
          <Image source={cartoonIcons.calendar} style={styles.headerIcon} resizeMode="contain" />
        </View>
        <MiniCalendar checkins={checkins} messages={messages} events={events} letters={letters} />
      </Card>
      <View style={styles.memoryFilterRow}>
        {filterOptions.map((option) => (
          <Pressable key={option} onPress={() => setFilter(option)} style={[styles.memoryFilterChip, filter === option ? styles.memoryFilterChipActive : null]}>
            <Text style={[styles.memoryFilterText, filter === option ? styles.memoryFilterTextActive : null]}>{option}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.memoryTimeline}>
        {visibleMemories.length ? (
          visibleMemories.map((memory, index) => (
            <MemoryTimelineCard
              key={memory.id}
              memory={memory}
              index={index}
              isLast={index === visibleMemories.length - 1}
              onPress={memory.letter ? () => onOpenLetter(memory.letter!) : undefined}
              onUploadPhoto={() => onUploadMemoryPhoto(memory, memory.photos.length)}
              onDeleted={onChanged}
            />
          ))
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="创建今日胶囊" onPress={onCreateCapsule} style={styles.emptyStatePressable}>
            <EmptyState title="这个分类还没有胶囊" description="点一下先创建今天的胶囊，新的日常会出现在这里。" />
          </Pressable>
        )}
      </View>
      <FloatingMemoryAction onAddEvent={onAddEvent} />
    </View>
  );
}

function FloatingMemoryAction({
  onAddEvent,
}: {
  onAddEvent: () => void;
}) {
  const button = (
    <View style={styles.memoryActionDock}>
      <Pressable accessibilityRole="button" accessibilityLabel="添加记忆" onPress={onAddEvent} style={styles.memoryActionMini}>
        <CalendarPlus color={colors.accentDark} size={20} strokeWidth={2.4} />
      </Pressable>
    </View>
  );

  if (Platform.OS === "web" && typeof document !== "undefined") {
    return createPortal(button, document.body) as ReactNode;
  }

  return button;
}

function PhotoAlbumCard({
  mediaFiles,
  onUploadPhoto,
  onPreviewPhoto,
  onDeletePhoto,
}: {
  mediaFiles: MediaFile[];
  onUploadPhoto: () => void;
  onPreviewPhoto: (file: MediaFile, index?: number) => void;
  onDeletePhoto: (file: MediaFile) => void;
}) {
  const previews = mediaFiles.slice(0, 9);
  const hiddenCount = Math.max(0, mediaFiles.length - previews.length);

  return (
    <Card style={styles.photoAlbumCard}>
      <View style={styles.photoAlbumHeader}>
        <View style={styles.photoAlbumTitleGroup}>
          <Text style={styles.sectionTitle}>相册</Text>
          <Text style={styles.photoAlbumMeta}>{mediaFiles.length ? `${mediaFiles.length} 张照片` : "还没有照片"}</Text>
        </View>
        <View style={styles.photoAlbumHeaderActions}>
          {mediaFiles.length > 9 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="查看全部照片" onPress={() => onPreviewPhoto(mediaFiles[0], 0)} style={styles.photoAlbumViewAllButton}>
              <Text style={styles.photoAlbumViewAllText}>查看全部</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="上传照片" onPress={onUploadPhoto} style={styles.photoAlbumUploadButton}>
            <ImagePlus color={colors.accentDark} size={17} />
          </Pressable>
        </View>
      </View>
      {previews.length ? (
        <View style={styles.photoAlbumGrid}>
          {previews.map((file, index) => {
            const rotateDeg = `${(index % 3 === 0 ? -2.2 : index % 3 === 1 ? 1.8 : -1.2) * (1 - (index % 2) * 0.4)}deg`;
            return (
              <View key={file.id} style={[styles.photoAlbumThumb, { transform: [{ rotate: rotateDeg }] }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`查看照片 ${index + 1}${file.caption ? ` ${file.caption}` : ""}`}
                onPress={() => onPreviewPhoto(file, index)}
                style={styles.photoAlbumThumbPressable}
              >
                {file.signedUrl ? <Image source={{ uri: file.signedUrl }} style={styles.photoAlbumImage} resizeMode="cover" /> : null}
                {hiddenCount > 0 && index === previews.length - 1 ? (
                  <View pointerEvents="none" style={styles.photoAlbumMoreOverlay}>
                    <Text style={styles.photoAlbumMoreText}>+{hiddenCount}</Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`删除照片 ${index + 1}${file.caption ? ` ${file.caption}` : ""}`}
                onPress={() => onDeletePhoto(file)}
                style={styles.photoAlbumDeleteBadge}
              >
                <Trash2 color="#fff" size={12} strokeWidth={2.8} />
              </Pressable>
            </View>
          );
        })}
      </View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="上传第一张照片" onPress={onUploadPhoto} style={styles.photoAlbumEmpty}>
          <ImagePlus color={colors.accentDark} size={24} />
          <Text style={styles.photoAlbumEmptyTitle}>上传第一张照片</Text>
          <Text style={styles.photoAlbumEmptyText}>合照、截图、小票和今天的风景，都可以先放进这里。</Text>
        </Pressable>
      )}
    </Card>
  );
}

function PhotoPreviewPopup({
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
  const currentIndex = Math.max(
    0,
    files.findIndex((item) => item.id === activeId),
    Number.isFinite(activeIndex) ? activeIndex : 0
  );
  const file = files[currentIndex] ?? files[0];
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < files.length - 1;

  if (!file) {
    return null;
  }

  const popup = (
    <View pointerEvents="box-none" style={styles.photoPreviewLayer}>
      <View style={styles.photoPreviewBackdrop} />
      <View style={styles.photoPreviewCard}>
        <View style={styles.photoPreviewHeader}>
          <View style={styles.photoPreviewCounterPill}>
            <Text style={styles.photoPreviewCounterText}>
              {currentIndex + 1} / {files.length}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭预览" onPress={onClose} style={styles.photoPreviewCloseIcon}>
            <Text style={styles.photoPreviewCloseIconText}>×</Text>
          </Pressable>
        </View>
        <View style={styles.photoPreviewFrame}>
          {file.signedUrl ? <Image source={{ uri: file.signedUrl }} style={styles.photoPreviewImage} resizeMode="contain" /> : null}
          {canGoPrev ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="上一张"
              onPress={() => onSelect(files[currentIndex - 1], currentIndex - 1)}
              style={[styles.photoPreviewNavButton, styles.photoPreviewNavLeft]}
            >
              <ChevronLeft color={colors.accentDark} size={18} strokeWidth={2.8} />
            </Pressable>
          ) : null}
          {canGoNext ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="下一张"
              onPress={() => onSelect(files[currentIndex + 1], currentIndex + 1)}
              style={[styles.photoPreviewNavButton, styles.photoPreviewNavRight]}
            >
              <Text style={styles.photoPreviewNavText}>›</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.photoPreviewMeta}>
          <Text style={styles.photoPreviewTitle}>{file.caption || "相册里的瞬间"}</Text>
          <Text style={styles.photoPreviewBody}>这是你们相册中的第 {currentIndex + 1} 张照片。</Text>
        </View>
        <View style={styles.photoPreviewActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="删除这张照片" onPress={() => onDelete(file)} style={styles.photoPreviewDelete}>
            <Trash2 color={colors.accentDark} size={16} strokeWidth={2.5} />
            <Text style={styles.photoPreviewDeleteText}>删除</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.photoPreviewClose}>
            <Text style={styles.photoPreviewCloseText}>关闭</Text>
          </Pressable>
        </View>
        {files.length > 1 ? (
          <View style={styles.photoPreviewStrip}>
            {files.map((item, index) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`切换到照片 ${index + 1}${item.caption ? ` ${item.caption}` : ""}`}
                onPress={() => onSelect(item, index)}
                style={[styles.photoPreviewStripThumb, item.id === file.id ? styles.photoPreviewStripThumbActive : null]}
              >
                {item.signedUrl ? <Image source={{ uri: item.signedUrl }} style={styles.photoPreviewStripImage} resizeMode="cover" /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );

  if (Platform.OS === "web" && typeof document !== "undefined") {
    return createPortal(popup, document.body);
  }

  return popup;
}

function FloatingReaction({ icon, label, image }: { icon: string; label: string; image?: ImageSourcePropType }) {
  const progress = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 1250, useNativeDriver: false }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 380, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 380, useNativeDriver: false }),
      ]),
      { iterations: 2 }
    ).start();
  }, [progress, pulse]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.floatingReaction,
        {
          opacity: progress.interpolate({ inputRange: [0, 0.12, 0.82, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [12, -18, -22] }) },
            { scale: progress.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0.9, 1.02, 0.98] }) },
          ],
        },
      ]}
    >
      <View style={styles.floatingReactionIconWrap}>
        {image ? <Image source={image} style={styles.floatingReactionImage} resizeMode="contain" /> : <Text style={styles.floatingReactionIcon}>{icon}</Text>}
      </View>
      <View style={styles.floatingReactionCopy}>
        <Text style={styles.floatingReactionTitle}>正把心意送到 TA 身边</Text>
        <Text style={styles.floatingReactionText}>{label}</Text>
        <View style={styles.floatingReactionTrack}>
          <Animated.View
            style={[
              styles.floatingReactionTrackFill,
              {
                width: progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: ["10%", "88%", "100%"] }),
              },
            ]}
          />
        </View>
      </View>
      <View style={styles.floatingReactionDots}>
        {[0, 1, 2].map((item) => (
          <Animated.View
            key={item}
            style={[
              styles.floatingReactionDot,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [item === 0 ? 1 : 0.42, item === 2 ? 1 : 0.42] }),
                transform: [
                  {
                    translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, item === 1 ? -3 : 0] }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </Animated.View>
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

function AddEventPage({ coupleId, onSaved, onBack }: { coupleId: string; onSaved: () => void; onBack: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<"anniversary" | "date" | "birthday" | "other">("anniversary");
  const [remind, setRemind] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!user || !title.trim() || !date) {
      return;
    }
    setBusy(true);
    const { data: event, error } = await supabase.from("calendar_events").insert({
      couple_id: coupleId,
      created_by: user.id,
      title: title.trim(),
      event_date: date,
      type: type === "birthday" ? "other" : type,
    }).select("id").maybeSingle();
    if (error) {
      setBusy(false);
      showToast({ title: "保存失败", message: error.message, tone: "error" });
      return;
    }
    if (remind) {
      const { data: members } = await supabase.from("couple_members").select("user_id").eq("couple_id", coupleId).is("left_at", null);
      await Promise.all(
        (members ?? []).map((member) =>
          supabase.from("notifications").insert({
            couple_id: coupleId,
            user_id: member.user_id,
            actor_id: user.id,
            type: "calendar_event",
            title: "新的记忆事件已保存",
            body: title.trim(),
            related_table: "calendar_events",
            related_id: event?.id,
          })
        )
      );
    }
    setBusy(false);
    showToast({ title: "事件已保存", message: remind ? "已加入站内提醒。" : undefined, tone: "success" });
    onSaved();
    onBack();
  }

  return (
    <View style={styles.stack}>
      <TopBar title="添加事件" subtitle="纪念日、约会和普通小事都可以记录。" left={<BackButton onPress={onBack} />} />
      <Card>
        <AppTextInput value={title} onChangeText={setTitle} placeholder="事件名称" />
        <DateField value={date} onChangeText={setDate} placeholder="选择日期" />
        <View style={styles.typeGrid}>
          {[
            ["anniversary", "纪念日"],
            ["date", "约会"],
            ["birthday", "生日"],
            ["other", "普通"],
          ].map(([key, label]) => (
            <Pressable key={key} onPress={() => setType(key as typeof type)} style={[styles.typeChip, type === key ? styles.typeChipActive : null]}>
              <Text style={[styles.typeText, type === key ? styles.typeTextActive : null]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => setRemind(!remind)} style={styles.remindRow}>
          <View style={[styles.checkbox, remind ? styles.checkboxActive : null]} />
          <Text style={styles.bodyText}>提醒我这个事件</Text>
        </Pressable>
        <InlineNotice tone="info">V0.1B 会生成站内提醒；系统推送仍留到 V0.2 移动端接入。</InlineNotice>
        <AppTextInput value={note} onChangeText={setNote} placeholder="备注（可选）" multiline style={styles.messageInput} />
        <PrimaryButton label={busy ? "保存中" : "保存"} onPress={save} disabled={!title.trim() || !date} loading={busy} />
      </Card>
    </View>
  );
}

function MePage({
  me,
  partner,
  loveDays,
  onSignOut,
  onEndCouple,
  endingCouple,
  coupleId,
  notifications,
  onChanged,
  onOpenSetting,
}: {
  me: { name: string; initial: string; avatarUrl?: string | null };
  partner: { name: string; initial: string; avatarUrl?: string | null };
  loveDays: number;
  onSignOut: () => void;
  onEndCouple: () => void;
  endingCouple: boolean;
  coupleId: string;
  notifications: Notification[];
  onChanged: () => void;
  onOpenSetting: (page: SettingPage) => void;
}) {
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const settings: Array<{ label: string; page: SettingPage; icon: ReactNode }> = [
    { label: "个人资料", page: "profile", icon: <UserRound color={colors.accentDark} size={17} /> },
    { label: "情侣资料", page: "couple", icon: <UsersRound color={colors.accentDark} size={17} /> },
    { label: "通知设置", page: "notifications", icon: <Bell color={colors.accentDark} size={17} /> },
    { label: "隐私设置", page: "privacy", icon: <Lock color={colors.accentDark} size={17} /> },
    { label: "关系设置", page: "relationship", icon: <Heart color={colors.accentDark} size={17} /> },
    { label: "反馈入口", page: "feedback", icon: <MessageCircle color={colors.accentDark} size={17} /> },
    { label: "关于 App", page: "about", icon: <Info color={colors.accentDark} size={17} /> },
  ];

  return (
    <View style={styles.stack}>
      <Card soft style={styles.profileHero}>
        <CoupleAvatarGroup me={me} partner={partner} />
        <Text style={styles.profileName}>{me.name} ♡ {partner.name}</Text>
        <Text style={styles.bodyText}>你们已经一起存下第 {loveDays} 天。</Text>
      </Card>
      <Card>
        {settings.map((item) => (
          <SettingRow key={item.label} label={item.label} icon={item.icon} onPress={() => onOpenSetting(item.page)} />
        ))}
      </Card>
      <View style={styles.quietDangerArea}>
        <SecondaryButton label="退出登录" onPress={onSignOut} icon={<LogOut color={colors.accentDark} size={16} />} />
        <SecondaryButton label={endingCouple ? "解除中" : "解除当前关系"} onPress={onEndCouple} loading={endingCouple} danger />
      </View>
    </View>
  );
}

function SettingsDetailPage({
  page,
  me,
  partner,
  loveDays,
  startedAt,
  onBack,
  onSignOut,
  onEndCouple,
  endingCouple,
  coupleId,
  partnerId,
  notifications,
  onChanged,
  onOpenLetters,
}: {
  page: SettingPage;
  me: { name: string; initial: string; avatarUrl?: string | null };
  partner: { name: string; initial: string; avatarUrl?: string | null };
  loveDays: number;
  startedAt: string;
  onBack: () => void;
  onSignOut: () => void;
  onEndCouple: () => void;
  endingCouple: boolean;
  coupleId: string;
  partnerId?: string;
  notifications: Notification[];
  onChanged: () => void;
  onOpenLetters: () => void;
}) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [startDate, setStartDate] = useState(startedAt);
  const [savingStartDate, setSavingStartDate] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [privacyReason, setPrivacyReason] = useState("");
  const [privacyBusy, setPrivacyBusy] = useState<"report" | "block" | "delete" | null>(null);
  const titles: Record<SettingPage, string> = {
    profile: "个人资料",
    couple: "情侣资料",
    notifications: "通知设置",
    privacy: "隐私设置",
    relationship: "关系设置",
    feedback: "反馈",
    about: "关于 App",
  };

  return (
    <View style={styles.stack}>
      <TopBar title={titles[page]} subtitle={settingSubtitle(page)} left={<BackButton onPress={onBack} />} />
      {page === "profile" ? (
        <ProfileScreen
          onSaved={() => {
            onChanged();
            onBack();
          }}
          embedded
        />
      ) : null}
      {page === "couple" ? (
        <Card>
          <CoupleAvatarGroup me={me} partner={partner} />
          <InfoRow label="恋爱开始日期" value={formatShortDate(startedAt)} />
          <InfoRow label="当前关系" value="恋爱中" />
          <InfoRow label="同频天数" value={`${loveDays} 天`} />
        </Card>
      ) : null}
      {page === "notifications" ? (
        <Card>
          <Text style={styles.sectionTitle}>站内通知</Text>
          {notifications.length === 0 ? <EmptyState title="暂时没有提醒" description="来信、留言、胶囊和事件会出现在这里。" /> : null}
          {notifications.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} onChanged={onChanged} onOpenLetters={onOpenLetters} />
          ))}
          <InlineNotice tone="info">V0.1B 只做站内通知；原生推送会在 V0.2 接入。</InlineNotice>
        </Card>
      ) : null}
      {page === "privacy" ? (
        <Card>
          <SettingRow label="只有当前情侣关系可见" icon={<Shield color={colors.accentDark} size={17} />} />
          <InfoRow label="头像" value="本人和当前伴侣可见" />
          <InfoRow label="相册" value="私有存储" />
          <AppTextInput value={privacyReason} onChangeText={setPrivacyReason} placeholder="举报、拉黑或注销原因（可选）" multiline style={styles.messageInput} />
          <SecondaryButton
            label={privacyBusy === "report" ? "提交中" : "举报当前伴侣"}
            loading={privacyBusy === "report"}
            icon={<Shield color={colors.accentDark} size={16} />}
            onPress={async () => {
              if (!user || !partnerId) return;
              setPrivacyBusy("report");
              const { error } = await supabase.from("reports").insert({
                couple_id: coupleId,
                reporter_id: user.id,
                reported_user_id: partnerId,
                reason: privacyReason.trim() || "用户从隐私设置提交举报",
              });
              setPrivacyBusy(null);
              if (error) {
                showToast({ title: "举报失败", message: error.message, tone: "error" });
                return;
              }
              showToast({ title: "举报已提交", message: "V0.1B 会记录处理线索，完整审核后台后续补齐。", tone: "success" });
              setPrivacyReason("");
              onBack();
            }}
          />
          <SecondaryButton
            label={privacyBusy === "block" ? "处理中" : "拉黑并解除关系"}
            danger
            loading={privacyBusy === "block"}
            icon={<Lock color={colors.accentDark} size={16} />}
            onPress={async () => {
              setPrivacyBusy("block");
              const { error } = await supabase.rpc("block_partner_and_end_couple", { reason: privacyReason.trim() || null });
              setPrivacyBusy(null);
              if (error) {
                showToast({ title: "拉黑失败", message: error.message, tone: "error" });
                return;
              }
              showToast({ title: "已拉黑并解除关系", message: "双方不能继续写入原情侣空间。", tone: "success" });
              onChanged();
              onBack();
            }}
          />
          <SecondaryButton
            label={privacyBusy === "delete" ? "提交中" : "申请注销账号"}
            danger
            loading={privacyBusy === "delete"}
            icon={<Trash2 color={colors.accentDark} size={16} />}
            onPress={async () => {
              setPrivacyBusy("delete");
              const { error } = await supabase.rpc("request_account_deletion", { reason: privacyReason.trim() || null });
              setPrivacyBusy(null);
              if (error) {
                showToast({ title: "注销申请失败", message: error.message, tone: "error" });
                return;
              }
              showToast({ title: "注销申请已提交", message: "账号已进入待注销状态，V0.1B 不做即时物理删除。", tone: "success" });
              onChanged();
              onBack();
            }}
          />
        </Card>
      ) : null}
      {page === "relationship" ? (
        <Card>
          <Text style={styles.sectionTitle}>恋爱开始日期</Text>
          <DateField value={startDate} onChangeText={setStartDate} placeholder="选择日期" />
          <SecondaryButton
            label={savingStartDate ? "保存中" : "保存开始日期"}
            loading={savingStartDate}
            disabled={!startDate || startDate === startedAt}
            onPress={async () => {
              setSavingStartDate(true);
              const { error } = await supabase.rpc("update_active_couple_dates", { relationship_started_at: startDate });
              setSavingStartDate(false);
              if (error) {
                showToast({ title: "保存失败", message: "云端数据库需要先执行最新日期设置 SQL。", tone: "error" });
                return;
              }
              showToast({ title: "开始日期已更新", tone: "success" });
              onChanged();
              onBack();
            }}
          />
          <InfoRow label="关系状态" value="恋爱中" />
          <View style={styles.compactDanger}>
            <Text style={styles.quietDangerText}>不建议轻易解除关系；这里仅作为必要时的关系管理入口。</Text>
            <SecondaryButton label={endingCouple ? "解除中" : "解除关系"} onPress={onEndCouple} loading={endingCouple} danger />
          </View>
        </Card>
      ) : null}
      {page === "feedback" ? (
        <Card>
          <AppTextInput value={feedback} onChangeText={setFeedback} placeholder="想反馈什么？" multiline style={styles.feedbackInput} />
          <PrimaryButton
            label="提交反馈"
            disabled={!feedback.trim()}
            onPress={() => {
              showToast({ title: "反馈已记录", message: "V0.1B 先做本地提交反馈提示，后续接入后台工单。", tone: "success" });
              setFeedback("");
              onBack();
            }}
          />
        </Card>
      ) : null}
      {page === "about" ? (
        <Card>
          <Text style={styles.aboutTitle}>同频跳动</Text>
          <Text style={styles.bodyText}>一个只属于两个人的轻量共同空间。</Text>
          <InfoRow label="版本" value="V0.1B Web MVP" />
          <InfoRow label="阶段" value="增强闭环验证" />
          <InlineNotice tone="info">用户协议与隐私政策草案已随 V0.1B 文档补齐。</InlineNotice>
        </Card>
      ) : null}
    </View>
  );
}

function settingSubtitle(page: SettingPage) {
  const subtitles: Record<SettingPage, string> = {
    profile: "管理你展示给 TA 的资料。",
    couple: "查看你们的情侣空间信息。",
    notifications: "先预留提醒策略，移动端再接入推送。",
    privacy: "控制关系数据和个人状态边界。",
    relationship: "管理当前情侣关系。",
    feedback: "告诉我们哪里不顺手。",
    about: "产品版本和说明。",
  };
  return subtitles[page];
}

function ToggleRow({ label, enabled = false }: { label: string; enabled?: boolean }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={[styles.switchTrack, enabled ? styles.switchTrackActive : null]}>
        <View style={[styles.switchThumb, enabled ? styles.switchThumbActive : null]} />
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.infoRowValue}>{value}</Text>
    </View>
  );
}

function NotificationRow({ notification, onChanged, onOpenLetters }: { notification: Notification; onChanged: () => void; onOpenLetters: () => void }) {
  const { showToast } = useToast();
  async function markRead() {
    const { error } = await supabase.rpc("mark_notification_read", { notification_id: notification.id });
    if (error) {
      showToast({ title: "操作失败", message: error.message, tone: "error" });
      return;
    }
    onChanged();
  }

  async function dismiss() {
    const { error } = await supabase.rpc("dismiss_notification", { notification_id: notification.id });
    if (error) {
      showToast({ title: "关闭失败", message: error.message, tone: "error" });
      return;
    }
    onChanged();
  }

  return (
    <View style={styles.notificationRow}>
      <View style={styles.notificationIcon}>
        {notification.type === "letter" ? <Mail color={colors.accentDark} size={17} /> : <Bell color={colors.accentDark} size={17} />}
      </View>
      <View style={styles.notificationCopy}>
        <Text style={styles.activityTitle}>{notification.title}</Text>
        <Text style={styles.activityMeta}>{notification.body || new Date(notification.created_at).toLocaleString("zh-CN")}</Text>
      </View>
      {notification.type === "letter" ? <SecondaryButton label="查看" onPress={onOpenLetters} /> : null}
      {!notification.read_at ? <SecondaryButton label="已读" onPress={markRead} /> : null}
      <SecondaryButton label="关闭" onPress={dismiss} />
    </View>
  );
}

type MemoryTimelineItem = {
  id: string;
  date: string;
  sortDate: string;
  title: string;
  body: string;
  tag: string;
  filter: MemoryFilter;
  imageTone: string;
  imageLabel: string;
  iconImage?: ImageSourcePropType;
  imageUrl?: string | null;
  photos: MediaFile[];
  letter?: LetterPreview;
  deleteAction?: {
    table: "checkins" | "calendar_events" | "media_files" | "future_letters" | "couple_footprints";
    id: string;
    storagePath?: string;
  };
};

type MemoryFilter = "全部" | "日常" | "留言" | "纪念日" | "相册" | "信件";

function MemoryTimelineCard({
  memory,
  index,
  isLast,
  onPress,
  onUploadPhoto,
  onDeleted,
}: {
  memory: MemoryTimelineItem;
  index: number;
  isLast: boolean;
  onPress?: () => void;
  onUploadPhoto: () => void;
  onDeleted: () => void;
}) {
  const scrollY = useAppScrollY();
  const { showToast } = useToast();
  const focusDistance = Math.abs(scrollY - (178 + index * 156));
  const focus = Math.max(0, 1 - focusDistance / 210);
  const Container = onPress ? Pressable : View;

  async function removeMemory() {
    const action = memory.deleteAction;
    if (!action) {
      return;
    }
    let errorMessage: string | undefined;
    if (action.table === "checkins") {
      const { error } = await supabase.from("checkins").delete().eq("id", action.id);
      errorMessage = error?.message;
    } else if (action.table === "calendar_events") {
      const { error } = await supabase.from("calendar_events").update({ deleted_at: new Date().toISOString() }).eq("id", action.id);
      errorMessage = error?.message;
    } else if (action.table === "media_files") {
      const { error } = await supabase.from("media_files").update({ deleted_at: new Date().toISOString() }).eq("id", action.id);
      if (!error && action.storagePath) {
        await supabase.storage.from(storageBuckets.coupleMedia).remove([action.storagePath]);
      }
      errorMessage = error?.message;
    } else if (action.table === "couple_footprints") {
      const { error } = await supabase.from("couple_footprints").update({ deleted_at: new Date().toISOString() }).eq("id", action.id);
      errorMessage = error?.message;
    } else {
      const { error } = await supabase.rpc("delete_letter", { letter_id: action.id });
      errorMessage = error?.message;
    }
    if (errorMessage) {
      showToast({ title: "删除失败", message: errorMessage, tone: "error" });
      return;
    }
    showToast({ title: "已从记忆中移除", tone: "success" });
    onDeleted();
  }

  const visual = memoryVisualFor(memory.filter);

  return (
    <View style={styles.memoryTimelineItem}>
      <View style={styles.memoryRail}>
        <View style={[styles.memoryDotHalo, { opacity: 0.34 + focus * 0.44, transform: [{ scale: 0.92 + focus * 0.34 }] }]} />
        <View style={[styles.memoryDot, { transform: [{ scale: 1 + focus * 0.22 }, { rotate: `${focus * 22}deg` }], boxShadow: `0 0 ${Math.round(6 + focus * 18)}px rgba(184,95,123,${0.14 + focus * 0.22})` } as never]}>
          <View style={styles.memoryDotCream} />
          <View style={styles.memoryDotRose} />
        </View>
        {isLast ? null : <View style={styles.memoryLine} />}
      </View>
      <Container
        accessibilityRole={onPress ? "button" : undefined}
        onPress={onPress}
        style={[
          styles.memoryCard,
          visual.cardStyle,
          focus > 0.28 ? styles.memoryCardFocused : null,
        ]}
      >
        <MemoryCategoryBadge filter={memory.filter} />
        {memory.filter === "相册" ? <View pointerEvents="none" style={styles.memoryPolaroidFold} /> : null}
        {memory.filter === "纪念日" ? (
          <>
            <View pointerEvents="none" style={styles.memoryAuroraOne} />
            <View pointerEvents="none" style={styles.memoryAuroraTwo} />
          </>
        ) : null}
        <View style={styles.memoryCardContent}>
          <View style={styles.memoryCardHeaderRow}>
            <Text style={[styles.memoryCardTitle, visual.titleStyle]}>{memory.title}</Text>
          </View>
          <Text style={[styles.memoryDate, visual.metaStyle]}>{memory.date} · {memory.tag}</Text>
          <Text style={[styles.memoryCardBody, visual.bodyStyle]}>{memory.body}</Text>
          {memory.deleteAction ? (
            <Pressable accessibilityRole="button" accessibilityLabel="删除这条记忆" onPress={removeMemory} style={styles.memoryDeleteButton}>
              <Trash2 color={colors.accentDark} size={15} />
              <Text style={styles.memoryDeleteText}>删除</Text>
            </Pressable>
          ) : null}
        </View>
        <MemoryPhotoGrid memory={memory} onUploadPhoto={onUploadPhoto} />
      </Container>
    </View>
  );
}

function MemoryPhotoGrid({ memory, onUploadPhoto }: { memory: MemoryTimelineItem; onUploadPhoto: () => void }) {
  const previews = memory.photos.slice(0, 9);
  const canUpload = memory.photos.length < maxMemoryPhotos;
  return (
    <View style={styles.memoryMediaColumn}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="给这条记忆上传图片"
        onPress={canUpload ? onUploadPhoto : undefined}
        style={[styles.memoryPhotoPanel, !previews.length ? { backgroundColor: memory.imageTone } : null]}
      >
        {previews.length ? (
          <View style={styles.memoryPhotoGrid}>
            {previews.map((file) => (
              <View key={file.id} style={styles.memoryPhotoCell}>
                {file.signedUrl ? <Image source={{ uri: file.signedUrl }} style={styles.memoryPhotoImage} resizeMode="cover" /> : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.memoryThumbEmpty}>
            {memory.iconImage ? (
              <Image source={memory.iconImage} style={styles.memoryThumbIcon} resizeMode="contain" />
            ) : (
              <Mail color="#fff" size={30} strokeWidth={2.4} />
            )}
            <Text style={styles.memoryThumbLabel}>{memory.imageLabel}</Text>
          </View>
        )}
        <View style={styles.memoryPhotoCountBadge}>
          {canUpload ? <ImagePlus color={colors.accentDark} size={12} /> : null}
          <Text style={styles.memoryPhotoCountText}>{memory.photos.length}/{maxMemoryPhotos}</Text>
        </View>
      </Pressable>
    </View>
  );
}

function memoryVisualFor(filter: MemoryFilter) {
  if (filter === "留言") {
    return {
      cardStyle: styles.memoryCardWhisper,
      titleStyle: styles.memoryCardWhisperTitle,
      metaStyle: styles.memoryCardWhisperMeta,
      bodyStyle: null,
    };
  }
  if (filter === "信件") {
    return {
      cardStyle: styles.memoryCardLetter,
      titleStyle: styles.memoryCardLetterTitle,
      metaStyle: styles.memoryCardLetterMeta,
      bodyStyle: null,
    };
  }
  if (filter === "相册") {
    return {
      cardStyle: styles.memoryCardPhoto,
      titleStyle: styles.memoryCardPhotoTitle,
      metaStyle: styles.memoryCardPhotoMeta,
      bodyStyle: null,
    };
  }
  if (filter === "纪念日") {
    return {
      cardStyle: styles.memoryCardAnniversary,
      titleStyle: styles.memoryCardAnniversaryTitle,
      metaStyle: styles.memoryCardAnniversaryMeta,
      bodyStyle: styles.memoryCardAnniversaryBody,
    };
  }
  return {
    cardStyle: styles.memoryCardDaily,
    titleStyle: null,
    metaStyle: null,
    bodyStyle: null,
  };
}

function MemoryCategoryBadge({ filter }: { filter: MemoryFilter }) {
  if (filter === "留言") {
    return (
      <View style={[styles.memoryCornerBadge, styles.memoryWhisperBadge]}>
        <MessageCircle color="#7b67ad" size={13} strokeWidth={2.8} />
      </View>
    );
  }
  if (filter === "信件") {
    return (
      <View style={[styles.memoryCornerBadge, styles.memoryWaxBadge]}>
        <View style={styles.memoryWaxInner}>
          <Mail color="#9f6f15" size={12} strokeWidth={2.6} />
        </View>
      </View>
    );
  }
  if (filter === "纪念日") {
    return (
      <View style={[styles.memoryCornerBadge, styles.memoryGiftBadge]}>
        <Heart color="#fff9f1" fill="#fff9f1" size={12} strokeWidth={2.4} />
      </View>
    );
  }
  if (filter === "相册") {
    return (
      <View style={[styles.memoryCornerBadge, styles.memoryPhotoBadge]}>
        <ImagePlus color="#7a8893" size={13} strokeWidth={2.6} />
      </View>
    );
  }
  return (
    <View style={[styles.memoryCornerBadge, styles.memoryDailyBadge]}>
      <Sparkles color={colors.accentDark} size={12} strokeWidth={2.6} />
    </View>
  );
}

function buildMemoryTimeline(
  checkins: Checkin[],
  messages: Message[],
  events: CalendarEvent[],
  mediaFiles: MediaFile[],
  letters: LetterPreview[],
  footprints: CoupleFootprint[],
  currentUserId: string
): MemoryTimelineItem[] {
  const photosForTitle = (title: string) => mediaFiles.filter((file) => file.caption === title).slice(0, maxMemoryPhotos);
  const eventMemories: MemoryTimelineItem[] = events.map((event) => ({
    id: `event-${event.id}`,
    sortDate: event.event_date,
    date: formatMemoryDate(event.event_date),
    title: event.title,
    body: memoryBodyForEvent(event.type),
    tag: eventTypeLabel(event.type),
    filter: memoryFilterForEvent(event.type),
    imageTone: memoryToneForEvent(event.type),
    imageLabel: memoryImageLabelForEvent(event.type),
    iconImage: memoryIconForEvent(event.type),
    photos: photosForTitle(event.title),
    deleteAction: { table: "calendar_events", id: event.id },
  }));
  const checkinMemories: MemoryTimelineItem[] = checkins.slice(0, 4).map((checkin) => {
    const story = splitStory(checkin.content);
    const title = story.body.length > 18 ? `${story.body.slice(0, 18)}...` : story.body;
    return {
      id: `checkin-${checkin.id}`,
      sortDate: checkin.checkin_date,
      date: formatMemoryDate(checkin.checkin_date),
      title,
      body: story.body,
      tag: story.mood ? `今日胶囊 · ${story.mood}` : "今日胶囊",
      filter: "日常",
      imageTone: story.mood.includes("想") ? colors.moodMiss : "#ead8ce",
      imageLabel: story.mood.includes("想") ? "Miss" : "Daily",
      iconImage: story.iconImage,
      photos: photosForTitle(title),
      deleteAction: checkin.user_id === currentUserId ? { table: "checkins", id: checkin.id } : undefined,
    };
  });
  const messageMemories: MemoryTimelineItem[] = messages.slice(0, 3).map((message) => ({
    id: `message-${message.id}`,
    sortDate: message.created_at,
    date: formatMemoryDate(message.created_at),
    title: "留给彼此的话",
    body: message.body,
    tag: "留言",
    filter: "留言" as MemoryFilter,
    imageTone: "#dfd8e6",
    imageLabel: "Note",
    iconImage: capsuleIcons.note,
    photos: photosForTitle("留给彼此的话"),
  }));
  const letterMemories: MemoryTimelineItem[] = letters.slice(0, 6).map((letter) => ({
    id: `letter-${letter.id}`,
    sortDate: letter.deliver_at,
    date: formatMemoryDate(letter.deliver_at),
    title: letter.is_locked ? "有一封信正在路上" : letter.title,
    body: letter.is_locked ? "它已经抵达你的记忆里，只是还没到打开的时间。" : letter.body || "这封信安静地留在这里。",
    tag: letter.is_locked ? "待开启信件" : "信件",
    filter: "信件",
    imageTone: letter.is_locked ? "#d9d0e8" : "#dda2b1",
    imageLabel: letter.is_locked ? "Soon" : "Letter",
    iconImage: capsuleIcons.note,
    photos: photosForTitle(letter.is_locked ? "有一封信正在路上" : letter.title),
    letter,
    deleteAction: letter.author_id === currentUserId ? { table: "future_letters", id: letter.id } : undefined,
  }));
  const footprintMemories: MemoryTimelineItem[] = footprints.slice(0, 6).map((footprint) => ({
    id: `footprint-${footprint.id}`,
    sortDate: footprint.visited_at,
    date: formatMemoryDate(footprint.visited_at),
    title: `去过 ${footprint.title}`,
    body: footprint.note || "你们把这个地方放进了共同足迹里。",
    tag: footprint.latitude !== null && footprint.longitude !== null ? "足迹 · 有坐标" : "足迹",
    filter: "日常" as MemoryFilter,
    imageTone: "#cfe1df",
    imageLabel: "Place",
    iconImage: capsuleIcons.travel,
    photos: photosForTitle(footprint.title),
    deleteAction: footprint.created_by === currentUserId ? { table: "couple_footprints", id: footprint.id } : undefined,
  }));
  const albumMemories: MemoryTimelineItem[] = mediaFiles
    .filter((file) => !file.caption || ![...eventMemories, ...checkinMemories, ...messageMemories, ...letterMemories, ...footprintMemories].some((memory) => memory.title === file.caption || memory.title === `去过 ${file.caption}`))
    .slice(0, 3)
    .map((file) => ({
      id: `media-${file.id}`,
      sortDate: file.created_at,
      date: formatMemoryDate(file.created_at),
      title: file.caption || "相册里的瞬间",
      body: "这张照片被放进你们的相册，也会慢慢沉淀成记忆。",
      tag: "相册",
      filter: "相册" as MemoryFilter,
      imageTone: "#d7cbd9",
      imageLabel: "Photo",
      imageUrl: file.signedUrl,
      photos: [file],
      deleteAction: file.uploader_id === currentUserId ? { table: "media_files", id: file.id, storagePath: file.storage_path } : undefined,
    }));
  const merged = [...eventMemories, ...checkinMemories, ...messageMemories, ...letterMemories, ...footprintMemories, ...albumMemories].sort((a, b) => b.sortDate.localeCompare(a.sortDate));
  return (merged.length > 0 ? merged : fallbackMemories).slice(0, 6);
}

function memoryFilterForEvent(type: CalendarEvent["type"]): MemoryFilter {
  return type === "anniversary" ? "纪念日" : "日常";
}

function formatMemoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replaceAll("-", ".");
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function memoryBodyForEvent(type: CalendarEvent["type"]) {
  if (type === "anniversary") return "没有刻意做很多安排，只是把那天完整留给彼此，就已经足够特别。";
  if (type === "date") return "那天没有排太满的行程，只是一起看风景、散步，把彼此拍进同一段时间。";
  return "很普通的一天，因为被记下来，就变成了以后会想起的一页。";
}

function memoryToneForEvent(type: CalendarEvent["type"]) {
  if (type === "anniversary") return "#d9c4ad";
  if (type === "date") return "#c8d2d7";
  return "#d8c8bd";
}

function memoryImageLabelForEvent(type: CalendarEvent["type"]) {
  if (type === "anniversary") return "One Year";
  if (type === "date") return "Sea Escape";
  return "Memory";
}

function memoryIconForEvent(type: CalendarEvent["type"]) {
  if (type === "anniversary") return capsuleIcons.gift;
  if (type === "date") return capsuleIcons.travel;
  return capsuleIcons.daily;
}

function creationPetOptionFor(petKey?: string | null) {
  return creationPetOptions.find((option) => option.key === petKey) ?? creationPetOptions[0];
}

function creationFoodLabel(foodType: CreationFoodType) {
  return foodType === "premium" ? "鲜食粮" : "日常粮";
}

function creationFoodErrorMessage(message: string) {
  if (message.includes("food_inventory_empty")) return "粮仓里没有这类粮了，可以先去解谜赚奖励再购买。";
  if (message.includes("insufficient_treat_balance")) return "奖励点数还不够，先去解一道题赚点口粮。";
  return message;
}

function creationGameErrorMessage(message: string) {
  if (message.includes("puzzle_reward_already_claimed_today")) return "这道题今天已经领取过奖励了，换一题继续挑战。";
  if (message.includes("puzzle_not_solved")) return "答对后才能领取奖励。";
  return message;
}

function petActionToastTitle(type: "pet" | "clean") {
  if (type === "pet") return "已摸摸小伙伴";
  return "小屋已清洁";
}

function formatCoordinate(value: number) {
  return Number(value).toFixed(4);
}

const fallbackMemories: MemoryTimelineItem[] = [
  {
    id: "fallback-anniversary",
    sortDate: "2026-05-26",
    date: "2026.05.26",
    title: "在一起第一天",
    body: "没有刻意做很多安排，只是把那天完整留给彼此，就已经足够特别。",
    tag: "特别时刻",
    filter: "纪念日",
    imageTone: "#d9c4ad",
    imageLabel: "One Day",
    iconImage: capsuleIcons.gift,
    photos: [],
  },
  {
    id: "fallback-date",
    sortDate: "2026-05-12",
    date: "2026.05.12",
    title: "一起去海边躲开城市",
    body: "那天没有排太满的行程，只是看海、散步、拍下彼此很放松的样子。",
    tag: "旅行",
    filter: "日常",
    imageTone: "#c8d2d7",
    imageLabel: "Sea Escape",
    iconImage: capsuleIcons.travel,
    photos: [],
  },
  {
    id: "fallback-night",
    sortDate: "2026-04-03",
    date: "2026.04.03",
    title: "很普通的一顿深夜宵夜",
    body: "点了最熟悉的那家面，坐在路边吹风，反而成了后来反复想起的一晚。",
    tag: "日常",
    filter: "日常",
    imageTone: "#d8c8bd",
    imageLabel: "Late Supper",
    iconImage: capsuleIcons.meal,
    photos: [],
  },
];

function splitStory(content?: string | null) {
  if (!content) {
    return { mood: "", iconImage: capsuleIcons.daily, iconLabel: "日常", body: "分享了今天的一句话" };
  }
  const [maybeMood, ...rest] = content.split("｜");
  if (rest.length === 0) {
    return { mood: "", iconImage: storyIconImageFromText(content), iconLabel: storyIconLabelFromText(content), body: content };
  }
  const body = rest.length > 1 ? rest.slice(1).join("｜") : rest.join("｜");
  return {
    mood: mockMoodLabels[maybeMood] ?? maybeMood,
    iconImage: storyIconImageFromText(body),
    iconLabel: storyIconLabelFromText(body),
    body,
  };
}

function MiniCalendar({
  checkins,
  messages,
  events,
  letters = [],
}: {
  checkins: Array<{ checkin_date: string; content: string | null }>;
  messages: Message[];
  events: CalendarEvent[];
  letters?: LetterPreview[];
  }) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const gridSize = Math.ceil((firstWeekday + monthEnd.getDate()) / 7) * 7;
  const days = Array.from({ length: gridSize }, (_, index) => {
    const dayNumber = index - firstWeekday + 1;
    return dayNumber >= 1 && dayNumber <= monthEnd.getDate() ? dayNumber : null;
  });
  const isCurrentMonthDate = (value: string) => {
    const date = parseCalendarDate(value);
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
  };
  const eventDays = new Set(
    events.filter((event) => event.type !== "anniversary" && isCurrentMonthDate(event.event_date)).map((event) => Number(event.event_date.slice(-2)))
  );
  const anniversaryDays = new Set(
    events.filter((event) => event.type === "anniversary" && isCurrentMonthDate(event.event_date)).map((event) => Number(event.event_date.slice(-2)))
  );
  const letterDays = new Set(
    letters
      .map((letter) => new Date(letter.deliver_at))
      .filter((date) => date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth())
      .map((date) => date.getDate())
  );
  const storyByDay = new Map<number, ImageSourcePropType>();
  checkins.forEach((item) => {
    if (isCurrentMonthDate(item.checkin_date)) {
      storyByDay.set(Number(item.checkin_date.slice(-2)), splitStory(item.content).iconImage);
    }
  });
  messages.forEach((message) => {
    const date = new Date(message.created_at);
    if (date.getFullYear() !== today.getFullYear() || date.getMonth() !== today.getMonth()) {
      return;
    }
    const day = date.getDate();
    if (!storyByDay.has(day)) {
      storyByDay.set(day, storyIconImageFromText(message.body));
    }
  });
  const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <View style={styles.calendarSurface}>
      <View style={styles.calendarMonthRow}>
        <Text style={styles.calendarMonthText}>{today.getMonth() + 1}月</Text>
        <Text style={styles.calendarMonthMeta}>{today.getFullYear()}</Text>
      </View>
      <View style={styles.weekdayGrid}>
        {weekdayLabels.map((label) => (
          <Text key={label} style={styles.weekdayText}>{label}</Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {days.map((dayNumber, index) => {
          const storyIcon = dayNumber ? storyByDay.get(dayNumber) : undefined;
          const hasEvent = dayNumber ? eventDays.has(dayNumber) : false;
          const hasAnniversary = dayNumber ? anniversaryDays.has(dayNumber) : false;
          const hasLetter = dayNumber ? letterDays.has(dayNumber) : false;
          const isToday = dayNumber === today.getDate();
          return (
            <View key={`${index}-${dayNumber ?? "empty"}`} style={[styles.dayCell, !dayNumber ? styles.dayCellEmpty : null]}>
              {dayNumber ? (
                <View style={[styles.dayNumberBubble, storyIcon || hasEvent || hasLetter || hasAnniversary ? styles.dayCellMarked : null, isToday ? styles.dayCellToday : null]}>
                  <Text style={[styles.dayText, isToday ? styles.dayTextToday : null]}>{dayNumber}</Text>
                  {hasAnniversary ? (
                    <View style={styles.dayHeartMark}>
                      <Heart color={colors.accentDark} fill={colors.accentDark} size={9} strokeWidth={2.6} />
                    </View>
                  ) : null}
                </View>
              ) : null}
              {hasLetter ? (
                <View style={[styles.dayIconSlot, styles.dayCapsuleMark]}>
                  <Mail color={colors.accentDark} size={16} strokeWidth={2.6} />
                </View>
              ) : storyIcon ? (
                <View style={[styles.dayIconSlot, styles.dayCapsuleMark]}>
                  <Image source={storyIcon} style={styles.dayImageIcon} resizeMode="contain" />
                </View>
              ) : hasEvent ? (
                <View style={[styles.dayIconSlot, styles.dayCapsuleMark]}>
                  <Image source={cartoonIcons.calendar} style={styles.dayImageIcon} resizeMode="contain" />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function parseCalendarDate(value: string) {
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  if (year && month && day) {
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

function interactionIconFor(id: string) {
  const icons: Record<string, ImageSourcePropType> = {
    miss: quickInteractionIcons.miss,
    hug: quickInteractionIcons.hug,
    close: quickInteractionIcons.close,
    message: quickInteractionIcons.custom,
  };
  return icons[id];
}

function interactionIconForLabel(label: string) {
  if (label.includes("想")) return quickInteractionIcons.miss;
  if (label.includes("抱")) return quickInteractionIcons.hug;
  if (label.includes("贴")) return quickInteractionIcons.close;
  if (label.includes("自定义") || label.includes("胶囊") || label.includes("留言")) return quickInteractionIcons.custom;
  return undefined;
}

function floatingIconForInteraction(id: string) {
  if (id === "miss") return "♡";
  if (id === "hug") return "♡";
  if (id === "close") return "◐";
  return "✦";
}

function customQuickTone(index: number) {
  const tones = ["#f7e9f1", "#f0edf8", "#fff2df", "#edf5f3", "#f4ece7", "#eef1f8"];
  return tones[index % tones.length];
}

type CapsuleIconMatch = { label: string; image: ImageSourcePropType; keywords: string[] };

function storyIconMatchFromText(text: string): CapsuleIconMatch {
  const normalized = text.replace(/\s/g, "");
  const groups: CapsuleIconMatch[] = [
    { label: "奶茶", image: capsuleIcons.milkTea, keywords: ["奶茶", "珍珠", "波霸", "啵啵", "咖啡", "拿铁", "可可", "饮料", "喝了"] },
    { label: "吃饭", image: capsuleIcons.meal, keywords: ["吃饭", "晚饭", "午饭", "早餐", "火锅", "烧烤", "面", "米饭", "餐厅", "好吃", "甜品", "蛋糕", "布丁", "冰淇淋", "糖", "巧克力"] },
    { label: "电影", image: capsuleIcons.movie, keywords: ["电影", "影院", "追剧", "看剧", "综艺", "电视剧"] },
    { label: "散步", image: capsuleIcons.walk, keywords: ["散步", "走路", "压马路", "逛街", "公园"] },
    { label: "花", image: capsuleIcons.flower, keywords: ["花", "玫瑰", "花束", "花店"] },
    { label: "抱抱", image: capsuleIcons.hug, keywords: ["抱", "拥抱", "贴贴", "亲亲"] },
    { label: "想你", image: capsuleIcons.miss, keywords: ["想你", "想TA", "想他", "想她", "晚安", "月亮"] },
    { label: "留言", image: capsuleIcons.note, keywords: ["留言", "写信", "信", "悄悄话", "想说"] },
    { label: "礼物", image: capsuleIcons.gift, keywords: ["礼物", "惊喜", "快递", "纪念品"] },
    { label: "拍照", image: capsuleIcons.photo, keywords: ["拍照", "照片", "合照", "自拍"] },
    { label: "音乐", image: capsuleIcons.music, keywords: ["音乐", "听歌", "唱歌", "演唱会"] },
    { label: "工作", image: capsuleIcons.work, keywords: ["上班", "加班", "工作", "开会", "学习", "上课", "考试", "读书", "作业"] },
    { label: "在家", image: capsuleIcons.home, keywords: ["回家", "在家", "做饭", "家里"] },
    { label: "旅行", image: capsuleIcons.travel, keywords: ["旅行", "旅游", "出发", "高铁", "飞机", "酒店", "海边", "看海"] },
    { label: "身体", image: capsuleIcons.health, keywords: ["生病", "感冒", "发烧", "药", "医院", "不舒服"] },
    { label: "宠物", image: capsuleIcons.pet, keywords: ["猫", "狗", "宠物"] },
  ];
  return groups.find((group) => group.keywords.some((keyword) => normalized.includes(keyword))) ?? { label: "日常", image: capsuleIcons.daily, keywords: [] };
}

function storyIconImageFromText(text: string) {
  return storyIconMatchFromText(text).image;
}

function storyIconLabelFromText(text: string) {
  return storyIconMatchFromText(text).label;
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusPill}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
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

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onPress} style={styles.backButton}>
      <ChevronLeft color={colors.accentDark} size={20} strokeWidth={2.6} />
    </Pressable>
  );
}

function eventTypeLabel(type: string) {
  const labels: Record<string, string> = {
    anniversary: "纪念日",
    date: "约会",
    todo: "普通",
    other: "普通",
  };
  return labels[type] ?? "普通";
}

const styles = StyleSheet.create({
  stack: {
    gap: 14,
    paddingBottom: 18,
  },
  shellAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 58,
  },
  shellAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.94)",
  },
  shellAvatarSecond: {
    marginLeft: -12,
    backgroundColor: "rgba(248,232,239,0.9)",
  },
  shellHeroTitle: {
    width: 126,
    height: 17,
    borderRadius: 999,
    backgroundColor: "rgba(184,95,123,0.14)",
    marginTop: 2,
  },
  shellHeroNumber: {
    width: 116,
    height: 46,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  shellHeroDate: {
    width: 104,
    height: 14,
    borderRadius: 999,
    backgroundColor: "rgba(129,111,116,0.12)",
  },
  shellSectionTitle: {
    width: 74,
    height: 18,
    borderRadius: 999,
    backgroundColor: "rgba(42,36,38,0.1)",
  },
  shellSmallText: {
    width: 92,
    height: 13,
    borderRadius: 999,
    backgroundColor: "rgba(129,111,116,0.12)",
  },
  shellPill: {
    width: 82,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  shellStatusValue: {
    width: 72,
    height: 20,
    borderRadius: 999,
    backgroundColor: "rgba(184,95,123,0.12)",
  },
  shellInteractionButton: {
    width: "23.6%",
    aspectRatio: 0.82,
    borderRadius: 18,
    backgroundColor: colors.panelSoft,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.08)",
  },
  shellInteractionIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.82)",
  },
  shellInteractionText: {
    width: 42,
    height: 11,
    borderRadius: 999,
    backgroundColor: "rgba(129,111,116,0.12)",
  },
  shellRoundButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.1)",
  },
  shellPhotoThumb: {
    backgroundColor: "rgba(248,232,239,0.76)",
  },
  shellMessageInput: {
    minHeight: 74,
    borderRadius: 20,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.08)",
  },
  shellPrimaryButton: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: "rgba(211,117,150,0.62)",
  },
  memoryScreen: {
    position: "relative",
    gap: 14,
    paddingBottom: 28,
  },
  memoryHero: {
    paddingTop: 2,
    paddingHorizontal: 2,
  },
  memorySubtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
  },
  memoryCalendarCard: {
    gap: 13,
    paddingBottom: 16,
  },
  photoAlbumCard: {
    gap: 14,
  },
  photoAlbumHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  photoAlbumTitleGroup: {
    gap: 2,
  },
  photoAlbumMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  photoAlbumHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  photoAlbumViewAllButton: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoAlbumViewAllText: {
    color: colors.accentDark,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  photoAlbumUploadButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.13)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  photoAlbumGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  photoAlbumThumb: {
    width: "31.8%",
    aspectRatio: 0.84,
    position: "relative",
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.12)",
    paddingTop: 5,
    paddingHorizontal: 5,
    paddingBottom: 15,
    boxShadow: "0 8px 18px rgba(82, 61, 66, 0.08)",
  },
  photoAlbumThumbPressable: {
    width: "100%",
    height: "100%",
    borderRadius: 4,
    overflow: "hidden",
  },
  photoAlbumImage: {
    width: "100%",
    height: "100%",
  },
  photoAlbumMoreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(82,61,66,0.46)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoAlbumMoreText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  photoAlbumDeleteBadge: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(82,61,66,0.78)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoAlbumEmpty: {
    minHeight: 112,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.12)",
    backgroundColor: colors.panelSoft,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    gap: 5,
  },
  photoAlbumEmptyTitle: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  photoAlbumEmptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    textAlign: "center",
  },
  photoPreviewLayer: {
    position: "fixed",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: "calc(18px + env(safe-area-inset-top))" as never,
    paddingBottom: "calc(22px + env(safe-area-inset-bottom))" as never,
  },
  photoPreviewBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(54,38,45,0.52)",
  },
  photoPreviewCard: {
    position: "relative",
    width: "100%",
    maxWidth: 520,
    maxHeight: "100%",
    borderRadius: 32,
    padding: 14,
    backgroundColor: "rgba(255,252,250,0.98)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
    boxShadow: "0 30px 72px rgba(74,47,58,0.3), inset 0 1px 1px rgba(255,255,255,0.88)",
    elevation: 12,
    gap: 12,
  },
  photoPreviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  photoPreviewNavButton: {
    position: "absolute",
    top: "50%",
    width: 38,
    height: 38,
    marginTop: -19,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.12)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 10px 18px rgba(74,47,58,0.14)",
  },
  photoPreviewNavLeft: {
    left: 10,
  },
  photoPreviewNavRight: {
    right: 10,
  },
  photoPreviewNavText: {
    color: colors.accentDark,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: "800",
    marginTop: -2,
  },
  photoPreviewCounterPill: {
    minHeight: 28,
    borderRadius: 999,
    paddingHorizontal: 11,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  photoPreviewCounterText: {
    color: colors.accentDark,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  photoPreviewCloseIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.12)",
  },
  photoPreviewCloseIconText: {
    color: colors.accentDark,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "900",
  },
  photoPreviewFrame: {
    position: "relative",
    width: "100%",
    aspectRatio: 1,
    minHeight: 240,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#f8efe9",
    alignItems: "center",
    justifyContent: "center",
  },
  photoPreviewImage: {
    width: "100%",
    height: "100%",
  },
  photoPreviewMeta: {
    gap: 4,
    paddingHorizontal: 4,
  },
  photoPreviewTitle: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  photoPreviewBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  photoPreviewActions: {
    flexDirection: "row",
    gap: 10,
  },
  photoPreviewDelete: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.12)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  photoPreviewDeleteText: {
    color: colors.accentDark,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  photoPreviewClose: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 14px 24px rgba(184,95,123,0.2)",
  },
  photoPreviewCloseText: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  photoPreviewStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoPreviewStripThumb: {
    width: 54,
    height: 54,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.08)",
    backgroundColor: colors.panelSoft,
  },
  photoPreviewStripThumbActive: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  photoPreviewStripImage: {
    width: "100%",
    height: "100%",
  },
  memoryFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    boxShadow: "inset 0 1px 1px rgba(255,255,255,0.85), 0 10px 22px rgba(82,61,66,0.05)",
  },
  memoryFilterChip: {
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.56)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
    boxShadow: "0 5px 10px rgba(82,61,66,0.04)",
  },
  memoryFilterChipActive: {
    backgroundColor: colors.accent,
    borderColor: "rgba(255,255,255,0.86)",
    transform: [{ scale: 1.04 }, { rotate: "-1deg" }],
    boxShadow: "0 9px 16px rgba(184,95,123,0.2), inset 0 1px 2px rgba(255,255,255,0.72)",
  },
  memoryFilterText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  memoryFilterTextActive: {
    color: "#fff",
  },
  memoryTimeline: {
    gap: 0,
    paddingTop: 2,
  },
  memoryTimelineItem: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  memoryRail: {
    width: 30,
    alignItems: "center",
    position: "relative",
  },
  memoryDotHalo: {
    position: "absolute",
    top: 20,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,220,232,0.62)",
  },
  memoryDot: {
    width: 17,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#fff7e7",
    marginTop: 29,
    zIndex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.92)",
    overflow: "hidden",
    flexDirection: "row",
  },
  memoryDotCream: {
    flex: 1,
    backgroundColor: "#fff7e1",
  },
  memoryDotRose: {
    flex: 1,
    backgroundColor: "#ffd5e0",
  },
  memoryLine: {
    width: 4,
    flex: 1,
    borderRadius: 999,
    backgroundColor: colors.accent,
    backgroundImage: "linear-gradient(180deg, #dd7897 0%, #c798d4 100%)" as never,
    marginTop: 8,
    marginBottom: -1,
    boxShadow: "0 0 10px rgba(184,95,123,0.14)",
  },
  memoryCard: {
    position: "relative",
    flex: 1,
    minHeight: 136,
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
    padding: 18,
    borderRadius: 28,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.09)",
    boxShadow: "0 14px 34px rgba(82, 61, 66, 0.06)",
    elevation: 2,
    overflow: "hidden",
  },
  memoryCardDaily: {
    backgroundColor: "rgba(255,254,250,0.98)",
    backgroundImage: "linear-gradient(135deg, rgba(255,253,249,0.98), rgba(255,246,250,0.95))" as never,
  },
  memoryCardWhisper: {
    backgroundColor: "rgba(250,247,255,0.98)",
    backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(239,233,249,0.94))" as never,
    borderColor: "rgba(151,124,196,0.18)",
  },
  memoryCardLetter: {
    backgroundColor: "rgba(255,252,242,0.98)",
    backgroundImage: "linear-gradient(135deg, rgba(255,255,250,0.98), rgba(255,240,204,0.86))" as never,
    borderColor: "rgba(218,171,82,0.2)",
  },
  memoryCardPhoto: {
    backgroundColor: "rgba(250,253,255,0.98)",
    backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.99), rgba(231,243,247,0.92))" as never,
    borderColor: "rgba(124,148,170,0.16)",
  },
  memoryCardAnniversary: {
    backgroundColor: "rgba(255,232,232,0.98)",
    backgroundImage: "linear-gradient(135deg, rgba(255,241,231,0.98) 0%, rgba(255,214,223,0.96) 45%, rgba(247,191,202,0.94) 100%)" as never,
    borderColor: "rgba(198,88,112,0.26)",
    boxShadow: "0 22px 46px rgba(198,88,112,0.16), inset 0 1px 2px rgba(255,255,255,0.66)",
  },
  memoryCardFocused: {
    borderColor: "rgba(184,95,123,0.2)",
    boxShadow: "0 18px 38px rgba(82, 61, 66, 0.09)",
  },
  memoryCardContent: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  memoryDate: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  memoryCardWhisperMeta: {
    color: "#8973b6",
  },
  memoryCardLetterMeta: {
    color: "#9d761f",
  },
  memoryCardPhotoMeta: {
    color: "#6f8291",
  },
  memoryCardAnniversaryMeta: {
    color: "rgba(128,70,56,0.78)",
    fontWeight: "800",
  },
  memoryCardTitle: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
  },
  memoryCardWhisperTitle: {
    color: "#5f4d86",
  },
  memoryCardLetterTitle: {
    color: "#7f5811",
  },
  memoryCardPhotoTitle: {
    color: "#445d6c",
  },
  memoryCardAnniversaryTitle: {
    color: "#9a4e43",
    fontWeight: "900",
    textShadowColor: "rgba(255,255,255,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  memoryCardBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "500",
  },
  memoryCardAnniversaryBody: {
    color: "#8f5a4e",
    fontWeight: "700",
  },
  memoryCornerBadge: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.82)",
    boxShadow: "0 8px 14px rgba(82,61,66,0.08)",
  },
  memoryWhisperBadge: {
    backgroundColor: "rgba(237,231,250,0.92)",
    borderTopLeftRadius: 9,
  },
  memoryWaxBadge: {
    backgroundColor: "#e6b64f",
    borderRadius: 999,
    boxShadow: "0 8px 14px rgba(176,122,23,0.16), inset 0 1px 2px rgba(255,255,255,0.48)",
  },
  memoryWaxInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,239,189,0.54)",
  },
  memoryGiftBadge: {
    backgroundColor: "#c77770",
    boxShadow: "0 8px 18px rgba(154,78,67,0.2), inset 0 1px 2px rgba(255,255,255,0.45)",
  },
  memoryPhotoBadge: {
    backgroundColor: "rgba(230,242,247,0.94)",
  },
  memoryDailyBadge: {
    backgroundColor: "rgba(255,226,232,0.92)",
  },
  memoryPolaroidFold: {
    position: "absolute",
    right: -1,
    top: 40,
    width: 24,
    height: 58,
    backgroundColor: "rgba(255,255,255,0.76)",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(124,148,170,0.16)",
    transform: [{ skewY: "-12deg" }],
    boxShadow: "-6px 0 14px rgba(82,61,66,0.05)",
    zIndex: 1,
  },
  memoryAuroraOne: {
    position: "absolute",
    width: 150,
    height: 96,
    borderRadius: 999,
    left: -38,
    top: -34,
    backgroundColor: "rgba(255,247,201,0.38)",
    transform: [{ rotate: "-12deg" }],
  },
  memoryAuroraTwo: {
    position: "absolute",
    width: 170,
    height: 104,
    borderRadius: 999,
    right: -48,
    bottom: -42,
    backgroundColor: "rgba(255,183,202,0.42)",
    transform: [{ rotate: "14deg" }],
  },
  memoryDeleteButton: {
    alignSelf: "flex-start",
    minHeight: 32,
    borderRadius: 999,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.12)",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  memoryDeleteText: {
    color: colors.accentDark,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  memoryMediaColumn: {
    width: 86,
    alignItems: "flex-end",
    gap: 10,
  },
  memoryTag: {
    color: colors.muted,
    backgroundColor: "rgba(238,234,230,0.9)",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 11,
    paddingVertical: 6,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
  memoryThumb: {
    width: 78,
    height: 116,
    borderRadius: 999,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.86)",
    boxShadow: "0 10px 20px rgba(82,61,66,0.12)",
  },
  memoryThumbIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
  },
  memoryThumbPhoto: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  memoryPhotoPanel: {
    position: "relative",
    width: 84,
    minHeight: 108,
    borderRadius: 22,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    padding: 7,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.86)",
    boxShadow: "0 10px 20px rgba(82,61,66,0.12)",
  },
  memoryPhotoGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
  },
  memoryPhotoCell: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  memoryPhotoImage: {
    width: "100%",
    height: "100%",
  },
  memoryThumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  memoryPhotoCountBadge: {
    position: "absolute",
    right: 5,
    bottom: 5,
    minHeight: 22,
    borderRadius: 999,
    paddingHorizontal: 6,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  memoryPhotoCountText: {
    color: colors.accentDark,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
  },
  memoryThumbLabel: {
    color: "#fff",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.22)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    textAlign: "center",
  },
  memoryActionDock: {
    position: "fixed" as never,
    right: "max(2vw, calc(50% - 224px))" as never,
    bottom: "calc(96px + env(safe-area-inset-bottom))" as never,
    alignItems: "center",
    gap: 10,
    zIndex: 2,
  },
  memoryActionMini: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.18)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 12px 24px rgba(82, 61, 66, 0.12)",
  },
  creationFloatingDock: {
    position: "fixed" as never,
    right: "max(2vw, calc(50% - 224px))" as never,
    bottom: "calc(224px + env(safe-area-inset-bottom))" as never,
    alignItems: "center",
    zIndex: 2,
  },
  creationHeroCard: {
    overflow: "hidden",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    backgroundImage: "linear-gradient(135deg, rgba(255,246,239,0.98), rgba(250,231,239,0.72) 46%, rgba(236,244,246,0.72))" as never,
    borderColor: "rgba(255,255,255,0.86)",
    boxShadow: "0 18px 42px rgba(116,74,89,0.08), inset 0 1px 2px rgba(255,255,255,0.92)",
  },
  creationHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  creationHeroBadge: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 11,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  creationHeroBadgeText: {
    color: colors.accentDark,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  creationHeroTitle: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
  },
  creationHeroText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  creationPetStage: {
    position: "relative",
    minHeight: 260,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#fff4ef",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    boxShadow: "0 20px 42px rgba(82,61,66,0.12)",
  },
  creationPetHeroImage: {
    width: "100%",
    height: 260,
  },
  creationPetStageShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 96,
    backgroundImage: "linear-gradient(180deg, rgba(50,35,36,0), rgba(50,35,36,0.38))" as never,
  },
  creationPetInfoPill: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    gap: 2,
  },
  creationPetInfoTitle: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  creationPetInfoMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  creationMeters: {
    flexDirection: "row",
    gap: 8,
  },
  creationMeter: {
    flex: 1,
    minWidth: 0,
    borderRadius: 17,
    padding: 9,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.09)",
    gap: 6,
  },
  creationMeterHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  creationMeterLabel: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
  },
  creationMeterValue: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
  },
  creationMeterTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(129,111,116,0.12)",
    overflow: "hidden",
  },
  creationMeterFill: {
    height: "100%",
    borderRadius: 999,
  },
  creationResourceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  creationResourcePill: {
    flexGrow: 1,
    minWidth: "30%",
    minHeight: 46,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.74)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.1)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  creationResourceIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  creationResourceText: {
    minWidth: 0,
    gap: 1,
  },
  creationResourceLabel: {
    color: colors.faint,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  creationResourceValue: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
  },
  creationLevelText: {
    color: colors.accentDark,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  creationActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  creationPetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  creationPetOption: {
    position: "relative",
    width: "48%",
    minWidth: 142,
    flexGrow: 1,
    borderRadius: 22,
    backgroundColor: "#fffafb",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.1)",
    overflow: "hidden",
    boxShadow: "0 10px 24px rgba(82,61,66,0.06)",
  },
  creationPetOptionActive: {
    borderColor: "rgba(184,95,123,0.34)",
    backgroundColor: "#fff2f5",
    boxShadow: "0 14px 28px rgba(184,95,123,0.12)",
  },
  creationPetOptionPressed: {
    opacity: 0.88,
    transform: [{ translateY: 1 }],
  },
  creationPetOptionImage: {
    width: "100%",
    height: 118,
  },
  creationPetOptionText: {
    padding: 11,
    gap: 2,
  },
  creationPetOptionTitle: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  creationPetOptionMeta: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
  },
  creationPetCheck: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 16px rgba(184,95,123,0.22)",
  },
  creationPetCheckText: {
    color: "#fff",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
  },
  creationPetDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  creationDecorRow: {
    flexDirection: "row",
    gap: 8,
  },
  creationDecorInput: {
    flex: 1,
    minWidth: 0,
  },
  footprintForm: {
    gap: 10,
  },
  footprintNoteInput: {
    minHeight: 88,
    paddingTop: 14,
    textAlignVertical: "top",
  },
  footprintCoordRow: {
    flexDirection: "row",
    gap: 8,
  },
  footprintCoordInput: {
    flex: 1,
    minWidth: 0,
  },
  creationFootprintList: {
    gap: 9,
  },
  creationFootprintItem: {
    borderRadius: 20,
    padding: 12,
    backgroundColor: "#fff9fb",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.09)",
    gap: 10,
  },
  creationFootprintText: {
    gap: 3,
  },
  creationFootprintTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  creationFootprintMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  creationFootprintCoords: {
    color: colors.faint,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  creationFootprintActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  creationShopGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  creationFoodCard: {
    flex: 1,
    minWidth: 148,
    borderRadius: 22,
    padding: 13,
    backgroundColor: "#fff9fb",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.09)",
    gap: 8,
  },
  creationFoodTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  creationFoodIcon: {
    width: 36,
    height: 36,
    borderRadius: 16,
    backgroundColor: colors.panelSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  creationFoodCount: {
    color: colors.accentDark,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  creationFoodTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  creationFoodDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  creationGameCard: {
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  creationPuzzleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  creationPuzzleBadge: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accentSoft,
  },
  creationPuzzleBadgeText: {
    color: colors.accentDark,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  creationPuzzleQuestion: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "900",
  },
  creationPuzzleOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  creationPuzzleOption: {
    flexGrow: 1,
    minWidth: "30%",
    minHeight: 42,
    borderRadius: 17,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fffafb",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.1)",
  },
  creationPuzzleOptionActive: {
    backgroundColor: colors.accentSoft,
    borderColor: "rgba(184,95,123,0.28)",
  },
  creationPuzzleOptionText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  creationPuzzleOptionTextActive: {
    color: colors.accentDark,
  },
  creationActionItem: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(184,95,123,0.08)",
    paddingVertical: 10,
    gap: 2,
  },
  creationActionTitle: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  creationActionMeta: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  heroCard: {
    alignItems: "center",
    overflow: "hidden",
    paddingTop: 14,
    paddingBottom: 10,
    gap: 4,
    // 高级流砂微发光底纹
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    backgroundImage: "radial-gradient(circle at 10% 20%, rgba(255, 211, 226, 0.22) 0%, rgba(255, 255, 255, 0.2) 90%)" as never,
    boxShadow: "0 20px 48px rgba(184, 95, 123, 0.08), inset 0 1px 1px rgba(255,255,255,0.9)",
  },
  heroRelationText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
    marginTop: 0,
  },
  loveNumberRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
  },
  loveNumber: {
    color: colors.accentDark,
    fontSize: 46,
    lineHeight: 50,
    fontWeight: "800",
    textAlign: "center",
    // 霓虹发光投影
    textShadowColor: "rgba(223, 79, 121, 0.18)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  loveUnit: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  startedText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  countdownText: {
    color: colors.accentDark,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "800",
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "800",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  capsuleIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  centerTitle: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  bodyText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
  },
  profileHero: {
    alignItems: "center",
    gap: 10,
  },
  moodStatusCard: {
    paddingVertical: 8,
    gap: 6,
  },
  loveLetterEntryCard: {
    width: "100%",
    minHeight: 62,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 6,
    // 改为极轻半透明毛玻璃 Wash，微带渐变
    backgroundColor: "rgba(255, 255, 255, 0.42)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.78)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 14px 30px rgba(184, 95, 123, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.8)",
  },
  loveLetterEntryCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
    backgroundColor: "rgba(255, 255, 255, 0.52)",
  },
  loveLetterEntryIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    // 纯白信封底座，浮雕影
    backgroundColor: "rgba(255, 255, 255, 0.84)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.9)",
    boxShadow: "0 5px 12px rgba(184, 95, 123, 0.05)",
  },
  loveLetterEntryHeart: {
    position: "absolute",
    right: -3,
    top: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
    boxShadow: "0 2px 6px rgba(223, 79, 121, 0.22)",
  },
  loveLetterEntryCopy: {
    flex: 1,
    gap: 2,
  },
  loveLetterEntryTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  loveLetterEntryText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  loveLetterEntryAction: {
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  loveLetterEntryActionText: {
    color: colors.accentDark,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
  },
  profileName: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
  },
  feedbackInput: {
    minHeight: 150,
    paddingTop: 15,
    textAlignVertical: "top",
  },
  aboutTitle: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    textAlign: "center",
  },
  toggleRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  settingLabel: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  switchTrack: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#eadfe1",
    padding: 3,
    justifyContent: "center",
  },
  switchTrackActive: {
    backgroundColor: colors.accent,
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  switchThumbActive: {
    transform: [{ translateX: 20 }],
  },
  infoRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(184,95,123,0.08)",
  },
  infoRowValue: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  profileStatsGrid: {
    width: "100%",
    flexDirection: "row",
    gap: 8,
  },
  statusGrid: {
    flexDirection: "row",
    gap: 10,
  },
  interactionCountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  interactionCountText: {
    color: colors.accentDark,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
  },
  homeMessageInput: {
    minHeight: 52,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  homeMessageList: {
    gap: 8,
  },
  notificationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(184,95,123,0.08)",
  },
  notificationIcon: {
    width: 36,
    height: 36,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  todayCapsuleBody: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 20,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.08)",
    padding: 12,
  },
  todayCapsuleBodyGuide: {
    borderColor: "rgba(184,95,123,0.14)",
  },
  todayCapsuleBodyPressed: {
    transform: [{ scale: 0.985 }],
  },
  moodOrb: {
    width: 58,
    height: 50,
    borderRadius: 25,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  moodOrbText: {
    fontSize: 20,
    lineHeight: 24,
  },
  moodOrbImage: {
    width: 26,
    height: 26,
    borderRadius: 10,
  },
  todayCapsuleCopy: {
    flex: 1,
    gap: 5,
  },
  todayCapsuleLabel: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  todayCapsuleText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  capsuleStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  capsuleStatusText: {
    color: colors.accentDark,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
  },
  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: 17,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  infoImageIcon: {
    width: 42,
    height: 42,
    resizeMode: "contain",
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    resizeMode: "contain",
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  infoValue: {
    color: colors.accentDark,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
  },
  statusPill: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#fff9f9",
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 1,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.08)",
  },
  statusLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  statusValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  interactionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    columnGap: 0,
    rowGap: 6,
  },
  customQuickComposer: {
    gap: 10,
    borderRadius: 24,
    padding: 12,
    backgroundColor: "#fff9fb",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.1)",
  },
  customQuickInput: {
    minHeight: 46,
    paddingVertical: 12,
  },
  customQuickActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  floatingReaction: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 52,
    minHeight: 68,
    borderRadius: 26,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 4,
    boxShadow: "0 16px 34px rgba(113,81,91,0.14)",
  },
  floatingReactionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 18,
    backgroundColor: colors.panelSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  floatingReactionIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  floatingReactionImage: {
    width: 32,
    height: 32,
    borderRadius: 12,
  },
  floatingReactionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  floatingReactionTitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  floatingReactionText: {
    color: colors.accentDark,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  floatingReactionTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(184,95,123,0.12)",
    overflow: "hidden",
    marginTop: 3,
  },
  floatingReactionTrackFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  floatingReactionDots: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  floatingReactionDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  moodPopupLayer: {
    position: "fixed" as never,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 16,
    paddingTop: "calc(18px + env(safe-area-inset-top))" as never,
    zIndex: 20,
    pointerEvents: "box-none" as never,
  },
  moodPopupCard: {
    position: "relative",
    width: "100%",
    maxWidth: 390,
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.13)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    boxShadow: "0 14px 30px rgba(82, 61, 66, 0.16)",
    elevation: 9,
  },
  moodPopupGlow: {
    position: "absolute",
    width: 210,
    height: 132,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    opacity: 0.5,
    right: -54,
    top: -42,
    transform: [{ rotate: "-8deg" }],
  },
  moodPopupIconWrap: {
    position: "relative",
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  moodPopupIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
  },
  moodPopupCopy: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  moodPopupEyebrow: {
    color: colors.accentDark,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  moodPopupTitle: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  moodPopupBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  moodPopupPrimaryButton: {
    width: 38,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 16px rgba(184, 95, 123, 0.16)",
  },
  moodPopupPrimaryButtonWide: {
    position: "relative",
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    boxShadow: "0 8px 16px rgba(184, 95, 123, 0.16)",
  },
  moodPopupPrimaryText: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  letterPopupLayer: {
    position: "fixed",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingTop: "calc(24px + env(safe-area-inset-top))" as never,
    paddingBottom: "calc(92px + env(safe-area-inset-bottom))" as never,
    backgroundColor: "rgba(53,38,45,0.18)",
    zIndex: 30,
    pointerEvents: "box-none",
  },
  letterPopupCard: {
    position: "relative",
    width: "100%",
    maxWidth: 390,
    minHeight: 386,
    overflow: "hidden",
    borderRadius: 34,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 18,
    backgroundColor: "rgba(255,252,250,0.98)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.78)",
    alignItems: "center",
    gap: 9,
    boxShadow: "0 28px 70px rgba(74,47,58,0.24), inset 0 1px 1px rgba(255,255,255,0.92)",
    elevation: 12,
  },
  letterPopupHalo: {
    position: "absolute",
    width: 300,
    height: 230,
    borderRadius: 150,
    top: -58,
    backgroundImage: "radial-gradient(circle at 50% 48%, rgba(255,230,238,0.92), rgba(255,245,223,0.56) 42%, rgba(238,232,246,0.25) 70%, rgba(255,255,255,0) 100%)",
  },
  letterPopupSparkOne: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    right: 28,
    top: 54,
    backgroundColor: "rgba(255,240,201,0.62)",
  },
  letterPopupSparkTwo: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    left: 30,
    top: 112,
    backgroundColor: "rgba(238,232,246,0.72)",
  },
  letterPopupStamp: {
    position: "absolute",
    right: 28,
    top: 28,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.82)",
    boxShadow: "0 10px 20px rgba(184,95,123,0.2)",
    zIndex: 2,
  },
  letterPopupEnvelope: {
    position: "relative",
    width: 142,
    height: 100,
    borderRadius: 30,
    marginTop: 8,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    boxShadow: "0 22px 42px rgba(82,61,66,0.16)",
    transform: [{ rotate: "-2deg" }],
    zIndex: 1,
  },
  letterPopupFlap: {
    position: "absolute",
    left: -14,
    right: -14,
    top: -48,
    height: 96,
    backgroundColor: "#ffe5dc",
    borderRadius: 38,
    transform: [{ rotate: "8deg" }],
  },
  letterPopupPaper: {
    position: "absolute",
    top: 14,
    width: 88,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  letterPopupPaperText: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  letterPopupEyebrow: {
    position: "relative",
    color: colors.accentDark,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    textAlign: "center",
    zIndex: 1,
  },
  letterPopupTitle: {
    position: "relative",
    color: colors.ink,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "900",
    textAlign: "center",
    zIndex: 1,
  },
  letterPopupBody: {
    position: "relative",
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center",
    maxWidth: 280,
    zIndex: 1,
  },
  letterPopupActions: {
    position: "relative",
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    zIndex: 1,
  },
  letterPopupPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    boxShadow: "0 14px 24px rgba(184,95,123,0.2)",
  },
  letterPopupPrimaryText: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  letterPopupSecondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.12)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  letterPopupSecondaryText: {
    color: colors.accentDark,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  capsulePreviewCard: {
    position: "relative",
    overflow: "hidden",
    minHeight: 156,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    backgroundColor: "rgba(255,253,251,0.98)",
    borderColor: "rgba(255,255,255,0.82)",
    boxShadow: "0 14px 30px rgba(116,74,89,0.055), inset 0 1px 2px rgba(255,255,255,0.94)",
  },
  capsulePreviewGlow: {
    position: "absolute",
    width: 150,
    height: 86,
    borderRadius: 999,
    opacity: 0.18,
    transform: [{ translateY: -2 }],
  },
  capsulePreviewMoodWash: {
    position: "absolute",
    width: 128,
    height: 74,
    borderRadius: 999,
    opacity: 0.16,
    transform: [{ translateY: -6 }],
  },
  capsulePreviewImage: {
    width: 36,
    height: 36,
    borderRadius: 14,
  },
  capsulePreviewTitle: {
    position: "relative",
    color: colors.ink,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    marginTop: 2,
  },
  capsulePreviewText: {
    position: "relative",
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    textAlign: "center",
  },
  capsuleComposerHeader: {
    gap: 5,
  },
  capsuleComposerHint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  moodOptionalBlock: {
    gap: 10,
  },
  moodOptionalTitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  customMoodInput: {
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  linkText: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "800",
  },
  activityRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  activityDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.peach,
    marginTop: 7,
  },
  activityIconSlot: {
    width: 32,
    height: 32,
    borderRadius: 13,
    backgroundColor: colors.panelSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  activityIconImage: {
    width: 30,
    height: 30,
    borderRadius: 11,
  },
  activityText: {
    flex: 1,
    gap: 2,
  },
  activityTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  activityMeta: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 17,
  },
  storyInput: {
    minHeight: 124,
    paddingTop: 14,
    paddingBottom: 14,
    textAlignVertical: "top",
    backgroundColor: "transparent",
    borderWidth: 0,
    boxShadow: "none",
    outlineStyle: "none" as never,
    paddingHorizontal: 0,
  },
  createCapsuleCard: {
    gap: 14,
    padding: 18,
    backgroundColor: "rgba(255,253,251,0.96)",
    borderColor: "rgba(255,255,255,0.82)",
    boxShadow: "0 18px 40px rgba(82,61,66,0.07), inset 0 1px 1px rgba(255,255,255,0.92)",
  },
  emotionCandyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 9,
    overflow: "visible",
  },
  emotionCandyMotion: {
    width: "48.5%",
    overflow: "visible",
  },
  emotionCandy: {
    position: "relative",
    minHeight: 43,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 10,
  },
  emotionCandyShine: {
    position: "absolute",
    left: 16,
    right: 34,
    top: 7,
    height: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  emotionCandyLowerShade: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: -10,
    height: 18,
    borderRadius: 999,
    opacity: 0.08,
  },
  emotionCandyActiveRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1.5,
    opacity: 0.62,
  },
  emotionCandyText: {
    position: "relative",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  foldedMoodNote: {
    position: "relative",
    minHeight: 134,
    borderRadius: 24,
    backgroundColor: "#fff0ed",
    borderWidth: 1,
    borderColor: "rgba(222,128,154,0.18)",
    overflow: "hidden",
    paddingLeft: 18,
    paddingRight: 44,
    boxShadow: "0 12px 26px rgba(184,95,123,0.08), inset 0 1px 2px rgba(255,255,255,0.84)",
  },
  foldedMoodNoteFocused: {
    borderColor: "rgba(215,123,150,0.58)",
    boxShadow: "0 0 0 4px rgba(215,123,150,0.13), 0 0 28px rgba(215,123,150,0.22), inset 0 1px 2px rgba(255,255,255,0.9)",
  },
  foldedMoodNoteFold: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 42,
    height: 42,
    backgroundColor: "#ffe1dd",
    borderBottomLeftRadius: 14,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(222,128,154,0.18)",
  },
  foldedMoodNoteFoldShadow: {
    position: "absolute",
    right: 28,
    top: 8,
    width: 22,
    height: 38,
    borderRadius: 999,
    backgroundColor: "rgba(184,95,123,0.08)",
    transform: [{ rotate: "-35deg" }],
  },
  capsuleSaveFlight: {
    position: "absolute",
    left: 30,
    bottom: 380,
    width: 66,
    height: 42,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
    boxShadow: "0 14px 28px rgba(184,95,123,0.16)",
  },
  capsuleSaveFlightImage: {
    width: 24,
    height: 24,
    borderRadius: 9,
  },
  capsuleSaveTarget: {
    position: "absolute",
    right: 40,
    bottom: 586,
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.16)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
    boxShadow: "0 10px 22px rgba(113,81,91,0.1)",
  },
  capsuleSaveTargetDay: {
    color: colors.accentDark,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: "800",
  },
  capsuleSaveTargetText: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
  },
  emptyStatePressable: {
    borderRadius: 28,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepNumber: {
    color: colors.accentDark,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  messageInput: {
    minHeight: 96,
    paddingTop: 15,
    textAlignVertical: "top",
  },
  letterInput: {
    minHeight: 180,
    paddingTop: 15,
    textAlignVertical: "top",
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
  },
  letterComposeHero: {
    alignItems: "center",
    gap: 14,
    overflow: "hidden",
  },
  letterEnvelopePreview: {
    width: 94,
    height: 64,
    borderRadius: 24,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  letterReminderCard: {
    position: "relative",
    overflow: "hidden",
    alignItems: "center",
    minHeight: 420,
    paddingVertical: 28,
    gap: 12,
  },
  letterGlow: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: colors.accentSoft,
    opacity: 0.58,
    top: 34,
  },
  letterSenderRow: {
    position: "relative",
    zIndex: 1,
  },
  letterEnvelope: {
    position: "relative",
    zIndex: 1,
    width: 140,
    height: 96,
    borderRadius: 34,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.86)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 22px 42px rgba(82,61,66,0.14)",
    transform: [{ rotate: "-3deg" }],
  },
  letterEnvelopeOpen: {
    backgroundColor: "#fff",
    transform: [{ rotate: "2deg" }, { scale: 1.03 }],
  },
  letterReminderTitle: {
    position: "relative",
    zIndex: 1,
    color: colors.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
    textAlign: "center",
  },
  letterReminderMeta: {
    position: "relative",
    zIndex: 1,
    color: colors.accentDark,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  letterReminderBody: {
    position: "relative",
    zIndex: 1,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 25,
    fontWeight: "500",
    textAlign: "center",
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 24,
    padding: 18,
    width: "100%",
  },
  letterActionRow: {
    position: "relative",
    zIndex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 8,
  },
  calendarSurface: {
    gap: 10,
    borderRadius: 24,
    backgroundColor: "#fffafb",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.08)",
    padding: 12,
  },
  calendarMonthRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  calendarMonthText: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
  },
  calendarMonthMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "800",
  },
  weekdayGrid: {
    flexDirection: "row",
  },
  weekdayText: {
    width: "14.285%",
    color: colors.accentDark,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  dayCell: {
    width: "14.285%",
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "flex-start",
    borderWidth: 0,
    borderColor: "transparent",
    gap: 3,
    paddingTop: 2,
  },
  dayCellEmpty: {
    opacity: 0,
  },
  dayNumberBubble: {
    position: "relative",
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCellMarked: {
    backgroundColor: "rgba(255,255,255,0.8)",
  },
  dayCellToday: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.14)",
  },
  dayText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  dayTextToday: {
    color: colors.accentDark,
    fontWeight: "900",
  },
  dayHeartMark: {
    position: "absolute",
    right: -2,
    top: -2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  dayIconSlot: {
    width: 24,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCapsuleMark: {
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.14)",
  },
  dayImageIcon: {
    width: 18,
    height: 18,
    borderRadius: 7,
    resizeMode: "contain",
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accentDark,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    flex: 1,
    minWidth: "42%",
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.76)",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  typeChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: "rgba(184,95,123,0.2)",
  },
  typeText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800",
  },
  typeTextActive: {
    color: colors.ink,
  },
  remindRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  checkboxActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  quietDangerArea: {
    opacity: 0.72,
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  compactDanger: {
    gap: 10,
    marginTop: 8,
    opacity: 0.78,
  },
  quietDangerText: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 18,
  },
  // 1. 双人同频并排卡片样式
  doubleCapsulesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
    paddingHorizontal: 4,
    gap: 8,
  },
  sideCapsuleContainer: {
    flex: 1,
    minHeight: 110,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.12)",
    overflow: "hidden",
    boxShadow: "0 10px 24px rgba(82, 61, 66, 0.05)",
  },
  sideCapsuleEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 110,
    backgroundColor: "rgba(255, 255, 255, 0.38)",
    padding: 10,
  },
  sideCapsuleEmptyText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "800",
  },
  sideCapsuleWaiting: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 110,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
    padding: 10,
  },
  sideCapsuleWaitingText: {
    color: colors.faint,
    fontSize: 13,
    fontWeight: "700",
    fontStyle: "italic",
  },
  doubleCapsulesConnector: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderWidth: 1.5,
    borderColor: "rgba(184,95,123,0.14)",
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    left: "50%",
    marginLeft: -12,
    zIndex: 3,
    boxShadow: "0 4px 10px rgba(184, 95, 123, 0.08)",
  },
  // 2. 记忆卡片头部徽章样式
  memoryCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  memoryBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  memoryBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
});
