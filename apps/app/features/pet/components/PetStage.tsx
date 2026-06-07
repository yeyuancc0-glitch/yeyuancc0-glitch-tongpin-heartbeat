import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Heart, Moon, Sparkles, Utensils } from "lucide-react-native";

import { BouncyPressable } from "@/motion/BouncyPressable";
import { haptics } from "@/motion/haptics";
import { motionTokens } from "@/motion/tokens";
import { colors } from "@/styles/theme";
import type { PetRigCue } from "@/features/pet/services/petAiBrain";
import { Live2DCanvas } from "./Live2DCanvas";

export type CreationLivePetAction = "idle" | "walk" | "eat" | "pet" | "clean" | "play" | "sleep" | "sad" | "happy";

export type CreationPetStageReaction = {
  id: number;
  action: CreationLivePetAction;
  message: string;
};

export type PetStageMode = "home" | "room";

export type PetStageProps = {
  petKey?: string;
  petName?: string;
  petTitle?: string;
  petTrait?: string;
  fullness?: number;
  cleanliness?: number;
  affection?: number;
  energy?: number;
  reaction?: CreationPetStageReaction | null;
  rigCue?: PetRigCue | null;
  scene?: "card" | "overlay";
  mode?: PetStageMode;
  style?: StyleProp<ViewStyle>;
  onTapPet?: () => void;
  onStrokePet?: () => void;
  onOpenRoom?: () => void;
  onSleepPet?: () => void;
};

const localLines: Record<CreationLivePetAction, string> = {
  idle: "我在小窝里等你",
  walk: "我慢慢走过来啦",
  eat: "吃饱啦，想贴贴你",
  pet: "手别停嘛，再摸摸",
  clean: "小窝香香的，我喜欢",
  play: "还想和你玩一会儿",
  sleep: "我想靠着你睡会儿",
  sad: "想要你陪陪我",
  happy: "今天也贴着你们",
};

