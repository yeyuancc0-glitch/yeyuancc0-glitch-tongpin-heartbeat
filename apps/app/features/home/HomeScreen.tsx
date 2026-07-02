import { useEffect, useRef, useState } from "react";
import { Alert, Image, Platform, Text, View } from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  Heart,
  Mail,
  Sparkles,
  Star,
} from "lucide-react-native";

import type { CreationPetStageReaction, LivePetVisualAction } from "@/features/pet/components/PetStage";
import { usePetRealtime } from "@/features/pet/hooks/usePetRealtime";
import { usePetUserSettings } from "@/features/pet/userPetSettings";
import { GlobalPetLayer } from "@/features/pet-world/components/GlobalPetLayer";
import { usePetWorldRoaming } from "@/features/pet-world/hooks/usePetWorldRoaming";
import { petHumanLine } from "@/features/pet-world/logic/petExpression";
import { normalizePetWorldSurface, petWorldSurfaceForAppState } from "@/features/pet-world/logic/petWorldRoutes";
import { markPetSurfaceSeen, settlePetNightSleep } from "@/features/pet-world/services/petWorldApi";
import { renderPortal } from "@/lib/platform/portal";

const glassDockStyle = {
  backdropFilter: "blur(14px) saturate(1.2) contrast(1.02)",
  WebkitBackdropFilter: "blur(14px) saturate(1.2) contrast(1.02)",
} as never;

