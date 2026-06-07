import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Mail } from "lucide-react-native";

import type { CreationLivePetAction, CreationPetStageReaction } from "@/features/pet/components/PetStage";
import { Live2DCanvas } from "@/features/pet/components/Live2DCanvas";
import { activeLive2DPet } from "@/features/pet/live2dCatalog";
import { petRigCueFromJson } from "@/features/pet/services/petAiBrain";
import { petSizeScale, type PetUserSettings } from "@/features/pet/userPetSettings";
import { sanitizeDirectPetText, sanitizePassivePetText } from "@/features/pet-world/logic/petExpression";
import type { PetWorldSurface } from "@/features/pet-world/logic/petWorldRoutes";
import type { CreationSpace } from "@/lib/supabase/database.types";
import { colors } from "@/styles/theme";

type PetLayerSurface = Extract<PetWorldSurface, "home" | "share" | "memory">;
type PetAnchorName =
  | "home-love-days"
  | "home-quick-sync"
  | "home-photo-album"
  | "home-message-board"
  | "home-pet-stage"
  | "home-love-letter"
  | "home-creation-entry"
  | "share-capsule-composer"
  | "share-today-capsule"
  | "share-letter-delivery"
  | "memory-pet-cue"
  | "memory-hero"
  | "memory-calendar";

export type GlobalPetLayerProps = {
  visible: boolean;
  surface?: PetLayerSurface;
  creationSpace: CreationSpace | null;
  realtimeReaction?: CreationPetStageReaction | null;
  onOpenCreation?: () => void;
  userSettings?: Pick<PetUserSettings, "size" | "soundEnabled" | "reducedMotion" | "positionResetAt">;
};

const anchorsBySurface: Record<PetLayerSurface, PetAnchorName[]> = {
  home: ["home-love-days", "home-quick-sync", "home-photo-album", "home-message-board", "home-pet-stage", "home-love-letter", "home-creation-entry"],
  share: ["share-today-capsule", "share-capsule-composer", "share-letter-delivery"],
  memory: ["memory-pet-cue", "memory-hero", "memory-calendar"],
};
const petWidth = 116;
const petHeight = 154;
const dragReleaseMs = 90_000;
const bubbleVisibleMs = 2_800;
const walkSpeedPxPerSecond = 95;
const minWalkMs = 900;
const maxWalkMs = 3_600;
const pageTopPadding = 72;
const pageBottomPadding = 92;
const walkLanePadding = 8;
const walkWigglePx = 18;

