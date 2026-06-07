import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Mail } from "lucide-react-native";

import type { CreationLivePetAction, CreationPetStageReaction } from "@/features/pet/components/PetStage";
import { Live2DCanvas } from "@/features/pet/components/Live2DCanvas";
import { petRigCueFromJson } from "@/features/pet/services/petAiBrain";
import type { PetWorldSurface } from "@/features/pet-world/logic/petWorldRoutes";
import type { CreationSpace } from "@/lib/supabase/database.types";
import { colors } from "@/styles/theme";

type PetLayerSurface = Extract<PetWorldSurface, "home" | "share" | "memory">;
type PetAnchorName =
  | "home-love-days"
  | "home-love-letter"
  | "home-creation-entry"
  | "share-capsule-composer"
  | "share-today-capsule"
  | "memory-pet-cue"
  | "memory-hero"
  | "memory-calendar";

export type GlobalPetLayerProps = {
  visible: boolean;
  surface?: PetLayerSurface;
  creationSpace: CreationSpace | null;
  realtimeReaction?: CreationPetStageReaction | null;
  onOpenCreation?: () => void;
};

const anchorsBySurface: Record<PetLayerSurface, PetAnchorName[]> = {
  home: ["home-love-days", "home-love-letter", "home-creation-entry"],
  share: ["share-today-capsule", "share-capsule-composer"],
  memory: ["memory-pet-cue", "memory-hero", "memory-calendar"],
};
const petWidth = 116;
const petHeight = 154;
const dragReleaseMs = 90_000;

