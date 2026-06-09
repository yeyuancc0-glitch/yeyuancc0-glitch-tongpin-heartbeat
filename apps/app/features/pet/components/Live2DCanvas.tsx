import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import type { LivePetVisualAction } from "@/features/pet/components/PetStage";
import { activeLive2DPet, type Live2DPetConfig } from "@/features/pet/live2dCatalog";
import type { PetRigCue } from "@/features/pet/services/petAiBrain";
import { ensureCubismCore } from "@/features/pet/components/live2dCoreLoader";
import {
  applyFinalModelCue,
  applyModelCue,
  playLive2DMotion,
  poseNameForAction,
  type Live2DModelLayout,
} from "@/features/pet/components/live2dModelRig";
import { colors } from "@/styles/theme";

type PixiApplication = import("pixi.js").Application;
type PixiLive2DModel = import("pixi-live2d-display/cubism4").Live2DModel;
type PixiTickerCallback = (delta: number) => void;
type Live2DInternalModelWithEvents = NonNullable<PixiLive2DModel["internalModel"]> & {
  on?: (event: "beforeModelUpdate", handler: () => void) => void;
  off?: (event: "beforeModelUpdate", handler: () => void) => void;
};
type Live2DModelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Live2DCanvasProps = {
  petConfig?: Live2DPetConfig;
  action: LivePetVisualAction;
  actionKey?: string | number;
  rigCue?: PetRigCue | null;
  compact?: boolean;
  sizeScale?: number;
  reducedMotion?: boolean;
  paused?: boolean;
  onLoadStateChange?: (state: "loading" | "ready" | "error") => void;
};

