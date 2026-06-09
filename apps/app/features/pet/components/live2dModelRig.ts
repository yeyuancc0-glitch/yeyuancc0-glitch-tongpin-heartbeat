import type { LivePetVisualAction } from "@/features/pet/components/PetStage";
import type { PetRigCue } from "@/features/pet/services/petAiBrain";

type PixiLive2DModel = import("pixi-live2d-display/cubism4").Live2DModel;

export type Live2DModelLayout = PixiLive2DModel & {
  __live2dBaseX?: number;
  __live2dBaseY?: number;
  __live2dBaseScaleX?: number;
  __live2dBaseScaleY?: number;
};

export function playLive2DMotion(model: PixiLive2DModel, action: LivePetVisualAction, reducedMotion = false) {
  if (reducedMotion && (action === "walk" || action === "play" || action === "happy" || action === "clean")) {
    return;
  }
  const group = motionGroupForAction(action);
  if (!group) {
    return;
  }
  const live2dModel = model as PixiLive2DModel & {
    motion?: (group: string, index?: number, priority?: number) => Promise<boolean>;
  };
  void live2dModel.motion?.(group, 0, 3).catch(() => undefined);
}

function motionGroupForAction(action: LivePetVisualAction) {
  if (action === "walk") return "Walk";
  if (action === "pet") return "Pet";
  if (action === "sleep") return "Sleep";
  if (action === "wake") return "Happy";
  if (action === "eat") return "Eat";
  if (action === "clean") return "Clean";
  if (action === "play") return "Play";
  if (action === "happy") return "Happy";
  if (action === "sad") return "Sad";
  return null;
}