export function GlobalPetLayer({ visible, surface = "home", creationSpace, realtimeReaction, onOpenCreation, userSettings }: GlobalPetLayerProps) {
  const [anchorIndex, setAnchorIndex] = useState(() => randomAnchorIndex(anchorsBySurface.home.length));
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [moving, setMoving] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const positionRef = useRef<{ x: number; y: number } | null>(null);
  const manualPositionRef = useRef<{ x: number; y: number; updatedAt: number } | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const walkAnimationRef = useRef<number | null>(null);
  const bubbleTimerRef = useRef<number | null>(null);
  const lastBubbleKeyRef = useRef<string | null>(null);
  const surfaceAnchors = anchorsBySurface[surface] ?? anchorsBySurface.home;
  const activeAnchor = surfaceAnchors[anchorIndex % surfaceAnchors.length];
  const reaction = realtimeReaction ?? null;
  const action = reaction?.action ?? creationSpace?.current_action ?? "idle";
  const worldDecision = useMemo(() => petWorldDecisionFromJson(creationSpace?.last_world_decision), [creationSpace?.last_world_decision]);
  const prop = worldDecision?.prop;
  const symbol = worldDecision?.symbol;
  const bubble = bubbleForPetState({ reaction, worldDecision, activeAnchor, prop });
  const rigCue = useMemo(() => petRigCueFromJson(creationSpace?.last_rig_cue), [creationSpace?.last_rig_cue]);
  const liveAction: CreationLivePetAction = moving && !dragging ? "walk" : action;
  const bubbleKey = `${reaction?.id ?? ""}:${worldDecision?.speech ?? ""}:${worldDecision?.bubble ?? ""}:${symbol ?? ""}:${prop ?? ""}:${activeAnchor}`;
  const actionKey = `${liveAction}:${moving ? "moving" : "still"}:${reaction?.id ?? ""}:${activeAnchor}`;
  const soundEnabled = userSettings?.soundEnabled ?? true;
  const reducedMotion = Boolean(userSettings?.reducedMotion);
  const sizeScale = petSizeScale(userSettings?.size ?? activeLive2DPet.defaultSize);
  const petSize = useMemo(() => ({
    width: Math.round(petWidth * sizeScale),
    height: Math.round(petHeight * sizeScale),
  }), [sizeScale]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      return;
    }
    const host = document.querySelector<HTMLElement>("[data-app-scroll-content='true']") ?? document.body;
    setPortalHost(host);
  }, [visible]);

  const setPositionNow = useCallback((next: { x: number; y: number }) => {
    positionRef.current = next;
    setPosition(next);
  }, []);

  const cancelWalkAnimation = useCallback(() => {
    if (walkAnimationRef.current !== null) {
      window.cancelAnimationFrame(walkAnimationRef.current);
      walkAnimationRef.current = null;
    }
  }, []);

  const moveToPosition = useCallback((target: { x: number; y: number }, immediate = false) => {
    const next = clampPosition(target.x, target.y, portalHost, petSize);
    const start = positionRef.current;
    cancelWalkAnimation();

    if (immediate || !start) {
      setMoving(false);
      setPositionNow(next);
      return;
    }

    const dx = next.x - start.x;
    const dy = next.y - start.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 2) {
      setMoving(false);
      setPositionNow(next);
      return;
    }

    const duration = Math.max(minWalkMs, Math.min(maxWalkMs, distance / (reducedMotion ? walkSpeedPxPerSecond * 0.72 : walkSpeedPxPerSecond) * 1000));
    const startedAt = window.performance.now();
    setMoving(true);
    const crossAxis = reducedMotion ? { x: 0, y: 0, wiggle: 0 } : walkingCrossAxis(start, next, portalHost);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = easeInOutCubic(progress);
      const wiggle = Math.sin(progress * Math.PI) * crossAxis.wiggle;
      setPositionNow({
        x: Math.round(start.x + dx * eased + crossAxis.x * wiggle),
        y: Math.round(start.y + dy * eased + crossAxis.y * wiggle),
      });

      if (progress < 1) {
        walkAnimationRef.current = window.requestAnimationFrame(tick);
        return;
      }
      walkAnimationRef.current = null;
      setMoving(false);
      setPositionNow(next);
    };

    walkAnimationRef.current = window.requestAnimationFrame(tick);
  }, [cancelWalkAnimation, petSize, portalHost, reducedMotion, setPositionNow]);

  useEffect(() => {
    cancelWalkAnimation();
    manualPositionRef.current = null;
    positionRef.current = null;
    lastBubbleKeyRef.current = null;
    setAnchorIndex(randomAnchorIndex(surfaceAnchors.length));
    setPosition(null);
    setMoving(false);
    setBubbleVisible(false);
  }, [cancelWalkAnimation, surface, surfaceAnchors.length]);

  useEffect(() => {
    if (!userSettings?.positionResetAt) {
      return;
    }
    cancelWalkAnimation();
    manualPositionRef.current = null;
    positionRef.current = null;
    setPosition(null);
    setMoving(false);
    setAnchorIndex(randomAnchorIndex(surfaceAnchors.length));
  }, [cancelWalkAnimation, surfaceAnchors.length, userSettings?.positionResetAt]);

  useEffect(() => {
    if (!visible || !bubble) {
      if (bubbleTimerRef.current !== null) {
        window.clearTimeout(bubbleTimerRef.current);
        bubbleTimerRef.current = null;
      }
      setBubbleVisible(false);
      return undefined;
    }
    if (lastBubbleKeyRef.current === bubbleKey) {
      return undefined;
    }
    lastBubbleKeyRef.current = bubbleKey;
    setBubbleVisible(true);
    if (bubbleTimerRef.current !== null) {
      window.clearTimeout(bubbleTimerRef.current);
    }
    bubbleTimerRef.current = window.setTimeout(() => {
      setBubbleVisible(false);
      bubbleTimerRef.current = null;
    }, bubbleVisibleMs);
    return () => {
      if (bubbleTimerRef.current !== null) {
        window.clearTimeout(bubbleTimerRef.current);
        bubbleTimerRef.current = null;
      }
    };
  }, [bubble, bubbleKey, visible]);

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
    }, reducedMotion ? 15_000 : 9000);
    return () => window.clearInterval(interval);
  }, [reducedMotion, surfaceAnchors.length, visible]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const updatePosition = (immediate = false) => {
      const manual = manualPositionRef.current;
      if (manual && Date.now() - manual.updatedAt < dragReleaseMs) {
        cancelWalkAnimation();
        setMoving(false);
        setPositionNow(clampPosition(manual.x, manual.y, portalHost, petSize));
        return;
      }
      manualPositionRef.current = null;
      moveToPosition(resolveAnchorPosition(activeAnchor, portalHost, petSize), immediate || !positionRef.current);
    };
    const handleResize = () => updatePosition(true);
    updatePosition(!positionRef.current);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [activeAnchor, cancelWalkAnimation, moveToPosition, petSize, portalHost, setPositionNow, visible]);

  useEffect(() => {
    if (!dragging) {
      return undefined;
    }
    const handleMove = (event: PointerEvent) => {
      const pointer = localPointer(event, portalHost);
      const next = clampPosition(pointer.x - dragOffsetRef.current.x, pointer.y - dragOffsetRef.current.y, portalHost, petSize);
      manualPositionRef.current = { ...next, updatedAt: Date.now() };
      setPositionNow(next);
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
  }, [dragging, petSize, portalHost, setPositionNow]);

  useEffect(() => {
    return () => {
      cancelWalkAnimation();
      if (bubbleTimerRef.current !== null) {
        window.clearTimeout(bubbleTimerRef.current);
      }
    };
  }, [cancelWalkAnimation]);

  if (Platform.OS !== "web" || typeof document === "undefined" || !visible || !creationSpace || !position || !portalHost) {
    return null;
  }

  const layer = (
    <div style={portalHostStyle} data-live2d-global-pet-layer={surface}>
      <div
        data-live2d-global-pet={surface}
        data-live2d-global-anchor={activeAnchor}
        style={{
          ...petWrapBaseStyle,
          width: petSize.width,
          height: petSize.height,
          left: position.x,
          top: position.y,
          cursor: dragging ? "grabbing" : "grab",
        } as never}
        onPointerDown={(event) => {
          event.preventDefault();
          cancelWalkAnimation();
          setMoving(false);
          setBubbleVisible(false);
          const pointer = localPointer(event, portalHost);
          dragOffsetRef.current = { x: pointer.x - position.x, y: pointer.y - position.y };
          setDragging(true);
        }}
        onDoubleClick={onOpenCreation}
        data-live2d-global-action={liveAction}
        data-live2d-global-moving={moving ? "true" : "false"}
        data-live2d-global-size={userSettings?.size ?? activeLive2DPet.defaultSize}
        data-live2d-global-sound={soundEnabled ? "on" : "off"}
        data-live2d-global-reduced-motion={reducedMotion ? "true" : "false"}
      >
        {bubbleVisible ? (
          <div data-live2d-pet-bubble="true">
            <View pointerEvents="none" style={styles.bubble}>
              {symbol ? <Text style={styles.bubbleSymbol}>{symbolLabel(symbol)}</Text> : null}
              <Text style={styles.bubbleText} numberOfLines={2}>{bubble}</Text>
            </View>
          </div>
        ) : null}
        <View pointerEvents="none" style={styles.petStage}>
          <Live2DCanvas
            petConfig={activeLive2DPet}
            action={liveAction}
            actionKey={actionKey}
            rigCue={rigCue}
            compact
            sizeScale={sizeScale}
            reducedMotion={reducedMotion}
          />
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

  return createPortal(layer, portalHost);
}

function petWorldDecisionFromJson(value: CreationSpace["last_world_decision"] | null | undefined): { bubble?: string; speech?: string; symbol?: "heart" | "sparkle" | "letter" | "photo" | "memory" | "food" | "sleep"; prop?: "letter" | "photo" | "memory" | "none" } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const world = raw.world && typeof raw.world === "object" && !Array.isArray(raw.world) ? raw.world as Record<string, unknown> : raw;
  const prop = world.prop === "letter" || world.prop === "photo" || world.prop === "memory" || world.prop === "none" ? world.prop : undefined;
  const symbol = world.symbol === "heart" || world.symbol === "sparkle" || world.symbol === "letter" || world.symbol === "photo" || world.symbol === "memory" || world.symbol === "food" || world.symbol === "sleep" ? world.symbol : undefined;
  const speech = sanitizePassivePetText(typeof world.speech === "string" ? world.speech : undefined) ?? undefined;
  const bubble = sanitizePassivePetText(typeof world.bubble === "string" ? world.bubble : undefined) ?? undefined;
  return { prop, speech, symbol, bubble };
}

