import { useEffect, useRef, useState } from "react";
import { Animated, Image, Platform, Pressable, Text, View } from "react-native";
import { Easing } from "react-native-reanimated";
import { Brain, ChevronLeft, Compass, Gamepad2, Home, ImagePlus, Heart, MapPin, Moon, ShoppingBag, Sparkles, Star, Trash2, Utensils } from "lucide-react-native";

import { Card, EmptyState, PrimaryButton, SecondaryButton, TopBar } from "@/components/app-ui/AppUI";
import { InlineNotice, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { CreationFoodCard, FootprintEditorModal, PetMemoryRow } from "@/features/creation/CreationSpaceParts";
import {
  cloudPetCompatPetKey,
  cloudPetOption,
  creationFoodLabel,
  creationPuzzles,
  displayPetName,
  immediatePetLine,
  isMeaningfulPetMemory,
  petActionToastTitle,
  petAwaySurfaceLine,
  reactionFromSpace,
  townViewToPetSurface,
} from "@/features/creation/creationSpaceLogic";
import { creationTownAssets } from "@/features/home/homeAssets";
import type { CreationFoodType, CreationTownView } from "@/features/home/homeShared";
import { styles } from "@/features/home/homeStyles";
import { petAnchorProps, petSafeActionProps, petSafeContentProps } from "@/features/home/petDomProps";
import { formatMemoryDate } from "@/features/memory/memoryUtils";
import { PetStage, type CreationLivePetAction, type CreationPetStageReaction, type LivePetVisualAction } from "@/features/pet/components/PetStage";
import { activeLive2DPet } from "@/features/pet/live2dCatalog";
import { petRigCueFromJson, type PetRigCue } from "@/features/pet/services/petAiBrain";
import { petSizeScale, type PetUserSettings } from "@/features/pet/userPetSettings";
import { usePetWorldRoaming } from "@/features/pet-world/hooks/usePetWorldRoaming";
import { petHumanLine } from "@/features/pet-world/logic/petExpression";
import { normalizePetWorldSurface } from "@/features/pet-world/logic/petWorldRoutes";
import { todayIsoDate } from "@/lib/dates/date";
import {
  buySelfHostCreationFood,
  claimSelfHostCreationGameReward,
  ensureSelfHostCreationSpace,
  feedSelfHostCreationPet,
  interactSelfHostCreationPet,
  recordSelfHostCreationAction,
  settleSelfHostCreationPetSleep,
  summonSelfHostCreationPet,
} from "@/lib/selfHost/creationApi";
import { createSelfHostFootprint, deleteSelfHostFootprint, updateSelfHostFootprint } from "@/lib/selfHost/footprintApi";
import type { CoupleFootprint, CreationAction, CreationSpace, PetMemory } from "@/lib/supabase/database.types";
import { haptics } from "@/motion/haptics";
import { colors } from "@/styles/theme";

export function CreationSpacePage({
  coupleId,
  creationSpace,
  creationActions,
  petMemories,
  footprints,
  partnerOnline,
  realtimeReaction,
  onBroadcastPetEvent,
  petUserSettings,
  townView,
  onTownViewChange,
  onBack,
  onChanged,
  disabled = false,
  accessToken,
  selfHostMode = false,
}: {
  coupleId: string;
  creationSpace: CreationSpace | null;
  creationActions: CreationAction[];
  petMemories: PetMemory[];
  footprints: CoupleFootprint[];
  partnerOnline: boolean;
  realtimeReaction: CreationPetStageReaction | null;
  onBroadcastPetEvent: (event: { action: CreationLivePetAction; message: string }) => Promise<void>;
  petUserSettings: PetUserSettings;
  townView: CreationTownView;
  onTownViewChange: (view: CreationTownView) => void;
  onBack: () => void;
  onChanged: () => void;
  disabled?: boolean;
  accessToken?: string | null;
  selfHostMode?: boolean;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [space, setSpace] = useState<CreationSpace | null>(creationSpace);
  const activeSpace = space ?? creationSpace;
  const [petName, setPetName] = useState("云宠");
  const petDisplayName = displayPetName(activeSpace?.pet_name ?? petName);
  const [petBusy, setPetBusy] = useState<CreationFoodType | "pet" | "clean" | "play" | "sleep" | null>(null);
  const [petSummoning, setPetSummoning] = useState(false);
  const [petReaction, setPetReaction] = useState<CreationPetStageReaction | null>(null);
  const [rigCue, setRigCue] = useState<PetRigCue | null>(petRigCueFromJson(activeSpace?.last_rig_cue));
  const [storeBusy, setStoreBusy] = useState<CreationFoodType | null>(null);
  const [selectedPuzzleId, setSelectedPuzzleId] = useState(creationPuzzles[0].id);
  const [selectedPuzzleAnswer, setSelectedPuzzleAnswer] = useState("");
  const [puzzleFeedback, setPuzzleFeedback] = useState<"correct" | "wrong" | null>(null);
  const [gameBusy, setGameBusy] = useState(false);
  const [footprintTitle, setFootprintTitle] = useState("");
  const [footprintNote, setFootprintNote] = useState("");
  const [footprintDate, setFootprintDate] = useState(todayIsoDate());
  const [editingFootprintId, setEditingFootprintId] = useState<string | null>(null);
  const [footprintBusy, setFootprintBusy] = useState(false);
  const [footprintFormOpen, setFootprintFormOpen] = useState(false);
  const [granaryOpen, setGranaryOpen] = useState(false);
  const islandFloat = useRef(new Animated.Value(0)).current;
  const featuresDisabled = disabled;
  const roamingDisabled = disabled || selfHostMode;
  const currentTownSurface = townViewToPetSurface(townView);
  const petStageScale = petSizeScale(petUserSettings.size);
  const petStageVisible = petUserSettings.visible;
  usePetWorldRoaming({
    coupleId: roamingDisabled ? null : coupleId,
    creationSpace: activeSpace,
    creationActions,
    currentSurface: currentTownSurface,
    disabled: roamingDisabled || !petUserSettings.autonomousRoamingEnabled,
    partnerOnline,
    onChanged,
  });

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
    setPetName(displayPetName(nextSpace?.pet_name));
    setRigCue(petRigCueFromJson(nextSpace?.last_rig_cue));
  }, [creationSpace, space]);

  useEffect(() => {
    if (activeSpace) {
      return;
    }
    void ensureSpace(false);
  }, [activeSpace, coupleId, selfHostMode]);

  useEffect(() => {
    if (selfHostMode || !activeSpace || activeSpace.pet_key === cloudPetCompatPetKey) {
      return;
    }
    void syncCloudPet(activeSpace.pet_name);
  }, [activeSpace?.id, activeSpace?.pet_key, activeSpace?.pet_name, selfHostMode]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [townView]);

  useEffect(() => {
    if (Platform.OS !== "web" || townView !== "hub" || typeof document === "undefined" || typeof window === "undefined") {
      return undefined;
    }
    const scrollContent = document.querySelector<HTMLElement>("[data-app-scroll-content='true']");
    const scrollContainer = scrollContent?.parentElement as HTMLElement | null;
    if (!scrollContainer) {
      return undefined;
    }

    const previousOverflowY = scrollContainer.style.overflowY;
    const previousTouchAction = scrollContainer.style.touchAction;
    const previousOverscrollBehaviorY = scrollContainer.style.overscrollBehaviorY;
    const previousHtmlOverflowY = document.documentElement.style.overflowY;
    const previousBodyOverflowY = document.body.style.overflowY;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    const previousWindowScrollY = window.scrollY;
    scrollContainer.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "auto" });
    scrollContainer.style.overflowY = "hidden";
    scrollContainer.style.touchAction = "none";
    scrollContainer.style.overscrollBehaviorY = "contain";
    document.documentElement.style.overflowY = "hidden";
    document.body.style.overflowY = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = "0px";
    document.body.style.width = "100%";
    const stopHubScroll = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    scrollContainer.addEventListener("wheel", stopHubScroll, { capture: true, passive: false });
    scrollContainer.addEventListener("touchmove", stopHubScroll, { capture: true, passive: false });

    return () => {
      scrollContainer.removeEventListener("wheel", stopHubScroll, { capture: true });
      scrollContainer.removeEventListener("touchmove", stopHubScroll, { capture: true });
      scrollContainer.style.overflowY = previousOverflowY;
      scrollContainer.style.touchAction = previousTouchAction;
      scrollContainer.style.overscrollBehaviorY = previousOverscrollBehaviorY;
      document.documentElement.style.overflowY = previousHtmlOverflowY;
      document.body.style.overflowY = previousBodyOverflowY;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      window.scrollTo({ top: previousWindowScrollY, behavior: "auto" });
    };
  }, [townView]);

  function showDisabledNotice() {
    showToast({ title: "家园暂未开放", message: "完整云宠玩法接好后会重新打开。", tone: "info" });
  }

  function requireSelfHostAccessToken() {
    if (!accessToken) {
      showToast({ title: "登录状态已失效", message: "请重新登录后再试。", tone: "error" });
      return null;
    }
    return accessToken;
  }

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(islandFloat, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(islandFloat, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [islandFloat]);

  async function ensureSpace(showSuccess = true) {
    const token = requireSelfHostAccessToken();
    if (!token) {
      return null;
    }
    try {
      const data = await ensureSelfHostCreationSpace({ accessToken: token, coupleId });
      setSpace(data ?? null);
      if (showSuccess) {
        showToast({ title: "小屋已准备好", tone: "success" });
      }
      onChanged();
      return data ?? null;
    } catch (error) {
      showToast({ title: "家园暂时打不开", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
      return null;
    }
  }

  async function syncCloudPet(currentPetName?: string | null) {
    void currentPetName;
    showToast({ title: "云宠同步暂未开放", message: "自建后端完整云宠选择 API 接好后会重新打开。", tone: "info" });
  }

  async function feedPet(foodType: CreationFoodType) {
    if (featuresDisabled) {
      showDisabledNotice();
      return;
    }
    if (petBusy) {
      return;
    }
    setPetBusy(foodType);
    try {
      const token = requireSelfHostAccessToken();
      if (!token) {
        return;
      }
      const data = await feedSelfHostCreationPet({ accessToken: token, coupleId, foodType });
      setSpace(data ?? null);
      triggerLocalPetReaction("eat", petHumanLine("feed"));
      showToast({
        title: `已喂${creationFoodLabel(foodType)}`,
        message: activeSpace?.pet_sleep_started_at ? "刚才的睡眠已按时长结算，再加上这份口粮。" : "等它抬头回应你。",
        tone: "success",
      });
      onChanged();
    } catch (error) {
      showToast({ title: "喂养失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setPetBusy(null);
    }
  }

  async function interactPet(type: "pet" | "clean" | "play" | "sleep") {
    if (featuresDisabled) {
      showDisabledNotice();
      return;
    }
    if (petBusy) {
      return;
    }
    setPetBusy(type);
    try {
      const token = requireSelfHostAccessToken();
      if (!token) {
        return;
      }
      const data = await interactSelfHostCreationPet({ accessToken: token, coupleId, interactionType: type });
      setSpace(data ?? null);
      triggerLocalPetReaction(type, immediatePetLine(type));
      showToast({
        title: petActionToastTitle(type),
        message:
          type === "clean" ? "它会把这理解成打扫小窝。"
          : type === "play" ? "它会把这理解成陪它玩。"
          : type === "sleep" ? "睡满 5 分钟可恢复 18 点精力，中途叫醒会按时长结算。"
          : activeSpace?.pet_sleep_started_at ? "刚才的睡眠已按时长结算。"
          : "它会抬头回应你。",
        tone: "success",
      });
      onChanged();
    } catch (error) {
      showToast({ title: "互动失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setPetBusy(null);
    }
  }

  async function sleepPet() {
    if (featuresDisabled) {
      showDisabledNotice();
      return;
    }
    if (petBusy) {
      return;
    }
    if (!activeSpace?.pet_sleep_started_at) {
      void interactPet("sleep");
      return;
    }
    setPetBusy("sleep");
    try {
      const token = requireSelfHostAccessToken();
      if (!token) {
        return;
      }
      const data = await settleSelfHostCreationPetSleep({ accessToken: token, coupleId });
      setSpace(data ?? null);
      const stillSleeping = Boolean(data?.pet_sleep_started_at);
      triggerLocalPetReaction(stillSleeping ? "sleep" : "wake", stillSleeping ? petHumanLine("sleep") : petHumanLine("wake"));
      showToast({
        title: stillSleeping ? "还没睡够" : "休息已结算",
        message: stillSleeping ? "睡满 5 分钟后再结算，才能恢复 18 点精力。" : "睡眠已按时长结算。",
        tone: stillSleeping ? "info" : "success",
      });
      onChanged();
    } catch (error) {
      showToast({ title: "结算休息失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setPetBusy(null);
    }
  }

  async function summonPetRoom() {
    if (featuresDisabled) {
      showDisabledNotice();
      return;
    }
    if (petSummoning) {
      return;
    }
    setPetSummoning(true);
    try {
      const token = requireSelfHostAccessToken();
      if (!token) {
        return;
      }
      const data = await summonSelfHostCreationPet({ accessToken: token, coupleId, surface: "pet_room" });
      setSpace(data ?? activeSpace ?? null);
      triggerLocalPetReaction("pet", petHumanLine("summon"));
      showToast({ title: "云宠回小窝了", message: "现在可以在小窝里和它互动。", tone: "success" });
      onChanged();
    } catch (error) {
      showToast({ title: "召回失败", message: error instanceof Error ? error.message : "请稍后再试。", tone: "error" });
    } finally {
      setPetSummoning(false);
    }
  }

  function triggerLocalPetReaction(action: LivePetVisualAction, message: string) {
    const reaction = {
      id: Date.now(),
      action,
      message,
    };
    setPetReaction(reaction);
    if (action !== "wake") {
      void onBroadcastPetEvent({ action, message });
    }
  }

  async function buyFood(foodType: CreationFoodType) {
    if (featuresDisabled) {
      showDisabledNotice();
      return;
    }
    if (storeBusy) {
      return;
    }
    setStoreBusy(foodType);
    try {
      const token = requireSelfHostAccessToken();
      if (!token) {
        return;
      }
      const data = await buySelfHostCreationFood({ accessToken: token, coupleId, foodType, quantity: 1 });
      setSpace(data ?? null);
      showToast({ title: "粮仓已补充", message: `已买入 1 份${creationFoodLabel(foodType)}。`, tone: "success" });
      onChanged();
    } catch (error) {
      showToast({ title: "购买失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setStoreBusy(null);
    }
  }

  function switchPuzzle() {
    const currentIndex = creationPuzzles.findIndex((puzzle) => puzzle.id === selectedPuzzleId);
    const nextPuzzle = creationPuzzles[(currentIndex + 1) % creationPuzzles.length];
    setSelectedPuzzleId(nextPuzzle.id);
    setSelectedPuzzleAnswer("");
    setPuzzleFeedback(null);
  }

  async function claimPuzzleReward() {
    if (featuresDisabled) {
      showDisabledNotice();
      return;
    }
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
    try {
      const token = requireSelfHostAccessToken();
      if (!token) {
        return;
      }
      const data = await claimSelfHostCreationGameReward({ accessToken: token, coupleId, puzzleId: currentPuzzle.id });
      setSpace(data ?? null);
      triggerLocalPetReaction("happy", "通关啦");
      showToast({ title: "赏金入仓", message: "鲜食粮和心愿星糖已放进共享粮仓。", tone: "success" });
      onChanged();
    } catch (error) {
      showToast({ title: "奖励领取失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setGameBusy(false);
    }
  }

  function beginEditFootprint(footprint: CoupleFootprint) {
    setEditingFootprintId(footprint.id);
    setFootprintTitle(footprint.title);
    setFootprintNote(footprint.note ?? "");
    setFootprintDate(footprint.visited_at);
  }

  function resetFootprintForm() {
    setEditingFootprintId(null);
    setFootprintTitle("");
    setFootprintNote("");
    setFootprintDate(todayIsoDate());
  }

  async function saveFootprint() {
    const token = requireSelfHostAccessToken();
    if (!token || !user || !footprintTitle.trim() || !footprintDate || footprintBusy) {
      return;
    }
    setFootprintBusy(true);
    try {
      if (editingFootprintId) {
        await updateSelfHostFootprint({
          accessToken: token,
          footprintId: editingFootprintId,
          title: footprintTitle.trim(),
          note: footprintNote.trim() || null,
          visitedAt: footprintDate,
          latitude: null,
          longitude: null,
        });
        await writeCreationAction("footprint_update", `更新了足迹「${footprintTitle.trim()}」`);
        showToast({ title: "足迹已更新", tone: "success" });
      } else {
        await createSelfHostFootprint({
          accessToken: token,
          coupleId,
          title: footprintTitle.trim(),
          note: footprintNote.trim() || null,
          visitedAt: footprintDate,
          latitude: null,
          longitude: null,
        });
        await writeCreationAction("footprint_add", `记录了足迹「${footprintTitle.trim()}」`);
        triggerLocalPetReaction("happy", "喵");
        showToast({ title: "足迹已点亮", message: "它也会沉淀到记忆页的日常里。", tone: "success" });
      }
      resetFootprintForm();
      setFootprintFormOpen(false);
      onChanged();
    } catch (error) {
      showToast({ title: editingFootprintId ? "更新失败" : "保存失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setFootprintBusy(false);
    }
  }

  async function deleteFootprint(footprint: CoupleFootprint) {
    const token = requireSelfHostAccessToken();
    if (!token) {
      return;
    }
    try {
      await deleteSelfHostFootprint({ accessToken: token, footprintId: footprint.id });
      await writeCreationAction("footprint_delete", `删除了足迹「${footprint.title}」`);
      if (editingFootprintId === footprint.id) {
        resetFootprintForm();
      }
      showToast({ title: "足迹已删除", tone: "success" });
      onChanged();
    } catch (error) {
      showToast({ title: "删除失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    }
  }

  async function writeCreationAction(actionType: CreationAction["action_type"], actionLabel: string) {
    const token = accessToken;
    if (!token || !user) {
      return;
    }
    await recordSelfHostCreationAction({
      accessToken: token,
      coupleId,
      actionType,
      actionLabel,
      metadata: {},
    });
  }

  const displayedFootprints = footprints;
  const canSaveFootprint = Boolean(footprintTitle.trim() && footprintDate);
  const currentPuzzle = creationPuzzles.find((puzzle) => puzzle.id === selectedPuzzleId) ?? creationPuzzles[0];
  const basicFoodCount = activeSpace?.basic_food_count ?? 2;
  const premiumFoodCount = activeSpace?.premium_food_count ?? 0;
  const treatBalance = activeSpace?.treat_balance ?? 0;
  const latestPetReaction = petReaction ?? realtimeReaction ?? reactionFromSpace(activeSpace);
  const petMemoryActionsDisabled = disabled || selfHostMode;
  const visiblePetMemories = petMemories
    .filter((memory) => !memory.archived_at)
    .filter((memory) => memory.memory_scope === "core" || !memory.expires_at || new Date(memory.expires_at).getTime() > Date.now())
    .filter(isMeaningfulPetMemory)
    .slice(0, 3);
  const cleanButtonLabel = petBusy === "clean" ? "清洁中" : "清洁小屋";
  const totalFoodCount = basicFoodCount + premiumFoodCount;
  const realPetSurface = normalizePetWorldSurface(activeSpace?.pet_world_surface);
  const petOnCurrentTownSurface = petStageVisible && realPetSurface === currentTownSurface;
  const petSleeping = Boolean(activeSpace?.pet_sleep_started_at);
  const sleepButtonLabel = petBusy === "sleep" ? "休息中" : petSleeping ? "结算休息" : "哄睡";
  const petIslandLift = islandFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const footprintIslandLift = islandFloat.interpolate({ inputRange: [0, 1], outputRange: [-2, 3] });
  const playgroundIslandLift = islandFloat.interpolate({ inputRange: [0, 1], outputRange: [3, -1] });
  const footprintTilt = islandFloat.interpolate({ inputRange: [0, 1], outputRange: ["-1.2deg", "1.2deg"] });
  const playgroundTilt = islandFloat.interpolate({ inputRange: [0, 1], outputRange: ["1deg", "-1deg"] });
  const titleByView: Record<CreationTownView, string> = {
    hub: "家园",
    pet: "云宠小窝",
    footprints: "我们的足迹",
    playground: "今日娱乐",
  };

  const backAction = townView === "hub" ? onBack : () => onTownViewChange("hub");

  return (
    <View
      style={styles.creationTownPage}
      {...(Platform.OS === "web"
        ? {
            dataSet: {
              petTownView: townView,
              currentPetSurface: currentTownSurface,
              realPetSurface,
              petOnCurrentSurface: String(petOnCurrentTownSurface),
            },
          } as Record<string, unknown>
        : {})}
    >
      {townView === "hub" ? null : <TopBar title={titleByView[townView]} left={<BackButton onPress={backAction} />} />}

      {townView === "hub" ? (
        <View style={styles.creationHub}>
          <Image source={creationTownAssets.hubConcept} style={styles.creationHubConceptImage} resizeMode="cover" />
          <View pointerEvents="none" style={styles.creationHubVeil} />
          <Pressable accessibilityRole="button" accessibilityLabel="返回首页" onPress={onBack} style={styles.creationHubBackButton}>
            <ChevronLeft color={colors.ink} size={23} strokeWidth={2.4} />
          </Pressable>
          <View pointerEvents="none" {...petSafeContentProps()} style={styles.creationHubTitleBlock}>
            <Text style={styles.creationHubScreenTitle}>家园</Text>
          </View>
          {petOnCurrentTownSurface ? (
            <View pointerEvents="none" style={styles.creationHubCloudPetCover}>
              <View style={styles.creationHubCloudPetMask} />
              <View style={styles.creationHubCloudPetGlow}>
                <PetStage
                  petConfig={activeLive2DPet}
                  petName={petDisplayName}
                  petTitle={cloudPetOption.title}
                  petTrait={cloudPetOption.trait}
                  fullness={activeSpace?.fullness ?? 62}
                  cleanliness={activeSpace?.cleanliness ?? 64}
                  affection={activeSpace?.affection ?? 68}
                  energy={activeSpace?.energy ?? 72}
                  reaction={latestPetReaction}
                  rigCue={rigCue}
                  sizeScale={petStageScale}
                  reducedMotion={petUserSettings.reducedMotion}
                  scene="overlay"
                  mode="home"
                />
              </View>
            </View>
          ) : null}
          <Animated.View {...petAnchorProps("creation-pet-home", "creation-pet-home")} style={[styles.creationHubPetHotspot, { transform: [{ translateY: petIslandLift }] }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="进入云宠小窝" onPress={() => onTownViewChange("pet")} style={({ pressed }) => [styles.creationHubHotspotButton, pressed ? styles.creationIslandPressed : null]}>
              <View {...petSafeActionProps()} style={styles.creationHubPetLabel}>
                <Text style={styles.creationHubLabelTitle}>云宠小窝</Text>
                <Text style={styles.creationHubLabelBadge}>进入云宠小窝</Text>
                <Text style={styles.creationHubLabelText}>先在这里照顾你们的云宠</Text>
              </View>
            </Pressable>
          </Animated.View>
          <Animated.View {...petAnchorProps("creation-footprints", "creation-footprints")} style={[styles.creationHubFootprintHotspot, { transform: [{ translateY: footprintIslandLift }, { rotate: footprintTilt }] }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="进入我们的足迹" onPress={() => onTownViewChange("footprints")} style={({ pressed }) => [styles.creationHubHotspotButton, pressed ? styles.creationIslandPressed : null]}>
              <View {...petSafeActionProps()} style={styles.creationHubSmallLabel}>
                <Text style={styles.creationHubLabelTitle}>我们的足迹</Text>
                <Text style={styles.creationHubLabelText}>进入足迹记录</Text>
              </View>
            </Pressable>
          </Animated.View>
          <Animated.View {...petAnchorProps("creation-playground", "creation-playground")} style={[styles.creationHubGameHotspot, { transform: [{ translateY: playgroundIslandLift }, { rotate: playgroundTilt }] }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="进入今日娱乐" onPress={() => onTownViewChange("playground")} style={({ pressed }) => [styles.creationHubHotspotButton, pressed ? styles.creationIslandPressed : null]}>
              <View {...petSafeActionProps()} style={styles.creationHubSmallLabel}>
                <Text style={styles.creationHubLabelTitle}>今日娱乐</Text>
                <Text style={styles.creationHubLabelText}>进入今日挑战</Text>
              </View>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}

      {townView === "pet" ? (
        <View style={styles.creationCabin}>
          <Card soft style={styles.creationCabinStageCard}>
            <View style={styles.creationMeters}>
              <CreationMeter label="饱腹" value={activeSpace?.fullness ?? 62} color="#F4C870" />
              <CreationMeter label="洁净" value={activeSpace?.cleanliness ?? 64} color="#8CB7C8" />
              <CreationMeter label="亲密" value={activeSpace?.affection ?? 68} color="#E69CB2" />
              <CreationMeter label="精力" value={activeSpace?.energy ?? 72} color="#8EA77D" />
            </View>
            {petSleeping ? (
              <View style={styles.creationSleepNotice}>
                <Moon color={colors.accentDark} size={15} strokeWidth={2.5} />
                <Text style={styles.creationSleepNoticeText}>睡满 5 分钟恢复 18 点精力；中途被叫醒会按时长结算。</Text>
              </View>
            ) : null}
            <View {...petAnchorProps("pet-room-stage", "pet-stage")} style={styles.creationCabinStageWrap}>
              <Image source={creationTownAssets.cabinInterior} style={styles.creationCabinInteriorImage} resizeMode="cover" />
              {petOnCurrentTownSurface ? (
                <View style={styles.creationCabinPetStage}>
                  <PetStage
                    petKey={cloudPetOption.key}
                    petConfig={activeLive2DPet}
                    petName={petDisplayName}
                    petTitle={cloudPetOption.title}
                    petTrait={cloudPetOption.trait}
                    fullness={activeSpace?.fullness ?? 62}
                    cleanliness={activeSpace?.cleanliness ?? 64}
                    affection={activeSpace?.affection ?? 68}
                    energy={activeSpace?.energy ?? 72}
                    reaction={latestPetReaction}
                    rigCue={rigCue}
                    sizeScale={petStageScale}
                    reducedMotion={petUserSettings.reducedMotion}
                    scene="overlay"
                    mode="room"
                    onTapPet={() => void interactPet("pet")}
                    onStrokePet={() => void interactPet("pet")}
                    onPlayPet={() => void interactPet("play")}
                    onSleepPet={sleepPet}
                  />
                </View>
              ) : (
                <View style={styles.creationCabinSummonStage}>
                  <View style={styles.creationCabinSummonPanel}>
                    <View style={styles.creationCabinSummonIcon}>
                      <Home color={colors.accentDark} size={23} strokeWidth={2.5} />
                    </View>
                    <Text style={styles.creationCabinSummonTitle}>云宠不在小窝</Text>
                    <Text style={styles.creationCabinSummonText}>{petAwaySurfaceLine(realPetSurface)}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="召回云宠到小窝"
                    disabled={featuresDisabled || petSummoning}
                      onPress={() => void summonPetRoom()}
                      style={({ pressed }) => [
                        styles.creationCabinSummonButton,
                        pressed ? styles.creationCabinSummonButtonPressed : null,
                        petSummoning ? styles.creationCabinSummonButtonDisabled : null,
                      ]}
                    >
                      <Home color="#fff" size={17} strokeWidth={2.6} />
                      <Text style={styles.creationCabinSummonButtonText}>{petSummoning ? "召回中" : "召回云宠"}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel="打开共享粮仓" onPress={() => setGranaryOpen((open) => !open)} style={styles.creationGranaryButton}>
                <ShoppingBag color={colors.accentDark} size={20} strokeWidth={2.5} />
              <Text style={styles.creationGranaryButtonText}>{totalFoodCount}</Text>
              </Pressable>
            </View>
            {granaryOpen ? (
              <View style={styles.creationGranaryDrawer}>
                <View style={styles.creationGranaryHeader}>
                  <Text style={styles.creationGranaryTitle}>共享小粮仓</Text>
                  <Text style={styles.creationLevelText}>{treatBalance} 心愿星糖</Text>
                </View>
                <View style={styles.creationShopGrid}>
                  <CreationFoodCard
                    title="日常粮"
                    description="足迹打卡产出的温饱养分。"
                    price={6}
                    count={basicFoodCount}
                    icon={<Utensils color={colors.accentDark} size={18} strokeWidth={2.5} />}
                    loading={storeBusy === "basic"}
                    disabled={featuresDisabled || treatBalance < 6}
                    onBuy={() => void buyFood("basic")}
                  />
                  <CreationFoodCard
                    title="鲜食粮"
                    description="解谜通关带来的豪华加餐。"
                    price={14}
                    count={premiumFoodCount}
                    icon={<Sparkles color={colors.accentDark} size={18} strokeWidth={2.5} />}
                    loading={storeBusy === "premium"}
                    disabled={featuresDisabled || treatBalance < 14}
                    onBuy={() => void buyFood("premium")}
                  />
                </View>
                <View style={styles.creationActionRow}>
                  <SecondaryButton label={`投喂日常粮 · ${basicFoodCount}`} active={petBusy === "basic"} loading={petBusy === "basic"} disabled={featuresDisabled || basicFoodCount <= 0} onPress={() => void feedPet("basic")} icon={<Utensils color={colors.accentDark} size={16} />} />
                  <SecondaryButton label={`投喂鲜食粮 · ${premiumFoodCount}`} active={petBusy === "premium"} loading={petBusy === "premium"} disabled={featuresDisabled || premiumFoodCount <= 0} onPress={() => void feedPet("premium")} icon={<Sparkles color={colors.accentDark} size={16} />} />
                </View>
              </View>
            ) : null}
            <View style={styles.creationActionRow}>
              <SecondaryButton label={cleanButtonLabel} active={petBusy === "clean"} loading={petBusy === "clean"} disabled={featuresDisabled} onPress={() => void interactPet("clean")} icon={<ImagePlus color={colors.accentDark} size={16} />} />
              <SecondaryButton label={petBusy === "play" ? "陪玩中" : "陪玩"} active={petBusy === "play"} loading={petBusy === "play"} disabled={featuresDisabled} onPress={() => void interactPet("play")} icon={<Gamepad2 color={colors.accentDark} size={16} />} />
              <SecondaryButton label={sleepButtonLabel} active={petBusy === "sleep" || petSleeping} loading={petBusy === "sleep"} disabled={featuresDisabled} onPress={() => void sleepPet()} icon={<Moon color={colors.accentDark} size={16} />} />
            </View>
          </Card>

          <View style={styles.petMemoryTrailSection}>
            <View style={styles.petMemoryTrailHeader}>
              <View style={styles.petMemoryTrailTitleBlock}>
                <View style={styles.petMemoryTrailKicker}>
                  <Sparkles color={colors.accentDark} size={14} strokeWidth={2.6} />
                  <Text style={styles.petMemoryTrailKickerText}>小屋留下的痕迹</Text>
                </View>
                <Text style={styles.petMemoryTrailTitle}>最近发生的小事</Text>
              </View>
              <Text style={styles.petMemoryTrailCount}>最多 3 条</Text>
            </View>
            {visiblePetMemories.length ? (
              <View style={styles.petMemoryTrail}>
                {visiblePetMemories.map((memory, index) => (
                  <PetMemoryRow key={memory.id} memory={memory} isLast={index === visiblePetMemories.length - 1} onChanged={onChanged} disabled={petMemoryActionsDisabled} />
                ))}
              </View>
            ) : (
              <View style={styles.petMemoryEmptyTrail}>
                <View style={styles.petMemoryEmptyIcon}>
                  <Sparkles color={colors.accentDark} size={18} strokeWidth={2.5} />
                </View>
                <View style={styles.petMemoryEmptyCopy}>
                  <Text style={styles.petMemoryEmptyTitle}>还没有小屋痕迹</Text>
                  <Text style={styles.petMemoryEmptyText}>重要时刻会慢慢留在这里。</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      ) : null}

      {townView === "footprints" ? (
        <View style={styles.creationFootprintPage}>
          <View {...petAnchorProps("footprints-journey", "footprint-journey")}>
          <Card soft style={styles.creationJourneyCard}>
            <Image source={creationTownAssets.footprintsConcept} style={styles.creationJourneySceneImage} resizeMode="cover" />
            <View pointerEvents="none" style={styles.creationJourneySceneVeil} />
            <View style={styles.creationJourneyHeader}>
              <View style={styles.creationCompass}>
                <Compass color={colors.accentDark} size={30} strokeWidth={2.4} />
              </View>
              <View style={styles.creationJourneyCopy}>
                <Text style={styles.creationHeroTitle}>我们的足迹</Text>
                <Text style={styles.creationHeroText}>每点亮一个地方，都会变成云宠小家的日常粮和心愿星糖。</Text>
              </View>
            </View>
            <View style={styles.creationPolaroidRail}>
              {displayedFootprints.length ? (
                displayedFootprints.map((footprint) => {
                  const mine = footprint.created_by === user?.id;
                  return (
                    <View key={footprint.id} {...petAnchorProps(`footprint-card-${footprint.id}`, "footprint-card")} style={styles.creationPolaroid}>
                      <View style={styles.creationTimelineHeart}>
                        <Heart color={colors.accentDark} fill={colors.accentDark} size={11} />
                      </View>
                      <View style={styles.creationPolaroidPin}>
                        <MapPin color={colors.accentDark} size={15} strokeWidth={2.5} />
                      </View>
                      <View style={styles.creationPolaroidPhoto}>
                        <MapPin color="#fff" size={17} strokeWidth={2.5} />
                      </View>
                      <Text style={styles.creationFootprintTitle}>{footprint.title}</Text>
                      <Text style={styles.creationFootprintMeta}>{formatMemoryDate(footprint.visited_at)}{footprint.note ? ` · ${footprint.note}` : ""}</Text>
                      {mine ? (
                        <View {...petSafeActionProps()} style={styles.creationFootprintActions}>
                          <SecondaryButton label="编辑" onPress={() => {
                            beginEditFootprint(footprint);
                            setFootprintFormOpen(true);
                          }} />
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
            <View {...petSafeActionProps()}>
            <SecondaryButton label="+ 记录新的足迹" onPress={() => {
              resetFootprintForm();
              setFootprintFormOpen(true);
            }} icon={<MapPin color={colors.accentDark} size={16} />} />
            </View>
          </Card>
          </View>
        </View>
      ) : null}

      {townView === "playground" ? (
        <View style={styles.creationPlayground}>
          <View {...petAnchorProps("playground-card", "playground-card")}>
          <Card soft style={styles.creationPuzzleEnvelope}>
            <Image source={creationTownAssets.playgroundConcept} style={styles.creationPuzzleSceneImage} resizeMode="cover" />
            <View pointerEvents="none" style={styles.creationPuzzleSceneVeil} />
            <View style={styles.creationPuzzleTopLine}>
              <View style={styles.creationPuzzleBadge}>
                <Brain color={colors.accentDark} size={15} strokeWidth={2.5} />
                <Text style={styles.creationPuzzleBadgeText}>今日挑战 · {currentPuzzle.type}</Text>
              </View>
              <View style={styles.creationPuzzleStars}>
                {[0, 1, 2].map((star) => (
                  <Star key={star} color="#d7a24e" fill="#f8d783" size={14} />
                ))}
              </View>
            </View>
            <Text style={styles.creationPuzzleQuestion}>{currentPuzzle.question}</Text>
            <View style={styles.creationPuzzleOptions}>
              {currentPuzzle.options.map((option) => {
                const active = selectedPuzzleAnswer === option;
                return (
                  <Pressable
                    {...petSafeActionProps()}
                    key={option}
                    accessibilityRole="button"
                    accessibilityLabel={`选择答案 ${option}`}
                    onPress={() => {
                      haptics.selection();
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
            {puzzleFeedback === "correct" ? <InlineNotice tone="success">答对啦，鲜食粮和心愿星糖会飞进共享小粮仓。</InlineNotice> : null}
            <View {...petSafeActionProps()} style={styles.creationActionRow}>
              <SecondaryButton label="换一题" onPress={switchPuzzle} icon={<Gamepad2 color={colors.accentDark} size={16} />} />
              <PrimaryButton label={gameBusy ? "入仓中" : "答对领取加餐"} onPress={() => void claimPuzzleReward()} loading={gameBusy} disabled={featuresDisabled} icon={<Sparkles color="#fff" size={16} strokeWidth={2.5} />} />
            </View>
          </Card>
          </View>
        </View>
      ) : null}
      {footprintFormOpen ? (
        <FootprintEditorModal
          editing={Boolean(editingFootprintId)}
          title={footprintTitle}
          date={footprintDate}
          note={footprintNote}
          busy={footprintBusy}
          canSave={canSaveFootprint}
          onTitleChange={setFootprintTitle}
          onDateChange={setFootprintDate}
          onNoteChange={setFootprintNote}
          onCancel={() => {
            resetFootprintForm();
            setFootprintFormOpen(false);
          }}
          onSave={saveFootprint}
        />
      ) : null}
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

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onPress} style={styles.backButton}>
      <ChevronLeft color={colors.accentDark} size={20} strokeWidth={2.6} />
    </Pressable>
  );
}