import {
  BottomTabBar,
  Card,
  type BottomTabKey,
  PageContainer,
  PrimaryButton,
} from "@/components/app-ui/AppUI";
import { useAppPullToRefresh, useAppScrollControls, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { saveSelfHostGuestMode } from "@/lib/selfHost/authSession";
import { AddEventPage } from "@/features/calendar/AddEventPage";
import { TodayStoryPage } from "@/features/checkins/TodayStoryPage";
import { storyIconImageFromText } from "@/features/checkins/checkinUtils";
import { HomeScreenShell } from "@/features/home/HomeScreenShell";
import type {
  CreationTownView,
  PhotoPreviewState,
  SettingPage,
  SubPage,
} from "@/features/home/homeShared";
import { styles } from "@/features/home/homeStyles";
import { interactionIconForLabel, isQuickInteractionMessage, isQuickInteractionNotification } from "@/features/home/homeUtils";
import { HomeMainPage } from "@/features/home/HomeMainPage";
import {
  isAutoNightSleepReadyToWake,
  movePetForLetterDelivery,
  movePetForMemoryEvent,
  petWorldPropFromDecision,
  visibleGlobalPetSurfaceForRealSurface,
  visiblePetSurfaceFor,
} from "@/features/home/homePetWorldHelpers";
import { petAnchorProps, petSafeActionProps } from "@/features/home/petDomProps";
import { useCoupleData } from "@/features/home/useCoupleData";
import { useHomePhotoActions } from "@/features/home/useHomePhotoActions";
import { useQuickInteractions } from "@/features/home/useQuickInteractions";
import { WriteLetterPage, LetterInboxPage } from "@/features/letters/LetterPages";
import { PhotoPreviewPopup } from "@/features/media/PhotoAlbum";
import { MePage, SettingsDetailPage } from "@/features/settings/SettingsPages";
import { MessagesPage } from "@/features/messages/MessagePages";
import { MemoryPage } from "@/features/memory/MemoryPage";
import { maxMemoryPhotos } from "@/features/memory/memoryUtils";
import { CreationSpacePage } from "@/features/creation/CreationSpacePage";
import { PairingScreen } from "@/features/pairing/PairingScreen";
import { ProfileScreen } from "@/features/profile/ProfileScreen";
import { daysBetween } from "@/lib/dates/date";
import { subscribeNotificationOpen } from "@/lib/notifications/openEvents";
import { deleteSelfHostCalendarEvent } from "@/lib/selfHost/calendarApi";
import { deleteSelfHostCheckin, upsertSelfHostCheckin, upsertSelfHostMoodStatus } from "@/lib/selfHost/checkinApi";
import { isSelfHostAuthEnabled } from "@/lib/selfHost/config";
import { deleteSelfHostFootprint } from "@/lib/selfHost/footprintApi";
import { createSelfHostLetter, deleteSelfHostLetter, dismissSelfHostLetter, markSelfHostLetterRead } from "@/lib/selfHost/letterApi";
import { deleteSelfHostMedia } from "@/lib/selfHost/mediaApi";
import { markSelfHostNotificationRead } from "@/lib/selfHost/notificationApi";
import { endSelfHostActiveCouple } from "@/lib/selfHost/privacyApi";
import type { MediaFile, Notification } from "@/lib/supabase/database.types";
import { BouncyPressable } from "@/motion/BouncyPressable";
import { motionTokens } from "@/motion/tokens";
import { colors } from "@/styles/theme";

const petNightSleepWakeCheckMs = 60_000;
const settingPages: readonly SettingPage[] = [
  "profile",
  "couple",
  "pet",
  "notifications",
  "privacy",
  "relationship",
  "feedback",
  "about",
];

function isSettingPage(page: SubPage): page is SettingPage {
  return (settingPages as readonly SubPage[]).includes(page);
}

export { HomeScreenShell } from "@/features/home/HomeScreenShell";

export function HomeScreen() {
  const { session, user, signOut, guestMode } = useAuth();
  const { showToast } = useToast();
  const { scrollToTop } = useAppScrollControls();
  const { data, loading, loadError, reload, mergeCheckin, removeCheckin, mergeMediaFile, removeMediaFile, mergeProfile } = useCoupleData(user?.id, session?.access_token);
  const { settings: petUserSettings, setSettings: setPetUserSettings } = usePetUserSettings(user?.id);
  useAppPullToRefresh(reload);
  const [activeTab, setActiveTab] = useState<BottomTabKey>("home");
  const [subPage, setSubPage] = useState<SubPage>("main");
  const [subPageReturnTab, setSubPageReturnTab] = useState<BottomTabKey>("home");
  const [endingCouple, setEndingCouple] = useState(false);
  const [dismissedLetterPopupIds, setDismissedLetterPopupIds] = useState<string[]>([]);
  const [activePhotoPreview, setActivePhotoPreview] = useState<PhotoPreviewState | null>(null);
  const [creationTownView, setCreationTownView] = useState<CreationTownView>("hub");
  const [realtimePetReaction, setRealtimePetReaction] = useState<CreationPetStageReaction | null>(null);
  const [skippedProfileSetup, setSkippedProfileSetup] = useState(false);
  const lastSeenPetSurfaceRef = useRef<string | null>(null);
  const petEventHandlerRef = useRef<(event: { action: LivePetVisualAction; message: string }) => void>(() => {});
  const { partnerOnline: petRoomPartnerOnline, broadcastPetEvent } = usePetRealtime({
    coupleId: isSelfHostAuthEnabled ? null : data.couple?.id,
    userId: isSelfHostAuthEnabled ? null : user?.id,
    onSpaceChanged: reload,
    onPetEvent: (event) => petEventHandlerRef.current(event),
  });

  const isSettingDetailPage = isSettingPage(subPage);
  const showsBottomTabBar = subPage === "main" || isSettingDetailPage;

  useEffect(() => {
    if (activePhotoPreview && !data.mediaFiles.some((file) => file.id === activePhotoPreview.id)) {
      setActivePhotoPreview(null);
    }
  }, [activePhotoPreview, data.mediaFiles]);

  useEffect(() => {
    return subscribeNotificationOpen(() => {
      setSubPage("main");
      setActiveTab("home");
      reload();
    });
  }, [reload]);

  useEffect(() => {
    setSkippedProfileSetup(false);
  }, [user?.id]);

  useEffect(() => {
    scrollToTop();
  }, [activeTab, scrollToTop, subPage]);

  petEventHandlerRef.current = (event) => {
    setRealtimePetReaction({
      id: Date.now(),
      action: event.action,
      message: event.message,
    });
  };

  const hasUsableContent = Boolean(data.profile);
  const partner = data.couple?.couple_members.find((member) => member.user_id !== user?.id);
  const myDisplayName = data.profile?.display_name?.trim() || "我";
  const partnerDisplayName = partner?.profile?.display_name?.trim() || "TA";
  const me = {
    name: myDisplayName,
    initial: myDisplayName.slice(0, 1),
    avatarUrl: data.profile?.avatar_thumb_signed_url ?? data.profile?.avatar_thumb_data_url ?? null,
  };
  const partnerProfile = {
    name: partnerDisplayName,
    initial: partnerDisplayName.slice(0, 1),
    avatarUrl: partner?.profile?.avatar_thumb_signed_url ?? partner?.profile?.avatar_thumb_data_url ?? null,
  };
  const coupleId = data.couple?.id ?? "";
  const loveDays = data.couple ? daysBetween(data.couple.started_at) : 0;
  const visibleMessages = data.messages.filter((message) => !isQuickInteractionMessage(message));
  const {
    addCustomQuickInteraction,
    cancelCustomQuickInteraction,
    customQuickComposerOpen,
    customQuickDraft,
    dismissedPopupIds,
    quickInteractionItems,
    quickSending,
    saveCustomQuickInteraction,
    sendQuickInteraction,
    setCustomQuickDraft,
    setDismissedPopupIds,
    todayInteractionCount,
  } = useQuickInteractions({
    accessToken: session?.access_token,
    coupleId,
    partnerId: partner?.user_id,
    notifications: data.notifications,
    showToast,
    reload,
  });

  const prePendingMoodPopup =
    subPage === "main" && activeTab === "home"
      ? data.notifications.find(
          (notification) =>
            !notification.read_at &&
            isQuickInteractionNotification(notification) &&
            !dismissedPopupIds.includes(notification.id)
        )
      : undefined;
  const prePendingLetterPopup =
    subPage === "main" && activeTab === "home" && !prePendingMoodPopup
      ? data.notifications.find(
          (notification) =>
            !notification.read_at &&
            notification.type === "letter" &&
            !dismissedLetterPopupIds.includes(notification.id)
        )
      : undefined;
  const pendingMoodPopup = prePendingMoodPopup;
  const pendingLetterPopup = prePendingLetterPopup;
  const currentPetRoute = petWorldSurfaceForAppState({
    activeTab,
    subPage,
    townView: creationTownView,
    blockingModalOpen: Boolean(activePhotoPreview || pendingMoodPopup || pendingLetterPopup),
  });
  const currentPetSurface = currentPetRoute.surface;
  const realPetSurface = normalizePetWorldSurface(data.creationSpace?.pet_world_surface);
  const visibleGlobalPetSurface = visiblePetSurfaceFor(currentPetSurface);
  const visibleRealPetSurface = visibleGlobalPetSurfaceForRealSurface(realPetSurface);
  const petVisibleOnCurrentSurface =
    petUserSettings.visible &&
    subPage === "main" &&
    !currentPetRoute.disabled &&
    visibleGlobalPetSurface !== null &&
    visibleGlobalPetSurface === visibleRealPetSurface;
  usePetWorldRoaming({
    coupleId: data.couple?.id,
    creationSpace: data.creationSpace,
    creationActions: data.creationActions,
    currentSurface: currentPetSurface,
    disabled: isSelfHostAuthEnabled || !petUserSettings.autonomousRoamingEnabled || subPage !== "main" || currentPetRoute.disabled,
    partnerOnline: petRoomPartnerOnline,
    onChanged: reload,
  });

  useEffect(() => {
    const coupleId = data.couple?.id;
    const sleepStartedAt = data.creationSpace?.pet_sleep_started_at;
    if (isSelfHostAuthEnabled || !coupleId || !sleepStartedAt) {
      return undefined;
    }
    let cancelled = false;
    let settling = false;

    const settleNightSleep = () => {
      if (cancelled || settling || !isAutoNightSleepReadyToWake(sleepStartedAt)) {
        return;
      }
      settling = true;
      void settlePetNightSleep(coupleId)
        .then((nextSpace) => {
          if (cancelled || !nextSpace) {
            return;
          }
          setRealtimePetReaction({
            id: Date.now(),
            action: "wake",
            message: petHumanLine("wake"),
          });
          reload();
        })
        .catch((error) => {
          console.warn("Night pet wake failed:", error instanceof Error ? error.message : error);
        })
        .finally(() => {
          settling = false;
        });
    };

    settleNightSleep();
    const interval = setInterval(settleNightSleep, petNightSleepWakeCheckMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [data.couple?.id, data.creationSpace?.pet_sleep_started_at, reload]);

  useEffect(() => {
    if (isSelfHostAuthEnabled || !data.couple?.id || !data.creationSpace || !petVisibleOnCurrentSurface || !visibleGlobalPetSurface) {
      return;
    }
    const seenKey = `${data.couple.id}:${visibleGlobalPetSurface}:${data.creationSpace.pet_last_surface_changed_at ?? ""}`;
    if (lastSeenPetSurfaceRef.current === seenKey) {
      return;
    }
    lastSeenPetSurfaceRef.current = seenKey;
    void markPetSurfaceSeen(data.couple.id, visibleGlobalPetSurface).catch((error) => {
      console.warn("Pet surface seen sync failed:", error instanceof Error ? error.message : error);
    });
  }, [
    currentPetRoute.disabled,
    currentPetSurface,
    data.couple?.id,
    data.creationSpace,
    petVisibleOnCurrentSurface,
    subPage,
    visibleGlobalPetSurface,
  ]);

  const { handlePhotoFiles, uploadPhoto, deletePhoto } = useHomePhotoActions({
    userId: user?.id,
    accessToken: session?.access_token,
    coupleId,
    mediaFiles: data.mediaFiles,
    showToast,
    reload,
    mergeMediaFile,
    removeMediaFile,
    setActivePhotoPreview,
  });
  const saveSelfHostCheckin = isSelfHostAuthEnabled
    ? async (input: { checkinDate: string; content: string | null }) => {
        if (!session?.access_token) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        const savedCheckin = await upsertSelfHostCheckin({
          accessToken: session.access_token,
          coupleId,
          checkinDate: input.checkinDate,
          content: input.content,
        });
        mergeCheckin(savedCheckin);
        return savedCheckin;
      }
    : undefined;
  const saveSelfHostMoodStatus = isSelfHostAuthEnabled
    ? async (input: { mood: string; note: string | null }) => {
        if (!session?.access_token) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        await upsertSelfHostMoodStatus({
          accessToken: session.access_token,
          coupleId,
          mood: input.mood,
          note: input.note,
        });
      }
    : undefined;
  const deleteSelfHostMemoryCheckin = isSelfHostAuthEnabled
    ? async (checkinId: string) => {
        if (!session?.access_token) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        await deleteSelfHostCheckin({
          accessToken: session.access_token,
          checkinId,
        });
        removeCheckin(checkinId);
      }
    : undefined;
  const deleteSelfHostMemoryCalendarEvent = isSelfHostAuthEnabled
    ? async (eventId: string) => {
        if (!session?.access_token) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        await deleteSelfHostCalendarEvent({
          accessToken: session.access_token,
          eventId,
        });
      }
    : undefined;
  const deleteSelfHostMemoryMedia = isSelfHostAuthEnabled
    ? async (file: MediaFile) => {
        if (!session?.access_token) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        await deleteSelfHostMedia({
          accessToken: session.access_token,
          mediaId: file.id,
        });
      }
    : undefined;
  const deleteSelfHostMemoryFootprint = isSelfHostAuthEnabled
    ? async (footprintId: string) => {
        if (!session?.access_token) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        await deleteSelfHostFootprint({
          accessToken: session.access_token,
          footprintId,
        });
      }
    : undefined;
  const movePetForMemoryEventHandler = isSelfHostAuthEnabled
    ? async () => {}
    : movePetForMemoryEvent;
  const movePetForLetterDeliveryHandler = isSelfHostAuthEnabled
    ? async () => {}
    : movePetForLetterDelivery;
  const sendSelfHostLetter = isSelfHostAuthEnabled
    ? async (input: { title: string; body: string; unlockAt: string }) => {
        if (!session?.access_token) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        await createSelfHostLetter({
          accessToken: session.access_token,
          coupleId,
          title: input.title,
          body: input.body,
          unlockAt: input.unlockAt,
        });
      }
    : undefined;
  const markSelfHostLetterReadHandler = isSelfHostAuthEnabled
    ? async (letterId: string) => {
        if (!session?.access_token) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        await markSelfHostLetterRead({ accessToken: session.access_token, letterId });
      }
    : undefined;
  const dismissSelfHostLetterHandler = isSelfHostAuthEnabled
    ? async (letterId: string) => {
        if (!session?.access_token) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        await dismissSelfHostLetter({ accessToken: session.access_token, letterId });
      }
    : undefined;
  const deleteSelfHostLetterHandler = isSelfHostAuthEnabled
    ? async (letterId: string) => {
        if (!session?.access_token) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        await deleteSelfHostLetter({ accessToken: session.access_token, letterId });
      }
    : undefined;

  if (loading && !hasUsableContent && !guestMode) {
    return <HomeScreenShell />;
  }

  if (!data.profile && loadError) {
    return (
      <PageContainer>
        <HomeDataErrorScreen message={loadError} onRetry={() => void reload()} />
      </PageContainer>
    );
  }

  if (!data.profile && !guestMode && !skippedProfileSetup) {
    return (
      <PageContainer>
        <ProfileScreen
          onSaved={() => {
            setSkippedProfileSetup(false);
            reload();
          }}
          onCancel={() => setSkippedProfileSetup(true)}
          onProfileChanged={mergeProfile}
        />
      </PageContainer>
    );
  }

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
    try {
      if (!session?.access_token) {
        showToast({ title: "解绑失败", message: "登录状态已失效，请重新登录。", tone: "error" });
        return;
      }
      await endSelfHostActiveCouple(session.access_token);
      showToast({ title: "已解除关系", message: "双方不能继续写入原情侣空间。", tone: "success" });
      reload();
    } catch (error) {
      showToast({ title: "解绑失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setEndingCouple(false);
    }
  }

  function goTab(tab: BottomTabKey) {
    setSubPage("main");
    setSubPageReturnTab(tab);
    setActiveTab(tab);
  }

  function returnToMePage() {
    setActiveTab("me");
    setSubPageReturnTab("me");
    setSubPage("main");
  }

  function openSettingPage(page: SettingPage) {
    setActiveTab("me");
    setSubPageReturnTab("me");
    setSubPage(page);
  }

  function openPairingPage() {
    setActiveTab("me");
    setSubPageReturnTab("me");
    setSubPage("pairing");
  }

  async function requireDualAccess() {
    if (!session?.access_token) {
      await saveSelfHostGuestMode(true);
      showToast({ title: "需要先登录并绑定另一半", message: "登录后再绑定，才能继续使用这个功能。", tone: "info" });
      return;
    }
    if (!data.couple) {
      openPairingPage();
      showToast({ title: "需要先绑定另一半", message: "绑定后才能继续使用这个功能。", tone: "info" });
      return;
    }
  }

  function openSubPage(page: Exclude<SubPage, "main" | SettingPage>, ownerTab: BottomTabKey = activeTab) {
    setSubPageReturnTab(ownerTab);
    setSubPage(page);
  }

  function returnToSubPageOwner() {
    setActiveTab(subPageReturnTab);
    setSubPage("main");
  }

  async function closeMoodPopup(notification: Notification) {
    setDismissedPopupIds((ids) => (ids.includes(notification.id) ? ids : [...ids, notification.id]));
    await markNotificationRead(notification.id);
    reload();
  }

  async function openLetterPopup(notification: Notification) {
    setDismissedLetterPopupIds((ids) => (ids.includes(notification.id) ? ids : [...ids, notification.id]));
    await markNotificationRead(notification.id);
    setActiveTab("home");
    openSubPage("letterInbox", "home");
    reload();
  }

  async function closeLetterPopup(notification: Notification) {
    setDismissedLetterPopupIds((ids) => (ids.includes(notification.id) ? ids : [...ids, notification.id]));
    await markNotificationRead(notification.id);
    reload();
  }

  async function markNotificationRead(notificationId: string) {
    if (!session?.access_token) {
      showToast({ title: "提醒状态同步失败", message: "登录状态已失效，请重新登录。", tone: "error" });
      return;
    }
    try {
      await markSelfHostNotificationRead({ accessToken: session.access_token, notificationId });
    } catch (error) {
      showToast({ title: "提醒状态同步失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    }
  }

  let content = null;
  if (subPage === "messages") {
    content = <MessagesPage coupleId={coupleId} messages={visibleMessages} onChanged={reload} onBack={returnToSubPageOwner} />;
  } else if (subPage === "addEvent") {
    content = <AddEventPage coupleId={coupleId} onSaved={reload} onBack={returnToSubPageOwner} onMovePetForMemoryEvent={movePetForMemoryEventHandler} />;
  } else if (subPage === "writeLetter") {
    content = (
      <WriteLetterPage
        coupleId={coupleId}
        partner={partnerProfile}
        onSaved={reload}
        onBack={returnToSubPageOwner}
        onMovePetForLetterDelivery={movePetForLetterDeliveryHandler}
        onSendLetter={sendSelfHostLetter}
      />
    );
  } else if (subPage === "letterInbox") {
    content = (
      <LetterInboxPage
        letters={data.letters}
        me={me}
        partner={partnerProfile}
        onBack={returnToSubPageOwner}
        onReply={() => openSubPage("writeLetter", subPageReturnTab)}
        onChanged={reload}
        onDismissLetter={dismissSelfHostLetterHandler}
        onMarkLetterRead={markSelfHostLetterReadHandler}
        onDeleteLetter={deleteSelfHostLetterHandler}
      />
    );
  } else if (subPage === "creation") {
    content = (
      <CreationSpacePage
        coupleId={coupleId}
        creationSpace={data.creationSpace}
        creationActions={data.creationActions}
        petMemories={data.petMemories}
        footprints={data.footprints}
        partnerOnline={petRoomPartnerOnline}
        realtimeReaction={realtimePetReaction}
        onBroadcastPetEvent={broadcastPetEvent}
        petUserSettings={petUserSettings}
        townView={creationTownView}
        onTownViewChange={setCreationTownView}
        onBack={returnToSubPageOwner}
        onChanged={reload}
        disabled={false}
        accessToken={session?.access_token}
        selfHostMode={isSelfHostAuthEnabled}
      />
    );
  } else if (isSettingDetailPage) {
    content = (
      <SettingsDetailPage
        page={subPage}
        me={me}
        partner={partnerProfile}
        loveDays={loveDays}
        startedAt={data.couple?.started_at ?? ""}
        onBack={returnToMePage}
        onEndCouple={endCouple}
        endingCouple={endingCouple}
        coupleId={coupleId}
        partnerId={partner?.user_id}
        notifications={data.notifications}
        petUserSettings={petUserSettings}
        onChangePetUserSettings={setPetUserSettings}
        onChanged={reload}
        onProfileChanged={mergeProfile}
        onOpenLetters={() => {
          setActiveTab("home");
          openSubPage("letterInbox", "me");
        }}
      />
    );
  } else if (activeTab === "home") {
    content = (
      <HomeMainPage
        me={me}
        partner={partnerProfile}
        startedAt={data.couple?.started_at ?? ""}
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
          cancelCustomQuickInteraction();
        }}
        onWriteLetter={() => openSubPage("writeLetter", "home")}
        onPhotoFiles={(files, options) => handlePhotoFiles(files, { maxFiles: maxMemoryPhotos, currentCount: data.mediaFiles.length, ...options })}
        onPreviewPhoto={(file, index) => setActivePhotoPreview({ id: file.id, index: index ?? 0 })}
        onDeletePhoto={deletePhoto}
        onChanged={reload}
        onOpenMessages={() => openSubPage("messages", "home")}
        onQuickInteraction={sendQuickInteraction}
        quickSending={quickSending}
        mediaFiles={data.mediaFiles}
        moodStatuses={data.moodStatuses}
        coupleReady={Boolean(data.couple)}
        onRequireAccess={requireDualAccess}
      />
    );
  } else if (subPage === "pairing") {
    content = (
      <PairingScreen
        pendingInvites={data.pendingInvites}
        onChanged={reload}
        onSkip={() => {
          setSubPage("main");
          setActiveTab("home");
        }}
      />
    );
  } else if (activeTab === "checkins") {
    content = (
      <TodayStoryPage
        coupleId={coupleId}
        checkins={data.checkins}
        mediaFiles={data.mediaFiles}
        creationSpace={data.creationSpace}
        petWorldProp={petWorldPropFromDecision(data.creationSpace?.last_world_decision)}
        onChanged={reload}
        onPhotoFiles={(files, options) => handlePhotoFiles(files, options)}
        onMovePetForMemoryEvent={movePetForMemoryEventHandler}
        onSaveCheckin={saveSelfHostCheckin}
        onSaveMoodStatus={saveSelfHostMoodStatus}
        onDeleteCheckin={deleteSelfHostMemoryCheckin}
      />
    );
  } else if (activeTab === "calendar") {
    content = (
      <MemoryPage
        checkins={data.checkins}
        messages={visibleMessages}
        events={data.events}
        mediaFiles={data.mediaFiles}
        letters={data.letters}
        footprints={data.footprints}
        creationSpace={data.creationSpace}
        petWorldProp={petWorldPropFromDecision(data.creationSpace?.last_world_decision)}
        currentUserId={user?.id ?? ""}
        relationshipStartedAt={data.couple?.started_at}
        onAddEvent={() => openSubPage("addEvent", "calendar")}
        onOpenLetter={() => openSubPage("letterInbox", "calendar")}
        onChanged={reload}
        onUploadMemoryPhoto={({ files, memory, currentCount }) => {
          const options = { caption: memory.title, currentCount, maxFiles: maxMemoryPhotos, successTitle: "图片已加入这段记忆" };
          return files ? handlePhotoFiles(files, options) : uploadPhoto(options);
        }}
        onPreviewMemoryPhoto={(file) => setActivePhotoPreview({ id: file.id, index: Math.max(0, data.mediaFiles.findIndex((item) => item.id === file.id)) })}
        onCreateCapsule={() => {
          setSubPage("main");
          setSubPageReturnTab("checkins");
          setActiveTab("checkins");
        }}
        onDeleteCheckin={deleteSelfHostMemoryCheckin}
        onDeleteCalendarEvent={deleteSelfHostMemoryCalendarEvent}
        onDeleteMedia={deleteSelfHostMemoryMedia}
        onDeleteFootprint={deleteSelfHostMemoryFootprint}
        onDeleteLetter={deleteSelfHostLetterHandler}
        onRequireAccess={requireDualAccess}
      />
    );
  } else {
    content = (
      <MePage
        me={me}
        partner={partnerProfile}
        loveDays={loveDays}
        onSignOut={guestMode ? requireDualAccess : signOut}
        onEndCouple={guestMode ? requireDualAccess : endCouple}
        endingCouple={endingCouple}
        onOpenSetting={openSettingPage}
      />
    );
  }

  return (
    <PageContainer>
      {content}
      {showsBottomTabBar ? <BottomTabBar activeTab={activeTab} onChange={goTab} /> : null}
      <GlobalPetLayer
        visible={petVisibleOnCurrentSurface}
        surface={visibleGlobalPetSurface ?? "home"}
        creationSpace={data.creationSpace}
        realtimeReaction={realtimePetReaction}
        onOpenCreation={() => openSubPage("creation", activeTab)}
        userSettings={petUserSettings}
      />
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
      {subPage === "main" && activeTab === "home" && data.couple && !guestMode ? <FloatingCreationEntry onOpen={() => openSubPage("creation", "home")} /> : null}
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

function HomeDataErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.stack}>
      <Card>
        <Text style={styles.sectionTitle}>首页数据暂时没加载出来</Text>
        <Text style={styles.bodyText}>{message || "可能是网络或服务临时不稳定，请重新加载。"}</Text>
        <PrimaryButton label="重新加载" onPress={onRetry} />
      </Card>
    </View>
  );
}

function FloatingCreationEntry({ onOpen }: { onOpen: () => void }) {
  const button = (
    <View pointerEvents="box-none" style={styles.creationFloatingDock}>
      <BouncyPressable {...petSafeActionProps()} {...petAnchorProps("home-creation-entry", "creation-entry")} accessibilityRole="button" accessibilityLabel="打开家园" onPress={onOpen} haptic="selection" style={[styles.creationCrystalButton, Platform.OS === "web" ? glassDockStyle : null]}>
        <View pointerEvents="none" style={styles.creationCrystalAura} />
        <View pointerEvents="none" style={styles.creationCrystalSheen} />
        <View pointerEvents="none" style={styles.creationCrystalPets}>
          <Sparkles color="rgba(255,255,255,0.88)" size={25} strokeWidth={2.4} />
          <Heart color="rgba(255,255,255,0.74)" fill="rgba(255,255,255,0.5)" size={12} strokeWidth={2.5} style={styles.creationCrystalHeart} />
        </View>
        <View pointerEvents="none" style={styles.creationCrystalStar}>
          <Star color="#fff8df" fill="#ffe097" size={17} strokeWidth={2.2} />
        </View>
        <Text style={styles.creationCrystalLabel}>家园</Text>
      </BouncyPressable>
    </View>
  );

  return renderPortal(button);
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
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(1, motionTokens.spring.gentle);
  }, [progress]);

  const layerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - progress.value) * 18 },
      { scale: 0.96 + progress.value * 0.04 },
    ],
  }));

  return (
    <Reanimated.View role="dialog" aria-modal={true} pointerEvents="box-none" style={[styles.moodPopupLayer, layerStyle]}>
      <Reanimated.View style={[styles.moodPopupCard, cardStyle]}>
        <View style={styles.moodPopupIconWrap}>
          <Image source={moodIcon} style={styles.moodPopupIcon} resizeMode="contain" />
        </View>
        <View style={styles.moodPopupCopy}>
          <Text style={styles.moodPopupEyebrow}>{partnerName} 投递了一点心情</Text>
          <Text style={styles.moodPopupTitle}>{mood}</Text>
        </View>
        <BouncyPressable accessibilityRole="button" onPress={onClose} haptic="selection" style={styles.moodPopupPrimaryButtonWide}>
          <Text style={styles.moodPopupPrimaryText}>知道了</Text>
        </BouncyPressable>
      </Reanimated.View>
    </Reanimated.View>
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
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(1, motionTokens.spring.gentle);
  }, [progress]);

  const layerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - progress.value) * 24 },
      { scale: 0.94 + progress.value * 0.06 },
    ],
  }));
  const envelopeStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: "-2deg" },
      { scale: 0.94 + progress.value * 0.06 },
    ],
  }));

  const popup = (
    <Reanimated.View role="dialog" aria-modal={true} pointerEvents="box-none" style={[styles.letterPopupLayer, layerStyle]}>
      <Reanimated.View style={[styles.letterPopupCard, cardStyle]}>
        <View pointerEvents="none" style={styles.letterPopupHalo} />
        <View pointerEvents="none" style={styles.letterPopupSparkOne} />
        <View pointerEvents="none" style={styles.letterPopupSparkTwo} />
        <View style={styles.letterPopupStamp}>
          <Heart color="#fff" size={15} fill="#fff" strokeWidth={2.4} />
        </View>
        <Reanimated.View style={[styles.letterPopupEnvelope, envelopeStyle]}>
          <View style={styles.letterPopupFlap} />
          <View style={styles.letterPopupPaper}>
            <Text style={styles.letterPopupPaperText}>For you</Text>
          </View>
          <Mail color={colors.accentDark} size={36} strokeWidth={2.25} />
        </Reanimated.View>
        <Text style={styles.letterPopupEyebrow}>{partnerName} 给你寄来一封信</Text>
        <Text style={styles.letterPopupTitle}>{notification.title || "你收到了一封信"}</Text>
        <Text style={styles.letterPopupBody}>{notification.body || "有一句认真写下的话，正在等你打开。"}</Text>
        <View style={styles.letterPopupActions}>
          <BouncyPressable accessibilityRole="button" onPress={onClose} haptic="selection" style={styles.letterPopupSecondary}>
            <Text style={styles.letterPopupSecondaryText}>稍后再看</Text>
          </BouncyPressable>
          <BouncyPressable accessibilityRole="button" onPress={onOpen} haptic="success" style={styles.letterPopupPrimary}>
            <Text style={styles.letterPopupPrimaryText}>打开来信</Text>
          </BouncyPressable>
        </View>
      </Reanimated.View>
    </Reanimated.View>
  );

  return renderPortal(popup);
}