function symbolLabel(symbol: "heart" | "sparkle" | "letter" | "photo" | "memory" | "food" | "sleep") {
  if (symbol === "heart") return "💕";
  if (symbol === "sparkle") return "🐾";
  if (symbol === "letter") return "💌";
  if (symbol === "photo") return "📷✨";
  if (symbol === "memory") return "🐾";
  if (symbol === "food") return "🍽";
  return "💤";
}

function bubbleForAnchor(anchor: PetAnchorName, prop?: "letter" | "photo" | "memory" | "none") {
  if (prop === "letter") {
    return "喵呜";
  }
  if (prop === "photo") {
    return "...";
  }
  if (prop === "memory") {
    return "咕噜";
  }
  if (anchor === "home-love-letter") {
    return "喵";
  }
  if (anchor === "home-photo-album") {
    return "...";
  }
  if (anchor === "home-message-board") {
    return "喵呜";
  }
  if (anchor === "home-pet-stage" || anchor === "home-quick-sync") {
    return "呼噜";
  }
  if (anchor === "home-creation-entry") {
    return "呼噜";
  }
  if (anchor === "share-capsule-composer") {
    return "喵";
  }
  if (anchor === "share-today-capsule") {
    return "咕噜";
  }
  if (anchor === "share-letter-delivery") {
    return "喵呜";
  }
  if (anchor === "memory-calendar") {
    return "...";
  }
  if (anchor === "memory-pet-cue") {
    return "...";
  }
  if (anchor === "memory-hero") {
    return "咕噜";
  }
  return "喵";
}