export function PetStage({
  petName = "小猫",
  petTitle = "Live2D 小猫",
  petTrait = "共享小窝伙伴",
  fullness = 62,
  cleanliness = 64,
  affection = 68,
  energy = 72,
  reaction,
  rigCue,
  scene = "card",
  mode = "room",
  style,
  onTapPet,
  onStrokePet,
  onOpenRoom,
  onSleepPet,
}: PetStageProps) {
  const [localReaction, setLocalReaction] = useState<CreationPetStageReaction | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const pulse = useRef(new Animated.Value(0)).current;
  const activeReaction = localReaction ?? reaction;
  const action = activeReaction?.action ?? actionFromState({ fullness, cleanliness, energy });
  const bubble = activeReaction?.message || localLines[action];
  const compact = mode === "home";

  useEffect(() => {
    if (!activeReaction) {
      return undefined;
    }
    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: 180,
        useNativeDriver: false,
      }),
      Animated.spring(pulse, {
        toValue: 0,
        ...motionTokens.spring.gentle,
        useNativeDriver: false,
      }),
    ]).start();
    if (activeReaction === localReaction) {
      const timeout = setTimeout(() => setLocalReaction(null), 2600);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [activeReaction, localReaction, pulse]);

  const stageScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const meterValues = useMemo(
    () => [
      { key: "affection", label: "亲密", value: affection, color: colors.accent },
      { key: "fullness", label: "饱足", value: fullness, color: "#E8B962" },
      { key: "cleanliness", label: "清爽", value: cleanliness, color: colors.blue },
      { key: "energy", label: "精力", value: energy, color: colors.green },
    ],
    [affection, cleanliness, energy, fullness],
  );

  function triggerLocal(actionType: CreationLivePetAction, message = localLines[actionType]) {
    haptics.play("light");
    setLocalReaction({ id: Date.now(), action: actionType, message });
  }

  function handleTap() {
    triggerLocal("pet");
    onTapPet?.();
  }

  function handleLongPress() {
    triggerLocal("pet", "手别停嘛，再摸摸");
    onStrokePet?.();
  }

  function handleSleep() {
    triggerLocal("sleep");
    onSleepPet?.();
  }

  return (
    <View style={[scene === "overlay" ? styles.overlayStage : styles.cardStage, style]}>
      <View pointerEvents="none" style={styles.skyGlow} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`抚摸${petName}`}
        onPress={handleTap}
        onLongPress={handleLongPress}
        delayLongPress={360}
        style={styles.live2dHitArea}
      >
        <Animated.View style={[styles.live2dLift, { transform: [{ scale: stageScale }] }]}>
          <Live2DCanvas action={action} rigCue={rigCue} compact={compact} onLoadStateChange={setLoadState} />
        </Animated.View>
      </Pressable>

      <View pointerEvents="none" style={[styles.bubble, compact ? styles.bubbleCompact : null]}>
        <Text style={styles.bubbleText}>{bubble}</Text>
      </View>

      {scene === "card" ? (
        <View style={styles.infoPanel}>
          <View style={styles.identityRow}>
            <View style={styles.identityCopy}>
              <Text style={styles.petName}>{petName}</Text>
              <Text style={styles.petMeta}>{petTitle} · {petTrait}</Text>
            </View>
            <View style={styles.live2dBadge}>
              <Sparkles color={colors.accentDark} size={14} strokeWidth={2.5} />
              <Text style={styles.live2dBadgeText}>{loadState === "ready" ? "Live2D" : "Web"}</Text>
            </View>
          </View>
          <View style={styles.meterGrid}>
            {meterValues.map((item) => (
              <PetMeter key={item.key} label={item.label} value={item.value} color={item.color} />
            ))}
          </View>
          <View style={styles.actionRow}>
            <StageActionButton label="摸摸" icon={<Heart color={colors.accentDark} size={15} />} onPress={handleTap} />
            <StageActionButton label="喂食反馈" icon={<Utensils color={colors.accentDark} size={15} />} onPress={() => triggerLocal("eat")} />
            <StageActionButton label="哄睡" icon={<Moon color={colors.accentDark} size={15} />} onPress={handleSleep} />
          </View>
          {onOpenRoom ? (
            <BouncyPressable accessibilityRole="button" onPress={onOpenRoom} style={styles.openRoomButton}>
              <Text style={styles.openRoomText}>进入小窝</Text>
            </BouncyPressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function actionFromState({
  fullness,
  cleanliness,
  energy,
}: {
  fullness: number;
  cleanliness: number;
  energy: number;
}): CreationLivePetAction {
  if (energy < 22) return "sleep";
  if (fullness < 24 || cleanliness < 24) return "sad";
  return "idle";
}

function PetMeter({ label, value, color }: { label: string; value: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View style={styles.meter}>
      <View style={styles.meterTop}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={styles.meterValue}>{clamped}</Text>
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${clamped}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function StageActionButton({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <BouncyPressable accessibilityRole="button" onPress={onPress} style={styles.stageActionButton}>
      {icon}
      <Text style={styles.stageActionText}>{label}</Text>
    </BouncyPressable>
  );
}

const styles = StyleSheet.create({
  cardStage: {
    position: "relative",
    minHeight: 430,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#fff6ef",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.88)",
  },
  overlayStage: {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 270,
    overflow: "hidden",
  },
  skyGlow: {
    position: "absolute",
    left: -24,
    right: -24,
    top: -24,
    bottom: -24,
    backgroundImage: Platform.OS === "web" ? "radial-gradient(circle at 50% 20%, rgba(255,255,255,0.9), rgba(255,238,229,0.28) 44%, rgba(255,255,255,0) 72%)" as never : undefined,
    backgroundColor: Platform.OS === "web" ? "transparent" : "rgba(255,246,239,0.5)",
  },
  live2dHitArea: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
  },
  live2dLift: {
    width: "100%",
    height: "100%",
    zIndex: 2,
  },
  bubble: {
    position: "absolute",
    left: 18,
    top: 16,
    maxWidth: 235,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.14)",
    zIndex: 4,
    boxShadow: "0 12px 26px rgba(116,74,89,0.12)",
  },
  bubbleCompact: {
    left: 10,
    top: 8,
    maxWidth: 190,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  bubbleText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  infoPanel: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    borderRadius: 24,
    padding: 13,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.86)",
    zIndex: 5,
    gap: 11,
    boxShadow: "0 16px 34px rgba(82,61,66,0.12)",
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  petName: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  petMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  live2dBadge: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    backgroundColor: colors.accentSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  live2dBadgeText: {
    color: colors.accentDark,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
  },
  meterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  meter: {
    width: "48%",
    gap: 5,
  },
  meterTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  meterLabel: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  meterValue: {
    color: colors.ink,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
  },
  meterTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(201,187,194,0.2)",
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    borderRadius: 999,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stageActionButton: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,247,245,0.92)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  stageActionText: {
    color: colors.accentDark,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
  },
  openRoomButton: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  openRoomText: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
});
