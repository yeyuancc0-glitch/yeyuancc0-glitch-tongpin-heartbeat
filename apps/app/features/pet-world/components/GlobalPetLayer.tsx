import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { ImagePlus, Mail } from "lucide-react-native";

import type { CreationPetStageReaction, LivePetVisualAction } from "@/features/pet/components/PetStage";
import { Live2DCanvas } from "@/features/pet/components/Live2DCanvas";
import { activeLive2DPet } from "@/features/pet/live2dCatalog";
import { petRigCueFromJson } from "@/features/pet/services/petAiBrain";
import { petSizeScale, type PetUserSettings } from "@/features/pet/userPetSettings";
import { sanitizeDirectPetText, sanitizePassivePetText } from "@/features/pet-world/logic/petExpression";
import type { PetWorldSurface } from "@/features/pet-world/logic/petWorldRoutes";
import { renderPortal } from "@/lib/platform/portal";
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
type GlobalPetDecisionIntent =
  | "rest"
  | "wander"
  | "hide"
  | "seek_attention"
  | "inspect_memory"
  | "visit_partner"
  | "return_home"
  | "play"
  | "ask_food"
  | "comfort_user";
type GlobalPetDecisionAnimation =
  | "idle"
  | "walk"
  | "run"
  | "hop"
  | "float"
  | "eat"
  | "pet"
  | "clean"
  | "play"
  | "sleep"
  | "sad"
  | "happy"
  | "curious"
  | "hide"
  | "peek"
  | "found"
  | "summon"
  | "return_home"
  | "inspect"
  | "visit_partner";
type GlobalPetWorldDecision = {
  bubble?: string;
  speech?: string;
  intent?: GlobalPetDecisionIntent;
  animation?: GlobalPetDecisionAnimation;
  symbol?: "heart" | "sparkle" | "letter" | "photo" | "memory" | "food" | "sleep";
  prop?: "letter" | "photo" | "memory" | "none";
};

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
const walkSpeedPxPerSecond = 46;
const verticalWalkSpeedPxPerSecond = 28;
const minWalkMs = 1_600;
const verticalMinWalkMs = 2_400;
const maxWalkMs = 6_000;
const verticalMaxWalkMs = 12_000;
const pageTopPadding = 72;
const pageBottomPadding = 92;
const walkLanePadding = 8;
const walkWigglePx = 8;
const anchorAdvanceMs = 38_000;
const reducedMotionAnchorAdvanceMs = 65_000;