function bubbleForPetState({
  reaction,
  worldDecision,
  activeAnchor,
  prop,
}: {
  reaction: CreationPetStageReaction | null;
  worldDecision: ReturnType<typeof petWorldDecisionFromJson>;
  activeAnchor: PetAnchorName;
  prop?: "letter" | "photo" | "memory" | "none";
}) {
  if (reaction) {
    return sanitizeDirectPetText(reaction.message, reaction.action);
  }
  return worldDecision?.speech || worldDecision?.bubble || bubbleForAnchor(activeAnchor, prop);
}

function resolveAnchorPosition(anchor: PetAnchorName, host: HTMLElement | null, size = { width: petWidth, height: petHeight }) {
  const rect = document.querySelector(`[data-pet-anchor="${anchor}"]`)?.getBoundingClientRect();
  if (!rect) {
    return clampPosition(window.innerWidth - size.width - 22, window.innerHeight * 0.52, host, size);
  }
  const pageRect = rectToLocal(rect, host);
  const lane = anchorLane(anchor, host, size);
  if (anchor === "home-quick-sync") {
    return clampPosition(lane.x, pageRect.top + 18, host, size);
  }
  if (anchor === "home-photo-album") {
    return clampPosition(lane.x, pageRect.top + Math.min(180, pageRect.height * 0.4), host, size);
  }
  if (anchor === "home-message-board") {
    return clampPosition(lane.x, pageRect.top + 22, host, size);
  }
  if (anchor === "home-pet-stage") {
    return clampPosition(lane.x, pageRect.top + 28, host, size);
  }
  if (anchor === "home-love-letter") {
    return clampPosition(lane.x, pageRect.top - size.height * 0.28, host, size);
  }
  if (anchor === "home-creation-entry") {
    return clampPosition(pageRect.left - size.width * 0.64, pageRect.top - size.height * 0.72, host, size);
  }
  if (anchor === "share-capsule-composer") {
    return clampPosition(lane.x, pageRect.top + 4, host, size);
  }
  if (anchor === "share-today-capsule") {
    return clampPosition(lane.x, pageRect.top - size.height * 0.18, host, size);
  }
  if (anchor === "share-letter-delivery") {
    return clampPosition(lane.x, pageRect.top + 12, host, size);
  }
  if (anchor === "memory-hero") {
    return clampPosition(lane.x, pageRect.top + pageRect.height * 0.1, host, size);
  }
  if (anchor === "memory-pet-cue") {
    return clampPosition(lane.x, pageRect.top - size.height * 0.18, host, size);
  }
  if (anchor === "memory-calendar") {
    return clampPosition(lane.x, pageRect.top - size.height * 0.18, host, size);
  }
  return clampPosition(lane.x, pageRect.top + pageRect.height * 0.42, host, size);
}