export function Live2DCanvas({
  petConfig = activeLive2DPet,
  action,
  actionKey,
  rigCue,
  compact = false,
  sizeScale = petConfig.defaultScale,
  reducedMotion = false,
  paused = false,
  onLoadStateChange,
}: Live2DCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<PixiApplication | null>(null);
  const modelRef = useRef<PixiLive2DModel | null>(null);
  const baseBoundsRef = useRef<Live2DModelBounds | null>(null);
  const tickerRef = useRef<PixiTickerCallback | null>(null);
  const beforeModelUpdateRef = useRef<(() => void) | null>(null);
  const layoutRef = useRef<(() => void) | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(Platform.OS === "web" ? "loading" : "error");
  const actionRef = useRef(action);
  const rigCueRef = useRef<PetRigCue | null | undefined>(rigCue);
  const compactRef = useRef(compact);
  const sizeScaleRef = useRef(sizeScale);
  const reducedMotionRef = useRef(reducedMotion);
  const pausedRef = useRef(paused);
  const actionSinceRef = useRef(Date.now());

  useEffect(() => {
    actionRef.current = action;
    actionSinceRef.current = Date.now();
    if (modelRef.current && !pausedRef.current) {
      applyModelCue(modelRef.current, action, rigCueRef.current, 0, reducedMotionRef.current, compactRef.current);
      playLive2DMotion(modelRef.current, action, reducedMotionRef.current);
    }
  }, [action, actionKey]);

  useEffect(() => {
    rigCueRef.current = rigCue;
    if (modelRef.current && !pausedRef.current) {
      applyModelCue(modelRef.current, actionRef.current, rigCue, Date.now() - actionSinceRef.current, reducedMotionRef.current, compactRef.current);
    }
  }, [rigCue]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
    if (modelRef.current && !pausedRef.current) {
      applyModelCue(modelRef.current, actionRef.current, rigCueRef.current, Date.now() - actionSinceRef.current, reducedMotion, compactRef.current);
    }
  }, [reducedMotion]);

  useEffect(() => {
    compactRef.current = compact;
    layoutRef.current?.();
    if (modelRef.current && !pausedRef.current) {
      applyModelCue(modelRef.current, actionRef.current, rigCueRef.current, Date.now() - actionSinceRef.current, reducedMotionRef.current, compact);
    }
  }, [compact]);

  useEffect(() => {
    sizeScaleRef.current = sizeScale;
    layoutRef.current?.();
  }, [sizeScale]);

  useEffect(() => {
    onLoadStateChange?.(loadState);
  }, [loadState, onLoadStateChange]);

  useEffect(() => {
    pausedRef.current = paused;
    const app = appRef.current;
    if (paused) {
      app?.stop();
      return;
    }
    app?.start();
    if (modelRef.current) {
      applyModelCue(modelRef.current, actionRef.current, rigCueRef.current, Date.now() - actionSinceRef.current, reducedMotionRef.current, compactRef.current);
      playLive2DMotion(modelRef.current, actionRef.current, reducedMotionRef.current);
    }
  }, [paused]);

  useEffect(() => {
    if (Platform.OS !== "web" || !hostRef.current) {
      setLoadState("error");
      return undefined;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    async function bootLive2D() {
      try {
        setLoadState("loading");
        await ensureCubismCore(petConfig.corePath);
        const PIXI = require("pixi.js") as typeof import("pixi.js");
        window.PIXI = PIXI;
        const { Live2DModel } = require("pixi-live2d-display/cubism4") as typeof import("pixi-live2d-display/cubism4");

        if (cancelled || !hostRef.current) {
          return;
        }

        const app = new PIXI.Application({
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          resizeTo: hostRef.current,
          powerPreference: "high-performance",
        });
        appRef.current = app;
        const canvas = app.view as HTMLCanvasElement;
        canvas.style.display = "block";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.background = "transparent";
        canvas.style.border = "0";
        canvas.style.outline = "0";
        hostRef.current.appendChild(canvas);

        const model = await Live2DModel.from(petConfig.modelPath, { autoInteract: false });
        if (cancelled) {
          model.destroy({ children: true, texture: true, baseTexture: true });
          return;
        }
        modelRef.current = model;
        model.anchor.set(0, 0);
        app.stage.addChild(model);
        baseBoundsRef.current = resolveModelBounds(model);
        const beforeModelUpdate = () => {
          applyFinalModelCue(model, actionRef.current);
        };
        beforeModelUpdateRef.current = beforeModelUpdate;
        (model.internalModel as Live2DInternalModelWithEvents | undefined)?.on?.("beforeModelUpdate", beforeModelUpdate);

        const layout = () => {
          const host = hostRef.current;
          const currentModel = modelRef.current;
          const currentApp = appRef.current;
          if (!host || !currentModel || !currentApp) {
            return;
          }
          const width = host.clientWidth || 260;
          const height = host.clientHeight || 280;
          const bounds = baseBoundsRef.current ?? resolveModelBounds(currentModel);
          const isTinyStage = width < 170 || height < 170;
          const isCompact = compactRef.current;
          const scale = Math.min(
            (width / Math.max(bounds.width, 1)) * (isCompact ? (isTinyStage ? 0.6 : 0.76) : 0.76),
            (height / Math.max(bounds.height, 1)) * (isCompact ? (isTinyStage ? 0.64 : 0.8) : 0.82),
          );
          const finalScale = Math.max(0.045, Math.min(scale, isCompact ? (isTinyStage ? 0.24 : 0.32) : 0.42));
          const adjustedScale = finalScale * sizeScaleRef.current;
          currentModel.scale.set(adjustedScale);
          const targetBottom = height * (isCompact ? (isTinyStage ? 0.9 : 0.88) : 0.94);
          currentModel.x = width / 2 - (bounds.x + bounds.width / 2) * adjustedScale;
          currentModel.y = targetBottom - (bounds.y + bounds.height) * adjustedScale;
          (currentModel as Live2DModelLayout).__live2dBaseX = currentModel.x;
          (currentModel as Live2DModelLayout).__live2dBaseY = currentModel.y;
          (currentModel as Live2DModelLayout).__live2dBaseScaleX = adjustedScale;
          (currentModel as Live2DModelLayout).__live2dBaseScaleY = adjustedScale;
        };

        layoutRef.current = layout;
        layout();
        resizeObserver = new ResizeObserver(layout);
        resizeObserver.observe(hostRef.current);
        const tick: PixiTickerCallback = () => {
          if (pausedRef.current) {
            return;
          }
          const currentModel = modelRef.current;
          if (!currentModel) {
            return;
          }
          applyModelCue(currentModel, actionRef.current, rigCueRef.current, Date.now() - actionSinceRef.current, reducedMotionRef.current, compactRef.current);
        };
        tickerRef.current = tick;
        app.ticker.add(tick);
        applyModelCue(model, actionRef.current, rigCueRef.current, Date.now() - actionSinceRef.current, reducedMotionRef.current, compactRef.current);
        playLive2DMotion(model, actionRef.current, reducedMotionRef.current);
        if (pausedRef.current) {
          app.stop();
        }
        setLoadState("ready");
      } catch (error) {
        console.warn("Cloud pet model failed to load:", error);
        if (!cancelled) {
          setLoadState("error");
        }
      }
    }

    void bootLive2D();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (tickerRef.current) {
        appRef.current?.ticker.remove(tickerRef.current);
      }
      tickerRef.current = null;
      if (beforeModelUpdateRef.current) {
        (modelRef.current?.internalModel as Live2DInternalModelWithEvents | undefined)?.off?.("beforeModelUpdate", beforeModelUpdateRef.current);
      }
      beforeModelUpdateRef.current = null;
      layoutRef.current = null;
      baseBoundsRef.current = null;
      const model = modelRef.current;
      if (model) {
        appRef.current?.stage.removeChild(model);
        model.destroy({ children: true, texture: true, baseTexture: true });
      }
      modelRef.current = null;
      appRef.current?.destroy(true, { children: true, texture: true, baseTexture: true });
      appRef.current = null;
      if (hostRef.current) {
        hostRef.current.innerHTML = "";
      }
    };
  }, [petConfig.corePath, petConfig.modelPath]);

  if (Platform.OS !== "web") {
    return null;
  }

  return (
    <View style={styles.frame}>
      <div
        ref={hostRef}
        data-live2d-pet={petConfig.key}
        data-live2d-action={action}
        data-live2d-pose={poseNameForAction(action)}
        data-live2d-state={loadState}
        data-live2d-reduced-motion={reducedMotion ? "true" : "false"}
        style={styles.webHost}
      />
      {loadState === "loading" ? (
        <View pointerEvents="none" style={styles.statusPill}>
          <Text style={styles.statusText}>云宠加载中</Text>
        </View>
      ) : null}
      {loadState === "error" ? (
        <View pointerEvents="none" style={styles.errorPill}>
          <Text style={styles.errorText}>云宠暂时未加载</Text>
        </View>
      ) : null}
    </View>
  );
}

function resolveModelBounds(model: PixiLive2DModel): Live2DModelBounds {
  const bounds = model.getLocalBounds();
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(bounds.width, 1),
    height: Math.max(bounds.height, 1),
  };
}

const styles = StyleSheet.create({
  frame: {
    position: "relative",
    width: "100%",
    height: "100%",
  },
  webHost: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: "transparent",
    borderWidth: 0,
    outlineWidth: 0,
    pointerEvents: "none",
  } as never,
  statusPill: {
    position: "absolute",
    left: 16,
    top: 16,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.84)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.14)",
  },
  statusText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
  },
  errorPill: {
    position: "absolute",
    left: 16,
    right: 16,
    top: "42%",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(184,95,123,0.16)",
  },
  errorText: {
    color: colors.accentDark,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
});