export function GlobalPetLayer({ visible, surface = "home", creationSpace, realtimeReaction, onOpenCreation }: GlobalPetLayerProps) {
  const [anchorIndex, setAnchorIndex] = useState(0);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const manualPositionRef = useRef<{ x: number; y: number; updatedAt: number } | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const surfaceAnchors = anchorsBySurface[surface] ?? anchorsBySurface.home;
  const activeAnchor = surfaceAnchors[anchorIndex % surfaceAnchors.length];
  const reaction = realtimeReaction ?? reactionFromSpace(creationSpace);
  const action = reaction?.action ?? creationSpace?.current_action ?? "idle";
  const worldDecision = useMemo(() => petWorldDecisionFromJson(creationSpace?.last_world_decision), [creationSpace?.last_world_decision]);
  const prop = worldDecision?.prop;
  const symbol = worldDecision?.symbol;
  const bubble = reaction?.message || worldDecision?.speech || worldDecision?.bubble || sanitizeStoredPetWorldBubble(creationSpace?.last_ai_bubble) || bubbleForAnchor(activeAnchor, prop);
  const rigCue = useMemo(() => petRigCueFromJson(creationSpace?.last_rig_cue), [creationSpace?.last_rig_cue]);

  useEffect(() => {
    manualPositionRef.current = null;
    setAnchorIndex(0);
    setPosition(null);
  }, [surface]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const interval = window.setInterval(() => {
      const manual = manualPositionRef.current;
      if (manual && Date.now() - manual.updatedAt < dragReleaseMs) {
        return;
      }
      manualPositionRef.current = null;
      setAnchorIndex((index) => (index + 1) % surfaceAnchors.length);
    }, 9000);
    return () => window.clearInterval(interval);
  }, [surfaceAnchors.length, visible]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const updatePosition = () => {
      const manual = manualPositionRef.current;
      if (manual && Date.now() - manual.updatedAt < dragReleaseMs) {
        setPosition(clampPosition(manual.x, manual.y));
        return;
      }
      manualPositionRef.current = null;
      setPosition(resolveAnchorPosition(activeAnchor));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { passive: true });
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [activeAnchor, visible]);

  useEffect(() => {
    if (!dragging) {
      return undefined;
    }
    const handleMove = (event: PointerEvent) => {
      const next = clampPosition(event.clientX - dragOffsetRef.current.x, event.clientY - dragOffsetRef.current.y);
      manualPositionRef.current = { ...next, updatedAt: Date.now() };
      setPosition(next);
    };
    const handleUp = () => {
      setDragging(false);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [dragging]);

  if (Platform.OS !== "web" || typeof document === "undefined" || !visible || !creationSpace || !position) {
    return null;
  }

  const layer = (
    <div style={portalHostStyle} data-live2d-global-pet-layer={surface}>
      <div
        data-live2d-global-pet={surface}
        data-live2d-global-anchor={activeAnchor}
        style={{
          ...petWrapBaseStyle,
          left: position.x,
          top: position.y,
          cursor: dragging ? "grabbing" : "grab",
        } as never}
        onPointerDown={(event) => {
          event.preventDefault();
          dragOffsetRef.current = { x: event.clientX - position.x, y: event.clientY - position.y };
          setDragging(true);
        }}
        onDoubleClick={onOpenCreation}
      >
        <View pointerEvents="none" style={styles.bubble}>
          {symbol ? <Text style={styles.bubbleSymbol}>{symbolLabel(symbol)}</Text> : null}
          <Text style={styles.bubbleText} numberOfLines={2}>{bubble}</Text>
        </View>
        <View pointerEvents="none" style={styles.petStage}>
          <Live2DCanvas action={action} rigCue={rigCue} compact />
        </View>
        {prop === "letter" ? (
          <View pointerEvents="none" style={styles.letterProp}>
            <Mail color={colors.accentDark} size={18} strokeWidth={2.5} />
          </View>
        ) : null}
        {prop === "photo" || prop === "memory" ? (
          <View pointerEvents="none" style={styles.memoryProp}>
            <Text style={styles.memoryPropText}>◌</Text>
          </View>
        ) : null}
      </div>
    </div>
  );

  return createPortal(layer, document.body);
}

function reactionFromSpace(space: CreationSpace | null): CreationPetStageReaction | null {
  if (!space || space.current_action === "idle" || space.current_action === "walk") {
    return null;
  }
  return {
    id: new Date(space.updated_at).getTime() || Date.now(),
    action: space.current_action,
    message: space.last_ai_bubble || fallbackLine(space.current_action),
  };
}

function fallbackLine(action: CreationLivePetAction) {
  if (action === "eat") return "吃饱啦，想贴贴你";
  if (action === "pet") return "手别停嘛，再摸摸";
  if (action === "clean") return "小窝香香的，我喜欢";
  if (action === "sleep") return "我想靠着你睡会儿";
  if (action === "happy") return "今天也贴着你们";
  if (action === "sad") return "想要你陪陪我";
  return "我在这儿。";
}

function petWorldDecisionFromJson(value: CreationSpace["last_world_decision"] | null | undefined): { bubble?: string; speech?: string; symbol?: "heart" | "sparkle" | "letter" | "photo" | "memory" | "food" | "sleep"; prop?: "letter" | "photo" | "memory" | "none" } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const world = raw.world && typeof raw.world === "object" && !Array.isArray(raw.world) ? raw.world as Record<string, unknown> : raw;
  const prop = world.prop === "letter" || world.prop === "photo" || world.prop === "memory" || world.prop === "none" ? world.prop : undefined;
  const symbol = world.symbol === "heart" || world.symbol === "sparkle" || world.symbol === "letter" || world.symbol === "photo" || world.symbol === "memory" || world.symbol === "food" || world.symbol === "sleep" ? world.symbol : undefined;
  const speech = sanitizeStoredPetWorldBubble(typeof world.speech === "string" ? world.speech : undefined);
  const bubble = sanitizeStoredPetWorldBubble(typeof world.bubble === "string" ? world.bubble : undefined);
  return { prop, speech, symbol, bubble };
}

function sanitizeStoredPetWorldBubble(bubble?: string | null) {
  const text = bubble?.trim();
  if (!text) {
    return undefined;
  }
  if (/(足迹页|足迹|游乐场|心情乐园|小游戏|跑去|去看看|去看)/.test(text)) {
    return undefined;
  }
  return text.slice(0, 28);
}

function symbolLabel(symbol: "heart" | "sparkle" | "letter" | "photo" | "memory" | "food" | "sleep") {
  if (symbol === "heart") return "♡";
  if (symbol === "sparkle") return "✦";
  if (symbol === "letter") return "✉";
  if (symbol === "photo") return "◌";
  if (symbol === "memory") return "◇";
  if (symbol === "food") return "◍";
  return "☾";
}