export function applyModelCue(model: PixiLive2DModel, action: LivePetVisualAction, rigCue?: PetRigCue | null, actionElapsedMs = 0, reducedMotion = false, compact = false) {
  const internalModel = model.internalModel;
  const coreModel = internalModel?.coreModel as {
    setParameterValueById?: (id: string, value: number, weight?: number) => void;
    addParameterValueById?: (id: string, value: number, weight?: number) => void;
  } | undefined;
  const setParam = (id: string, value: number, weight = 0.35) => coreModel?.setParameterValueById?.(id, value, weight);
  const now = Date.now() / 1000;
  const elapsedSeconds = actionElapsedMs / 1000;
  const actionProgress = Math.min(1, actionElapsedMs / 780);
  const actionEase = Math.sin(actionProgress * Math.PI);
  const settle = easeOutCubic(actionProgress);
  const breath = Math.sin(now * 2.1);
  const bounce = Math.sin(now * 7.2);
  const slowSway = Math.sin(now * 1.15);
  const walkStep = Math.sin(now * 10.8);
  const walkFoot = Math.abs(walkStep);
  const walkMotionScale = compact ? 0.62 : 1;
  const pawWave = Math.sin(elapsedSeconds * 7.5);
  const washShake = Math.sin(now * 16);
  const blinkPhase = (now % 4.6) / 4.6;
  const blinkValue = blinkPhase > 0.93 ? 0.08 : blinkPhase > 0.89 ? 0.34 : 1;
  const sleepyEyes = rigCue?.blink === "sleepy" || action === "sleep";
  const eyeOpen = action === "sleep" ? 0 : action === "wake" ? Math.max(0.18, settle) : sleepyEyes ? Math.min(blinkValue, 0.48) : blinkValue;
  const layoutModel = model as Live2DModelLayout;
  const baseX = layoutModel.__live2dBaseX ?? model.x;
  const baseY = layoutModel.__live2dBaseY ?? model.y;
  const baseScaleX = layoutModel.__live2dBaseScaleX ?? model.scale.x;
  const baseScaleY = layoutModel.__live2dBaseScaleY ?? model.scale.y;

  let offsetX = 0;
  let offsetY = breath * -1.2;
  let rotation = slowSway * 0.014;
  let skewX = 0;
  let scaleX = 1;
  let scaleY = 1;
  let mouthOpen = 0.1 + Math.max(0, breath) * 0.05;
  let mouthForm = 0.28;
  let cheek = 0.34;
  let eyeSmile = 0;
  let eyeBallX = slowSway * 0.18;
  let eyeBallY = breath * 0.12;
  let headX = slowSway * 3.2;
  let headY = breath * 2;
  let headZ = slowSway * 2.2;
  let bodyX = headX * 0.35;
  let bodyY = headY * 0.28;
  let bodyZ = headZ * 0.42;
  let arms = 0.18;
  let earBase = 2 + breath * 2;
  let tailSwing = Math.sin(now * 1.8) * 7;
  let browY = 0;
  let browAngle = 0;
  let browForm = 0;

  if (action === "walk") {
    offsetX = walkStep * 1.8 * walkMotionScale;
    offsetY = -((compact ? 2.2 : 4.5) * walkFoot) - (compact ? 0.35 : 1);
    rotation = walkStep * 0.045 * walkMotionScale;
    skewX = walkStep * 0.026 * walkMotionScale;
    scaleX = 1 + walkFoot * 0.025 * walkMotionScale;
    scaleY = 1 - walkFoot * 0.035 * walkMotionScale;
    headX = walkStep * 5.5 * walkMotionScale;
    headY = 2 + walkFoot * 2.4 * walkMotionScale;
    headZ = walkStep * 8 * walkMotionScale;
    bodyX = walkStep * 2.8 * walkMotionScale;
    bodyY = 0.8 * walkMotionScale;
    bodyZ = walkStep * 4.6 * walkMotionScale;
    arms = 0.26 + walkFoot * 0.22 * walkMotionScale;
    earBase = 4 + walkFoot * 4 * walkMotionScale;
    tailSwing = Math.sin(now * 7.6) * 14 * walkMotionScale;
    eyeBallX = walkStep * 0.34 * walkMotionScale;
  } else if (action === "pet") {
    const reach = 0.62 + Math.max(0, pawWave) * 0.38;
    offsetX = -4 * settle + pawWave * 1.6;
    offsetY = -10 * settle - Math.max(0, pawWave) * 3;
    rotation = 0.07 * settle + pawWave * 0.018;
    skewX = 0.018 * settle;
    scaleX = 1.025;
    scaleY = 0.985;
    mouthOpen = 0.16 + Math.max(0, pawWave) * 0.16;
    mouthForm = 0.76;
    cheek = 0.86;
    eyeSmile = 0.48;
    eyeBallX = -0.2 + pawWave * 0.12;
    eyeBallY = 0.24;
    headX = 5 + pawWave * 3;
    headY = 4 + reach * 3;
    headZ = 7.5 + pawWave * 2.8;
    bodyX = 2.4;
    bodyY = 2.2;
    bodyZ = 4.2 + pawWave * 1.2;
    arms = 0.72 + reach * 0.34;
    earBase = 7 + actionEase * 5;
    tailSwing = Math.sin(now * 5.8) * 17;
    browY = 0.18;
  } else if (action === "sleep") {
    const nap = settle;
    offsetX = -9 * nap + slowSway * 1.2;
    offsetY = 24 * nap + Math.max(0, breath) * 1.4;
    rotation = -0.18 * nap + slowSway * 0.01;
    skewX = -0.045 * nap;
    scaleX = 1 + 0.12 * nap;
    scaleY = 1 - 0.2 * nap + Math.max(0, breath) * 0.008;
    mouthOpen = 0.05 + Math.max(0, breath) * 0.03;
    mouthForm = -0.1;
    cheek = 0.18;
    eyeSmile = 0;
    eyeBallX = slowSway * 0.06;
    eyeBallY = -0.42;
    headX = -5 * nap;
    headY = -8 * nap;
    headZ = -10 * nap;
    bodyX = -2 * nap;
    bodyY = -7 * nap;
    bodyZ = -8 * nap;
    arms = -0.42 * nap;
    earBase = -9 * nap;
    tailSwing = Math.sin(now * 1.15) * 4;
    browY = -0.12;
  } else if (action === "wake") {
    const wake = settle;
    offsetX = -5 * (1 - wake) + slowSway * 1.1;
    offsetY = 16 * (1 - wake) - 8 * actionEase;
    rotation = -0.11 * (1 - wake) + 0.035 * wake + slowSway * 0.012;
    skewX = -0.025 * (1 - wake);
    scaleX = 1.08 - 0.05 * wake;
    scaleY = 0.86 + 0.15 * wake;
    mouthOpen = 0.08 + actionEase * 0.18;
    mouthForm = 0.42 + wake * 0.28;
    cheek = 0.28 + wake * 0.44;
    eyeSmile = 0.18 + wake * 0.22;
    eyeBallX = slowSway * 0.12;
    eyeBallY = -0.28 + wake * 0.32;
    headX = -3 * (1 - wake) + slowSway * 2.4;
    headY = -7 * (1 - wake) + wake * 3;
    headZ = -8 * (1 - wake) + wake * 4;
    bodyX = -1.2 * (1 - wake);
    bodyY = -6 * (1 - wake);
    bodyZ = -5 * (1 - wake) + wake * 2;
    arms = -0.25 * (1 - wake) + 0.34 * wake;
    earBase = -5 * (1 - wake) + 6 * wake;
    tailSwing = Math.sin(now * 4.8) * (6 + wake * 9);
    browY = 0.04 * wake;
  } else if (action === "eat") {
    const chew = Math.max(0, Math.sin(now * 9.4));
    offsetY = 4 + chew * 3;
    rotation = -0.025 + slowSway * 0.012;
    scaleX = 1.015;
    scaleY = 0.992;
    mouthOpen = 0.34 + chew * 0.44;
    mouthForm = 0.24;
    cheek = 0.44;
    eyeBallX = slowSway * 0.12;
    eyeBallY = -0.1;
    headX = bounce * 4;
    headY = 5 + chew * 3;
    headZ = -3 + chew * 2;
    bodyY = 2.8;
    bodyZ = -1.8;
    arms = 0.74 + chew * 0.18;
    earBase = 3 + chew * 2;
    tailSwing = Math.sin(now * 2.6) * 8;
  } else if (action === "clean") {
    const shake = washShake;
    offsetX = shake * 3.2;
    offsetY = -2 + Math.abs(shake) * -1.6;
    rotation = -0.04 + shake * 0.035;
    skewX = shake * 0.02;
    scaleX = 1 + Math.abs(shake) * 0.02;
    scaleY = 1 - Math.abs(shake) * 0.018;
    mouthOpen = 0.08 + Math.abs(shake) * 0.06;
    mouthForm = 0.42;
    cheek = 0.58;
    eyeSmile = 0.18;
    eyeBallX = shake * 0.24;
    headX = shake * 5;
    headY = 1;
    headZ = -5.5 + shake * 3;
    bodyX = shake * 2;
    bodyY = -1;
    bodyZ = -3.8 + shake * 2;
    arms = 0.34 + Math.abs(shake) * 0.18;
    earBase = 5 + Math.abs(shake) * 4;
    tailSwing = Math.sin(now * 4.2) * 11;
  } else if (action === "play") {
    const leap = Math.abs(Math.sin(now * 7.8));
    offsetX = slowSway * 4.2;
    offsetY = -18 * leap - 3;
    rotation = slowSway * 0.068 + walkStep * 0.025;
    skewX = bounce * 0.024;
    scaleX = 1 + leap * 0.04;
    scaleY = 1 - leap * 0.035;
    mouthOpen = 0.18 + leap * 0.28;
    mouthForm = 0.64;
    cheek = 0.72;
    eyeSmile = 0.2;
    eyeBallX = slowSway * 0.58;
    eyeBallY = leap * 0.25;
    headX = slowSway * 8;
    headY = 3 + leap * 5;
    headZ = bounce * 9;
    bodyX = slowSway * 3.6;
    bodyY = 1.2;
    bodyZ = bounce * 4.4;
    arms = 0.42 + leap * 0.44;
    earBase = 6 + leap * 5;
    tailSwing = Math.sin(now * 8.4) * 18;
    browY = 0.12;
  } else if (action === "happy") {
    const wag = Math.sin(now * 5.8);
    offsetY = -8 * actionEase - Math.abs(wag) * 2;
    rotation = 0.04 + wag * 0.035;
    scaleX = 1 + Math.abs(wag) * 0.018;
    scaleY = 1 - Math.abs(wag) * 0.012;
    mouthOpen = 0.22 + Math.max(0, wag) * 0.16;
    mouthForm = 0.78;
    cheek = 0.86;
    eyeSmile = 0.5;
    headX = wag * 5;
    headY = 4;
    headZ = wag * 6;
    bodyZ = wag * 3.5;
    arms = 0.36 + Math.max(0, wag) * 0.18;
    earBase = 7 + Math.abs(wag) * 3;
    tailSwing = Math.sin(now * 7) * 19;
    browY = 0.16;
  } else if (action === "sad") {
    offsetY = 7 + Math.max(0, -breath) * 2;
    rotation = -0.05 + slowSway * 0.008;
    scaleX = 0.99;
    scaleY = 0.985;
    mouthOpen = 0.03;
    mouthForm = -0.54;
    cheek = 0.16;
    eyeBallX = -0.12;
    eyeBallY = -0.34;
    headX = -5 + slowSway * 1.4;
    headY = -5;
    headZ = -6;
    bodyX = -2.6;
    bodyY = -3.2;
    bodyZ = -3;
    arms = -0.2;
    earBase = -8;
    tailSwing = Math.sin(now * 1.2) * 3.4;
    browY = -0.24;
    browAngle = -0.26;
    browForm = -0.18;
  }

  if (rigCue?.pose === "crouch" && action !== "sleep") {
    offsetY += 5;
    scaleY *= 0.97;
    arms -= 0.08;
  } else if (rigCue?.pose === "bounce" && action !== "sleep") {
    offsetY -= Math.abs(bounce) * 5;
    scaleX *= 1.015;
  } else if (rigCue?.pose === "nap") {
    offsetY += action === "sleep" ? 0 : 4;
    eyeBallY -= 0.12;
  }
  if (rigCue?.tail === "fast") {
    tailSwing += Math.sin(now * 8.5) * 6;
  } else if (rigCue?.tail === "still") {
    tailSwing *= 0.35;
  }

  const motionScale = reducedMotion ? 0.38 : 1;
  headX *= motionScale;
  headY *= motionScale;
  headZ *= motionScale;
  bodyX *= motionScale;
  bodyY *= motionScale;
  bodyZ *= motionScale;
  eyeBallX *= motionScale;
  eyeBallY *= motionScale;
  tailSwing *= motionScale;
  arms = 0.18 + (arms - 0.18) * motionScale;
  earBase *= motionScale;
  browY *= motionScale;
  browAngle *= motionScale;
  browForm *= motionScale;

  model.x = baseX + offsetX * motionScale;
  model.y = baseY + offsetY * motionScale;
  model.scale.set(baseScaleX * (1 + (scaleX - 1) * motionScale), baseScaleY * (1 + (scaleY - 1) * motionScale));
  model.rotation = rotation * motionScale;
  model.skew.x = skewX * motionScale;
  model.skew.y = 0;
  model.alpha = action === "sleep" ? 0.94 : 1;

  setParam("ParamBreath", 0.55 + breath * 0.32, 0.72);
  setParam("ParamEyeLOpen", eyeOpen, action === "sleep" ? 1 : 0.5);
  setParam("ParamEyeROpen", eyeOpen, action === "sleep" ? 1 : 0.5);
  setParam("ParamEyeLSmile", eyeSmile, 0.3);
  setParam("ParamEyeRSmile", eyeSmile, 0.3);
  setParam("ParamEyeBallX", eyeBallX, 0.42);
  setParam("ParamEyeBallY", eyeBallY, 0.34);
  setParam("ParamMouthOpenY", mouthOpen, 0.42);
  setParam("ParamMouthForm", mouthForm, 0.38);
  setParam("ParamCheek", cheek, 0.35);
  setParam("ParamBrowLY", browY, 0.28);
  setParam("ParamBrowRY", browY, 0.28);
  setParam("ParamBrowLAngle", browAngle, 0.24);
  setParam("ParamBrowRAngle", -browAngle, 0.24);
  setParam("ParamBrowLForm", browForm, 0.24);
  setParam("ParamBrowRForm", browForm, 0.24);
  setParam("ParamAngleX", headX, 0.32);
  setParam("ParamAngleY", headY, 0.3);
  setParam("ParamAngleZ", headZ, 0.32);
  setParam("ParamBodyAngleX", bodyX, 0.25);
  setParam("ParamBodyAngleY", bodyY, 0.24);
  setParam("ParamBodyAngleZ", bodyZ, 0.28);
  setParam("ParamArms", arms, 0.45);

  setParam("Param_Angle_Rotation10", earBase + slowSway * 4, 0.28);
  setParam("Param_Angle_Rotation11", -earBase + slowSway * 3, 0.28);
  setParam("Param_Angle_Rotation12", earBase * 0.6 + bounce * 2, 0.24);
  setParam("Param_Angle_Rotation13", -earBase * 0.6 - bounce * 2, 0.24);

  setParam("Param_Angle_Rotation2", tailSwing, 0.26);
  setParam("Param_Angle_Rotation3", tailSwing * 0.8, 0.24);
  setParam("Param_Angle_Rotation4", tailSwing * 0.62, 0.22);
  setParam("Param_Angle_Rotation5", tailSwing * 0.48, 0.2);
  setParam("Param_Angle_Rotation6", tailSwing * 0.32, 0.18);
  setParam("Param_Angle_Rotation7", tailSwing * 0.22, 0.16);
}

export function applyFinalModelCue(model: PixiLive2DModel, action: LivePetVisualAction) {
  if (action !== "sleep") {
    return;
  }
  const coreModel = model.internalModel?.coreModel as {
    setParameterValueById?: (id: string, value: number, weight?: number) => void;
  } | undefined;
  coreModel?.setParameterValueById?.("ParamEyeLOpen", 0, 1);
  coreModel?.setParameterValueById?.("ParamEyeROpen", 0, 1);
  coreModel?.setParameterValueById?.("ParamEyeLSmile", 1, 1);
  coreModel?.setParameterValueById?.("ParamEyeRSmile", 1, 1);
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

export function poseNameForAction(action: LivePetVisualAction) {
  if (action === "sleep") return "lie-down";
  if (action === "wake") return "wake-up";
  if (action === "pet") return "paw-reach";
  if (action === "walk") return "walking";
  if (action === "eat") return "eating";
  if (action === "clean") return "shake-clean";
  if (action === "play") return "pounce-play";
  if (action === "happy") return "tail-wag";
  if (action === "sad") return "low-ears";
  return "idle-breathe";
}

