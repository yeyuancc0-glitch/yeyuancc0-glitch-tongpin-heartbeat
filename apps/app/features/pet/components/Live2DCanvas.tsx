import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import type { CreationLivePetAction } from "@/features/pet/components/PetStage";
import { littleCatLive2D } from "@/features/pet/live2dCatalog";
import type { PetRigCue } from "@/features/pet/services/petAiBrain";
import { colors } from "@/styles/theme";

type PixiApplication = import("pixi.js").Application;
type PixiLive2DModel = import("pixi-live2d-display/cubism4").Live2DModel;
type PixiTickerCallback = (delta: number) => void;
type Live2DModelLayout = PixiLive2DModel & {
  __live2dBaseY?: number;
};
type Live2DModelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

declare global {
  interface Window {
    PIXI?: typeof import("pixi.js");
    Live2DCubismCore?: unknown;
  }
}

const coreScriptId = "live2d-cubism-core";

export type Live2DCanvasProps = {
  action: CreationLivePetAction;
  rigCue?: PetRigCue | null;
  compact?: boolean;
  onLoadStateChange?: (state: "loading" | "ready" | "error") => void;
};

export function Live2DCanvas({ action, rigCue, compact = false, onLoadStateChange }: Live2DCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<PixiApplication | null>(null);
  const modelRef = useRef<PixiLive2DModel | null>(null);
  const baseBoundsRef = useRef<Live2DModelBounds | null>(null);
  const tickerRef = useRef<PixiTickerCallback | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(Platform.OS === "web" ? "loading" : "error");
  const actionRef = useRef(action);
  const rigCueRef = useRef<PetRigCue | null | undefined>(rigCue);
  const actionSinceRef = useRef(Date.now());

  useEffect(() => {
    actionRef.current = action;
    actionSinceRef.current = Date.now();
    modelRef.current && applyModelCue(modelRef.current, action, rigCueRef.current, 0);
  }, [action]);

  useEffect(() => {
    rigCueRef.current = rigCue;
    modelRef.current && applyModelCue(modelRef.current, actionRef.current, rigCue, Date.now() - actionSinceRef.current);
  }, [rigCue]);

  useEffect(() => {
    onLoadStateChange?.(loadState);
  }, [loadState, onLoadStateChange]);

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
        await ensureCubismCore(littleCatLive2D.corePath);
        const PIXI = await import("pixi.js");
        window.PIXI = PIXI;
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");

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
        hostRef.current.appendChild(app.view as HTMLCanvasElement);

        const model = await Live2DModel.from(littleCatLive2D.modelPath, { autoInteract: false });
        if (cancelled) {
          model.destroy({ children: true, texture: true, baseTexture: true });
          return;
        }
        modelRef.current = model;
        model.anchor.set(0, 0);
        app.stage.addChild(model);
        baseBoundsRef.current = resolveModelBounds(model);

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
          const scale = Math.min(
            (width / Math.max(bounds.width, 1)) * (compact ? (isTinyStage ? 0.6 : 0.76) : 0.76),
            (height / Math.max(bounds.height, 1)) * (compact ? (isTinyStage ? 0.64 : 0.8) : 0.82),
          );
          const finalScale = Math.max(0.045, Math.min(scale, compact ? (isTinyStage ? 0.24 : 0.32) : 0.42));
          currentModel.scale.set(finalScale);
          const targetBottom = height * (compact ? (isTinyStage ? 0.9 : 0.88) : 0.94);
          currentModel.x = width / 2 - (bounds.x + bounds.width / 2) * finalScale;
          currentModel.y = targetBottom - (bounds.y + bounds.height) * finalScale;
          (currentModel as Live2DModelLayout).__live2dBaseY = currentModel.y;
        };

        layout();
        resizeObserver = new ResizeObserver(layout);
        resizeObserver.observe(hostRef.current);
        const tick: PixiTickerCallback = () => {
          const currentModel = modelRef.current;
          if (!currentModel) {
            return;
          }
          applyModelCue(currentModel, actionRef.current, rigCueRef.current, Date.now() - actionSinceRef.current);
        };
        tickerRef.current = tick;
        app.ticker.add(tick);
        applyModelCue(model, actionRef.current, rigCueRef.current, Date.now() - actionSinceRef.current);
        setLoadState("ready");
      } catch (error) {
        console.warn("Live2D LittleCat failed to load:", error);
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
      baseBoundsRef.current = null;
      modelRef.current?.destroy({ children: true, texture: true, baseTexture: true });
      modelRef.current = null;
      appRef.current?.destroy(true, { children: true, texture: true, baseTexture: true });
      appRef.current = null;
      if (hostRef.current) {
        hostRef.current.innerHTML = "";
      }
    };
  }, [compact]);

  if (Platform.OS !== "web") {
    return null;
  }

  return (
    <View style={styles.frame}>
      <div ref={hostRef} data-live2d-pet="little-cat" data-live2d-action={action} data-live2d-state={loadState} style={styles.webHost} />
      {loadState === "loading" ? (
        <View pointerEvents="none" style={styles.statusPill}>
          <Text style={styles.statusText}>Live2D 加载中</Text>
        </View>
      ) : null}
      {loadState === "error" ? (
        <View pointerEvents="none" style={styles.errorPill}>
          <Text style={styles.errorText}>Live2D 模型未加载</Text>
        </View>
      ) : null}
    </View>
  );
}