export function GlobalPetLayer({ visible, surface = "home", creationSpace, realtimeReaction, onOpenCreation, userSettings }: GlobalPetLayerProps) {
  const [renderSurface, setRenderSurface] = useState<PetLayerSurface>(surface);
  const [anchorIndex, setAnchorIndex] = useState(() => randomAnchorIndex(anchorsBySurface.home.length));
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [moving, setMoving] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [shouldMount, setShouldMount] = useState(visible);
  const positionRef = useRef<{ x: number; y: number } | null>(null);
  const petElementRef = useRef<HTMLDivElement | null>(null);
  const manualPositionRef = useRef<{ x: number; y: number; updatedAt: number } | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const walkAnimationRef = useRef<number | null>(null);
  const bubbleTimerRef = useRef<number | null>(null);
  const lastBubbleKeyRef = useRef<string | null>(null);
  const surfaceAnchors = anchorsBySurface[renderSurface] ?? anchorsBySurface.home;
  const activeAnchor = surfaceAnchors[anchorIndex % surfaceAnchors.length];
  const layerActive = visible && renderSurface === surface;
  const reaction = realtimeReaction ?? null;
  const action = reaction?.action ?? visualActionFromWorldState(creationSpace) ?? "idle";
  const worldDecision = useMemo(() => petWorldDecisionFromJson(creationSpace?.last_world_decision), [creationSpace?.last_world_decision]);
  const prop = worldDecision?.prop;
  const symbol = worldDecision?.symbol;
  const bubble = bubbleForPetState({ reaction, worldDecision, activeAnchor, prop });
  const bubbleWidth = globalPetBubbleWidth(bubble, Boolean(symbol));
  const rigCue = useMemo(() => petRigCueFromJson(creationSpace?.last_rig_cue), [creationSpace?.last_rig_cue]);
  const restingOutside = isRestingOutside(creationSpace, action, worldDecision);
  const liveAction: LivePetVisualAction = restingOutside ? "sleep" : moving && !dragging ? "walk" : action;
  const bubbleKey = `${reaction?.id ?? ""}:${worldDecision?.speech ?? ""}:${worldDecision?.bubble ?? ""}:${symbol ?? ""}:${prop ?? ""}:${activeAnchor}:${restingOutside ? "rest" : "awake"}`;
  const actionKey = `${liveAction}:${moving ? "moving" : "still"}:${reaction?.id ?? ""}:${activeAnchor}`;
  const soundEnabled = userSettings?.soundEnabled ?? true;
  const reducedMotion = Boolean(userSettings?.reducedMotion);
  const sizeScale = petSizeScale(userSettings?.size ?? activeLive2DPet.defaultSize);
  const petSize = useMemo(() => ({
    width: Math.round(petWidth * sizeScale),
    height: Math.round(petHeight * sizeScale),
  }), [sizeScale]);

  useEffect(() => {
    if (visible) {
      setRenderSurface(surface);
    }
  }, [surface, visible]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      return;
    }
    const host = document.querySelector<HTMLElement>("[data-app-scroll-content='true']") ?? document.body;
    setPortalHost(host);
  }, [visible]);

  const applyPetTransform = useCallback((next: { x: number; y: number }) => {
    const element = petElementRef.current;
    if (!element) {
      return;
    }
    element.style.transform = `translate3d(${Math.round(next.x)}px, ${Math.round(next.y)}px, 0)`;
  }, []);

  const setPositionNow = useCallback((next: { x: number; y: number }, render = false) => {
    positionRef.current = next;
    applyPetTransform(next);
    if (render) {
      setPosition(next);
    }
  }, [applyPetTransform]);

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
      setPositionNow(next, true);
      return;
    }

    const dx = next.x - start.x;
    const dy = next.y - start.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 2) {
      setMoving(false);
      setPositionNow(next, true);
      return;
    }

    const verticalWeight = Math.min(1, Math.abs(dy) / Math.max(1, Math.abs(dx) + Math.abs(dy)));
    const baseSpeed = walkSpeedPxPerSecond - (walkSpeedPxPerSecond - verticalWalkSpeedPxPerSecond) * verticalWeight;
    const minDuration = minWalkMs + (verticalMinWalkMs - minWalkMs) * verticalWeight;
    const maxDuration = maxWalkMs + (verticalMaxWalkMs - maxWalkMs) * verticalWeight;
    const duration = Math.max(minDuration, Math.min(maxDuration, distance / (reducedMotion ? baseSpeed * 0.72 : baseSpeed) * 1000));
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
      setPositionNow(next, true);
    };

    walkAnimationRef.current = window.requestAnimationFrame(tick);
  }, [cancelWalkAnimation, petSize, portalHost, reducedMotion, setPositionNow]);

  useEffect(() => {
    if (visible) {
      setShouldMount(true);
      return undefined;
    }
    cancelWalkAnimation();
    setMoving(false);
    setBubbleVisible(false);
    setShouldMount(false);
    return undefined;
  }, [cancelWalkAnimation, visible]);

  useEffect(() => {
    cancelWalkAnimation();
    manualPositionRef.current = null;
    positionRef.current = null;
    lastBubbleKeyRef.current = null;
    setAnchorIndex(randomAnchorIndex(surfaceAnchors.length));
    setPosition(null);
    setMoving(false);
    setBubbleVisible(false);
  }, [cancelWalkAnimation, renderSurface, surfaceAnchors.length]);

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
    if (!layerActive || !bubble) {
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
  }, [bubble, bubbleKey, layerActive]);

  useEffect(() => {
    if (!layerActive || restingOutside) {
      return undefined;
    }
    const interval = window.setInterval(() => {
      const manual = manualPositionRef.current;
      if (manual && Date.now() - manual.updatedAt < dragReleaseMs) {
        return;
      }
      manualPositionRef.current = null;
      setAnchorIndex((index) => (index + 1) % surfaceAnchors.length);
    }, reducedMotion ? reducedMotionAnchorAdvanceMs : anchorAdvanceMs);
    return () => window.clearInterval(interval);
  }, [layerActive, reducedMotion, restingOutside, surfaceAnchors.length]);

  useEffect(() => {
    if (!layerActive) {
      return undefined;
    }
    const updatePosition = (immediate = false) => {
      const manual = manualPositionRef.current;
      if (manual && Date.now() - manual.updatedAt < dragReleaseMs) {
        cancelWalkAnimation();
        setMoving(false);
        setPositionNow(clampPosition(manual.x, manual.y, portalHost, petSize), true);
        return;
      }
      manualPositionRef.current = null;
      if (restingOutside && positionRef.current) {
        cancelWalkAnimation();
        setMoving(false);
        setPositionNow(clampPosition(positionRef.current.x, positionRef.current.y, portalHost, petSize), true);
        return;
      }
      moveToPosition(resolveAnchorPosition(activeAnchor, portalHost, petSize), immediate || !positionRef.current || restingOutside);
    };
    const handleResize = () => updatePosition(true);
    updatePosition(!positionRef.current);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [activeAnchor, cancelWalkAnimation, layerActive, moveToPosition, petSize, portalHost, restingOutside, setPositionNow]);

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

  if (Platform.OS !== "web" || typeof document === "undefined" || !shouldMount || !creationSpace || !position || !portalHost) {
    return null;
  }

  const layer = (
    <div style={portalHostStyle} data-live2d-global-pet-layer={renderSurface}>
      <div
        ref={(element) => {
          petElementRef.current = element;
          if (element && positionRef.current) {
            applyPetTransform(positionRef.current);
          }
        }}
        data-live2d-global-pet={renderSurface}
        data-live2d-global-anchor={activeAnchor}
        style={{
          ...petWrapBaseStyle,
          width: petSize.width,
          height: petSize.height,
          left: 0,
          top: 0,
          opacity: layerActive ? 1 : 0,
          visibility: layerActive ? "visible" : "hidden",
          cursor: dragging ? "grabbing" : "grab",
        } as never}
        onPointerDown={(event) => {
          if (!layerActive) {
            return;
          }
          event.preventDefault();
          cancelWalkAnimation();
          setMoving(false);
          setBubbleVisible(false);
          const pointer = localPointer(event, portalHost);
          const currentPosition = positionRef.current ?? position;
          dragOffsetRef.current = { x: pointer.x - currentPosition.x, y: pointer.y - currentPosition.y };
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
            <View pointerEvents="none" style={[styles.bubble, { width: bubbleWidth, marginLeft: -bubbleWidth / 2 }]}>
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
            paused={!layerActive}
          />
        </View>
        {prop === "letter" ? (
          <View pointerEvents="none" style={styles.letterProp}>
            <Mail color={colors.accentDark} size={18} strokeWidth={2.5} />
          </View>
        ) : null}
        {prop === "photo" ? (
          <View pointerEvents="none" style={styles.memoryProp}>
            <ImagePlus color={colors.accentDark} size={15} strokeWidth={2.6} />
          </View>
        ) : null}
      </div>
    </div>
  );

  return renderPortal(layer, portalHost);
}

function petWorldDecisionFromJson(value: CreationSpace["last_world_decision"] | null | undefined): GlobalPetWorldDecision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const world = raw.world && typeof raw.world === "object" && !Array.isArray(raw.world) ? raw.world as Record<string, unknown> : raw;
  const prop = world.prop === "letter" || world.prop === "photo" || world.prop === "memory" || world.prop === "none" ? world.prop : undefined;
  const symbol = world.symbol === "heart" || world.symbol === "sparkle" || world.symbol === "letter" || world.symbol === "photo" || world.symbol === "memory" || world.symbol === "food" || world.symbol === "sleep" ? world.symbol : undefined;
  const intent = world.intent === "rest" || world.intent === "wander" || world.intent === "hide" || world.intent === "seek_attention" || world.intent === "inspect_memory" || world.intent === "visit_partner" || world.intent === "return_home" || world.intent === "play" || world.intent === "ask_food" || world.intent === "comfort_user" ? world.intent : undefined;
  const animation = world.animation === "idle" || world.animation === "walk" || world.animation === "run" || world.animation === "hop" || world.animation === "float" || world.animation === "eat" || world.animation === "pet" || world.animation === "clean" || world.animation === "play" || world.animation === "sleep" || world.animation === "sad" || world.animation === "happy" || world.animation === "curious" || world.animation === "hide" || world.animation === "peek" || world.animation === "found" || world.animation === "summon" || world.animation === "return_home" || world.animation === "inspect" || world.animation === "visit_partner" ? world.animation : undefined;
  const speech = sanitizePassivePetText(typeof world.speech === "string" ? world.speech : undefined) ?? undefined;
  const bubble = sanitizePassivePetText(typeof world.bubble === "string" ? world.bubble : undefined) ?? undefined;
  return { prop, speech, intent, animation, symbol, bubble };
}

function visualActionFromWorldState(space: CreationSpace | null | undefined): LivePetVisualAction | null {
  const state = space?.pet_world_state ?? space?.current_action;
  if (!state) {
    return null;
  }
  if (state === "idle" || state === "walk" || state === "eat" || state === "pet" || state === "clean" || state === "play" || state === "sleep" || state === "sad" || state === "happy") {
    return state;
  }
  if (state === "run" || state === "hop" || state === "float" || state === "peek" || state === "visit_partner") {
    return "walk";
  }
  if (state === "found" || state === "summon" || state === "curious") {
    return "happy";
  }
  if (state === "return_home" || state === "hide") {
    return "walk";
  }
  if (state === "inspect") {
    return "pet";
  }
  return "idle";
}

function isRestingOutside(
  space: CreationSpace | null | undefined,
  action: LivePetVisualAction,
  worldDecision: ReturnType<typeof petWorldDecisionFromJson>,
) {
  void worldDecision;
  return Boolean(space?.pet_sleep_started_at || action === "sleep" || space?.pet_world_state === "sleep" || space?.current_action === "sleep");
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

function globalPetBubbleWidth(text: string, hasSymbol: boolean) {
  const length = Math.max(1, Array.from(text.trim()).length);
  const symbolWidth = hasSymbol ? 18 : 0;
  return Math.min(156, Math.max(46, 28 + symbolWidth + length * 15));
}

function resolveAnchorPosition(anchor: PetAnchorName, host: HTMLElement | null, size = { width: petWidth, height: petHeight }) {
  const searchRoot: ParentNode = host && host !== document.body ? host : document;
  const rect = searchRoot.querySelector(`[data-pet-anchor="${anchor}"]`)?.getBoundingClientRect();
  if (!rect) {
    return resolveSafePetPosition(clampPosition(window.innerWidth - size.width - 22, window.innerHeight * 0.52, host, size), host, size);
  }
  const pageRect = rectToLocal(rect, host);
  const lane = anchorLane(anchor, host, size);
  let target: { x: number; y: number };
  if (anchor === "home-quick-sync") {
    target = clampPosition(lane.x, pageRect.top + 18, host, size);
  } else if (anchor === "home-photo-album") {
    target = clampPosition(lane.x, pageRect.top + Math.min(180, pageRect.height * 0.4), host, size);
  } else if (anchor === "home-message-board") {
    target = clampPosition(lane.x, pageRect.top + 22, host, size);
  } else if (anchor === "home-pet-stage") {
    target = clampPosition(lane.x, pageRect.top + 28, host, size);
  } else if (anchor === "home-love-letter") {
    target = clampPosition(lane.x, pageRect.top - size.height * 0.28, host, size);
  } else if (anchor === "home-creation-entry") {
    target = clampPosition(pageRect.left - size.width * 0.64, pageRect.top - size.height * 0.72, host, size);
  } else if (anchor === "share-capsule-composer") {
    target = clampPosition(lane.x, pageRect.top + 4, host, size);
  } else if (anchor === "share-today-capsule") {
    target = clampPosition(lane.x, pageRect.top - size.height * 0.18, host, size);
  } else if (anchor === "share-letter-delivery") {
    target = clampPosition(lane.x, pageRect.top + 12, host, size);
  } else if (anchor === "memory-hero") {
    target = clampPosition(lane.x, pageRect.top + pageRect.height * 0.1, host, size);
  } else if (anchor === "memory-pet-cue") {
    target = clampPosition(lane.x, pageRect.top - size.height * 0.18, host, size);
  } else if (anchor === "memory-calendar") {
    target = clampPosition(lane.x, pageRect.top - size.height * 0.18, host, size);
  } else {
    target = clampPosition(lane.x, pageRect.top + pageRect.height * 0.42, host, size);
  }
  return resolveSafePetPosition(target, host, size);
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

function resolveSafePetPosition(position: { x: number; y: number }, host: HTMLElement | null, size = { width: petWidth, height: petHeight }) {
  const safeRects = safeZoneRects(host);
  if (safeRects.length === 0) {
    return position;
  }
  const offsets = [
    { x: 0, y: 0 },
    { x: size.width * 0.72, y: 0 },
    { x: -size.width * 0.72, y: 0 },
    { x: 0, y: -size.height * 0.58 },
    { x: 0, y: size.height * 0.58 },
    { x: size.width * 0.54, y: -size.height * 0.42 },
    { x: -size.width * 0.54, y: -size.height * 0.42 },
    { x: size.width * 0.54, y: size.height * 0.42 },
    { x: -size.width * 0.54, y: size.height * 0.42 },
  ];
  let best = position;
  let bestScore = safePositionScore(position, position, safeRects, size);
  for (const offset of offsets) {
    const candidate = clampPosition(position.x + offset.x, position.y + offset.y, host, size);
    const score = safePositionScore(candidate, position, safeRects, size);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function safeZoneRects(host: HTMLElement | null) {
  const searchRoot: ParentNode = host && host !== document.body ? host : document;
  const nodes = Array.from(searchRoot.querySelectorAll<HTMLElement>("[data-pet-safe-zone]"));
  return nodes.map((node) => rectToLocal(node.getBoundingClientRect(), host));
}

function safePositionScore(
  candidate: { x: number; y: number },
  origin: { x: number; y: number },
  safeRects: ReturnType<typeof safeZoneRects>,
  size = { width: petWidth, height: petHeight },
) {
  const petRect = {
    left: candidate.x + size.width * 0.1,
    right: candidate.x + size.width * 0.9,
    top: candidate.y + size.height * 0.16,
    bottom: candidate.y + size.height * 0.98,
  };
  const overlapPenalty = safeRects.reduce((total, rect) => total + rectOverlapArea(petRect, expandRect(rect, 8)), 0);
  const travelPenalty = Math.hypot(candidate.x - origin.x, candidate.y - origin.y) * 0.08;
  return overlapPenalty + travelPenalty;
}

function expandRect(rect: ReturnType<typeof rectToLocal>, amount: number) {
  return {
    left: rect.left - amount,
    right: rect.right + amount,
    top: rect.top - amount,
    bottom: rect.bottom + amount,
  };
}

function rectOverlapArea(
  first: { left: number; right: number; top: number; bottom: number },
  second: { left: number; right: number; top: number; bottom: number },
) {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  return width * height;
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
    wiggle: Math.min(walkWigglePx, Math.max(4, distance * 0.04)),
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
      bottom: rect.bottom - hostRect.top,
      width: rect.width,
      height: rect.height,
    };
  }
  return {
    left: rect.left + window.scrollX,
    right: rect.right + window.scrollX,
    top: rect.top + window.scrollY,
    bottom: rect.bottom + window.scrollY,
    width: rect.width,
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
    width: 26,
    height: 24,
    borderRadius: 9,
    backgroundColor: "rgba(255,239,246,0.72)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.2)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 14px rgba(116,74,89,0.1)",
    zIndex: 3,
  },
  bubble: {
    position: "absolute",
    left: "50%",
    top: 0,
    minWidth: 46,
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