function clampPosition(x: number, y: number, host: HTMLElement | null = null, size = { width: petWidth, height: petHeight }) {
  const margin = 10;
  const page = localBounds(host);
  const maxX = Math.max(margin, page.width - size.width - margin);
  const maxY = Math.max(pageTopPadding, page.height - size.height - pageBottomPadding);
  return {
    x: Math.round(Math.max(margin, Math.min(x, maxX))),
    y: Math.round(Math.max(pageTopPadding, Math.min(y, maxY))),
  };
}

function randomAnchorIndex(length: number) {
  if (length <= 1) {
    return 0;
  }
  return Math.floor(Math.random() * length);
}

function anchorLane(anchor: PetAnchorName, host: HTMLElement | null, size = { width: petWidth, height: petHeight }) {
  const page = localBounds(host);
  const left = walkLanePadding + size.width * 0.16;
  const center = Math.max(left, page.width * 0.5 - size.width * 0.5);
  const right = Math.max(left, page.width - size.width - walkLanePadding - size.width * 0.12);
  const laneByAnchor: Partial<Record<PetAnchorName, number>> = {
    "home-love-days": right,
    "home-quick-sync": left,
    "home-photo-album": right,
    "home-message-board": center,
    "home-pet-stage": left,
    "home-love-letter": center,
    "share-today-capsule": left,
    "share-capsule-composer": right,
    "share-letter-delivery": center,
    "memory-pet-cue": left,
    "memory-hero": right,
    "memory-calendar": center,
  };
  return { x: laneByAnchor[anchor] ?? right };
}

function walkingCrossAxis(start: { x: number; y: number }, next: { x: number; y: number }, host: HTMLElement | null) {
  const dx = next.x - start.x;
  const dy = next.y - start.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const horizontalMove = Math.abs(dx);
  const page = localBounds(host);
  const nearRight = start.x > page.width * 0.5;
  const side = nearRight ? -1 : 1;
  if (horizontalMove < walkWigglePx * 1.5) {
    return { x: side, y: 0, wiggle: walkWigglePx };
  }
  return {
    x: -dy / distance,
    y: dx / distance,
    wiggle: Math.min(walkWigglePx, Math.max(8, distance * 0.08)),
  };
}

function localPointer(event: { clientX: number; clientY: number }, host: HTMLElement | null) {
  const hostRect = host?.getBoundingClientRect();
  if (hostRect && host !== document.body) {
    return {
      x: event.clientX - hostRect.left,
      y: event.clientY - hostRect.top,
    };
  }
  return {
    x: event.clientX + window.scrollX,
    y: event.clientY + window.scrollY,
  };
}

function rectToLocal(rect: DOMRect, host: HTMLElement | null) {
  const hostRect = host?.getBoundingClientRect();
  if (hostRect && host !== document.body) {
    return {
      left: rect.left - hostRect.left,
      right: rect.right - hostRect.left,
      top: rect.top - hostRect.top,
      height: rect.height,
    };
  }
  return {
    left: rect.left + window.scrollX,
    right: rect.right + window.scrollX,
    top: rect.top + window.scrollY,
    height: rect.height,
  };
}

function localBounds(host: HTMLElement | null) {
  if (host && host !== document.body) {
    const rect = host.getBoundingClientRect();
    return {
      width: Math.max(rect.width, host.scrollWidth, window.innerWidth),
      height: Math.max(rect.height, host.scrollHeight, window.innerHeight),
    };
  }
  const doc = document.documentElement;
  const body = document.body;
  return {
    width: Math.max(doc?.clientWidth ?? 0, window.innerWidth),
    height: Math.max(doc?.scrollHeight ?? 0, body?.scrollHeight ?? 0, doc?.clientHeight ?? 0, window.innerHeight),
  };
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

const portalHostStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: 0,
  overflow: "visible",
  pointerEvents: "none",
  zIndex: 45,
} satisfies CSSProperties;

const petWrapBaseStyle = {
  position: "absolute",
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