function ensureCubismCore(src: string) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window_unavailable"));
  }
  if (window.Live2DCubismCore) {
    return Promise.resolve();
  }
  const existing = document.getElementById(coreScriptId) as HTMLScriptElement | null;
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("cubism_core_load_failed")), { once: true });
    });
  }
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = coreScriptId;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("cubism_core_load_failed"));
    document.head.appendChild(script);
  });
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

function applyModelCue(model: PixiLive2DModel, action: CreationLivePetAction, rigCue?: PetRigCue | null, actionElapsedMs = 0) {
  const internalModel = model.internalModel;
  const coreModel = internalModel?.coreModel as {
    setParameterValueById?: (id: string, value: number, weight?: number) => void;
    addParameterValueById?: (id: string, value: number, weight?: number) => void;
  } | undefined;
  const now = Date.now() / 1000;
  const actionProgress = Math.min(1, actionElapsedMs / 680);
  const actionEase = Math.sin(actionProgress * Math.PI);
  const breath = Math.sin(now * 2.1);
  const bounce = Math.sin(now * 7.2);
  const slowSway = Math.sin(now * 1.15);
  const blinkPhase = (now % 4.6) / 4.6;
  const blinkValue = blinkPhase > 0.93 ? 0.08 : blinkPhase > 0.89 ? 0.34 : 1;
  const sleepyEyes = rigCue?.blink === "sleepy" || action === "sleep";
  const eyeOpen = action === "sleep" ? 0.14 + Math.max(0, breath) * 0.04 : sleepyEyes ? Math.min(blinkValue, 0.48) : blinkValue;
  const actionLift = action === "play" ? -18 * Math.abs(bounce) : action === "eat" ? 7 * Math.max(0, bounce) : action === "pet" || action === "happy" ? -9 * actionEase : 0;
  const layoutModel = model as Live2DModelLayout;

  model.y = (layoutModel.__live2dBaseY ?? model.y) + actionLift;
  model.rotation =
    action === "clean" ? -0.035 + slowSway * 0.015
    : action === "pet" || action === "happy" ? 0.036 + actionEase * 0.025
    : action === "sad" ? -0.026
    : action === "play" ? slowSway * 0.052
    : slowSway * 0.014;
  model.skew.x = action === "play" ? bounce * 0.018 : 0;
  model.alpha = action === "sleep" ? 0.94 : 1;

  coreModel?.setParameterValueById?.("ParamBreath", 0.55 + breath * 0.32, 0.72);
  coreModel?.setParameterValueById?.("ParamEyeLOpen", eyeOpen, action === "sleep" ? 0.78 : 0.5);
  coreModel?.setParameterValueById?.("ParamEyeROpen", eyeOpen, action === "sleep" ? 0.78 : 0.5);
  coreModel?.setParameterValueById?.("ParamEyeBallX", action === "play" ? slowSway * 0.55 : slowSway * 0.18, 0.42);
  coreModel?.setParameterValueById?.("ParamEyeBallY", action === "sleep" ? -0.42 : breath * 0.12, 0.32);

  if (action === "sleep") {
    coreModel?.setParameterValueById?.("ParamMouthOpenY", 0.08, 0.5);
  }

  const mouthOpen =
    action === "eat" ? 0.42 + Math.max(0, bounce) * 0.34
    : action === "happy" || action === "pet" ? 0.2 + actionEase * 0.18
    : action === "sad" ? 0.03
    : action === "sleep" ? 0.07
    : 0.1 + Math.max(0, breath) * 0.05;
  const mouthForm = action === "sad" ? -0.52 : action === "sleep" ? -0.08 : action === "eat" ? 0.24 : action === "happy" || action === "pet" ? 0.72 : 0.28;
  const bodyAngle = action === "play" ? bounce * 9 : action === "clean" ? -5.5 : action === "pet" ? 5.5 + actionEase * 3 : slowSway * 2.2;
  const headX = action === "sad" ? -4 : action === "eat" ? bounce * 5 : action === "play" ? slowSway * 8 : slowSway * 3.2;
  const headY = action === "sleep" ? -6 : action === "pet" ? 3 + actionEase * 3 : action === "eat" ? 4 + Math.max(0, bounce) * 2 : breath * 2;

  coreModel?.setParameterValueById?.("ParamMouthOpenY", mouthOpen, 0.38);
  coreModel?.setParameterValueById?.("ParamMouthForm", mouthForm, 0.34);
  coreModel?.setParameterValueById?.("ParamCheek", action === "pet" || action === "happy" ? 0.82 : action === "sleep" ? 0.18 : 0.34, 0.32);
  coreModel?.setParameterValueById?.("ParamEyeLSmile", action === "pet" || action === "happy" ? 0.42 : 0, 0.28);
  coreModel?.setParameterValueById?.("ParamEyeRSmile", action === "pet" || action === "happy" ? 0.42 : 0, 0.28);
  coreModel?.setParameterValueById?.("ParamAngleX", headX, 0.28);
  coreModel?.setParameterValueById?.("ParamAngleY", headY, 0.26);
  coreModel?.setParameterValueById?.("ParamAngleZ", bodyAngle, 0.28);
  coreModel?.setParameterValueById?.("ParamBodyAngleX", headX * 0.35, 0.22);
  coreModel?.setParameterValueById?.("ParamBodyAngleY", action === "sleep" ? -4 : headY * 0.28, 0.2);
  coreModel?.setParameterValueById?.("ParamBodyAngleZ", bodyAngle * 0.42, 0.24);
  coreModel?.setParameterValueById?.("ParamArms", action === "eat" ? 0.68 : action === "sleep" ? -0.18 : action === "play" ? 0.38 + Math.max(0, bounce) * 0.4 : 0.18, 0.34);

  const earBase = action === "sad" || action === "sleep" ? -7 : action === "pet" ? 8 * actionEase : 2 + breath * 2;
  coreModel?.setParameterValueById?.("Param_Angle_Rotation10", earBase + slowSway * 4, 0.28);
  coreModel?.setParameterValueById?.("Param_Angle_Rotation11", -earBase + slowSway * 3, 0.28);
  coreModel?.setParameterValueById?.("Param_Angle_Rotation12", earBase * 0.6 + bounce * 2, 0.24);
  coreModel?.setParameterValueById?.("Param_Angle_Rotation13", -earBase * 0.6 - bounce * 2, 0.24);

  const tailSwing = action === "happy" || action === "pet" || action === "play" ? Math.sin(now * 5.4) * 16 : Math.sin(now * 1.8) * 7;
  coreModel?.setParameterValueById?.("Param_Angle_Rotation2", tailSwing, 0.26);
  coreModel?.setParameterValueById?.("Param_Angle_Rotation3", tailSwing * 0.8, 0.24);
  coreModel?.setParameterValueById?.("Param_Angle_Rotation4", tailSwing * 0.62, 0.22);
  coreModel?.setParameterValueById?.("Param_Angle_Rotation5", tailSwing * 0.48, 0.2);
  coreModel?.setParameterValueById?.("Param_Angle_Rotation6", tailSwing * 0.32, 0.18);
  coreModel?.setParameterValueById?.("Param_Angle_Rotation7", tailSwing * 0.22, 0.16);
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