function bubbleForAnchor(anchor: PetAnchorName, prop?: "letter" | "photo" | "memory" | "none") {
  if (prop === "letter") {
    return "我叼着信来找你啦";
  }
  if (prop === "photo") {
    return "这张我想多看一会儿";
  }
  if (prop === "memory") {
    return "我在记忆页慢慢看";
  }
  if (anchor === "home-love-letter") {
    return "我闻到信纸香香的";
  }
  if (anchor === "home-creation-entry") {
    return "小窝入口在这里呀";
  }
  if (anchor === "share-capsule-composer") {
    return "我在分享页等你";
  }
  if (anchor === "share-today-capsule") {
    return "这颗胶囊亮亮的";
  }
  if (anchor === "memory-calendar") {
    return "我在日历边看风铃";
  }
  if (anchor === "memory-pet-cue") {
    return "这张我想多看一会儿";
  }
  if (anchor === "memory-hero") {
    return "记忆页有光在响";
  }
  return "我在恋爱天数旁边";
}

function resolveAnchorPosition(anchor: PetAnchorName) {
  const rect = document.querySelector(`[data-pet-anchor="${anchor}"]`)?.getBoundingClientRect();
  if (!rect) {
    return clampPosition(window.innerWidth - petWidth - 22, window.innerHeight * 0.52);
  }
  if (anchor === "home-love-letter") {
    return clampPosition(rect.right - petWidth * 0.92, rect.top - petHeight * 0.58);
  }
  if (anchor === "home-creation-entry") {
    return clampPosition(rect.left - petWidth * 0.86, rect.top - petHeight - 12);
  }
  if (anchor === "share-capsule-composer") {
    return clampPosition(rect.right - petWidth * 0.9, rect.top + 4);
  }
  if (anchor === "share-today-capsule") {
    return clampPosition(rect.right - petWidth * 0.86, rect.top - petHeight * 0.34);
  }
  if (anchor === "memory-hero") {
    return clampPosition(rect.right - petWidth * 0.82, rect.top + rect.height * 0.1);
  }
  if (anchor === "memory-pet-cue") {
    return clampPosition(rect.right - petWidth * 0.78, rect.top - petHeight * 0.35);
  }
  if (anchor === "memory-calendar") {
    return clampPosition(rect.right - petWidth * 0.78, rect.top - petHeight * 0.34);
  }
  return clampPosition(rect.right - petWidth * 0.72, rect.top + rect.height * 0.42);
}

function clampPosition(x: number, y: number) {
  const margin = 10;
  const maxX = Math.max(margin, window.innerWidth - petWidth - margin);
  const maxY = Math.max(margin, window.innerHeight - petHeight - 92);
  return {
    x: Math.round(Math.max(margin, Math.min(x, maxX))),
    y: Math.round(Math.max(72, Math.min(y, maxY))),
  };
}

const portalHostStyle = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  zIndex: 45,
} satisfies CSSProperties;

const petWrapBaseStyle = {
  position: "fixed",
  width: petWidth,
  height: petHeight,
  pointerEvents: "auto",
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
} satisfies CSSProperties;

const styles = StyleSheet.create({
  petStage: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 124,
  },
  letterProp: {
    position: "absolute",
    right: 5,
    bottom: 28,
    width: 34,
    height: 26,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.18)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 18px rgba(116,74,89,0.14)",
    transform: [{ rotate: "-8deg" }],
    zIndex: 3,
  },
  memoryProp: {
    position: "absolute",
    left: 12,
    bottom: 26,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.14)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 18px rgba(116,74,89,0.12)",
    zIndex: 3,
  },
  memoryPropText: {
    color: colors.accentDark,
    fontSize: 19,
    lineHeight: 22,
    fontWeight: "900",
  },
  bubble: {
    position: "absolute",
    left: -12,
    right: -14,
    top: 0,
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.14)",
    boxShadow: "0 12px 24px rgba(116,74,89,0.14)",
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  bubbleSymbol: {
    color: colors.accentDark,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
  },
  bubbleText: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    textAlign: "center",
  },
});
