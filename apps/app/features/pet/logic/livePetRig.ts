import type { LivePetVisualAction } from "@/features/pet/components/PetStage";
import type { PetRigCue } from "@/features/pet/services/petAiBrain";

export type PetMotionProfile = {
  breatheScaleY: number;
  breatheY: number;
  headLift: number;
  headTilt: number;
  attentionLift: number;
  actionScale: number;
  actionLift: number;
  actionTilt: string;
};

const defaultProfile: PetMotionProfile = {
  breatheScaleY: 1.014, // 纵向拉伸控制在 1.5% 以内，更加温和宁静
  breatheY: -1,         // 呼吸纵向偏位微调，更自然
  headLift: -1,
  headTilt: 3,
  attentionLift: -4,
  actionScale: 1.1,
  actionLift: -12,
  actionTilt: "2deg",
};

export function motionProfileFor(action: LivePetVisualAction, rigCue?: PetRigCue | null): PetMotionProfile {
  const profile = { ...defaultProfile };
  if (action === "eat") {
    return withRigCue({
      ...profile,
      headLift: 2,
      headTilt: 5,
      actionScale: 1.08,
      actionLift: 3,
      actionTilt: "2deg",
    }, rigCue);
  }
  if (action === "pet" || action === "happy") {
    return withRigCue({
      ...profile,
      headLift: -2,
      headTilt: 7,
      actionScale: 1.12,
      actionLift: -16,
      actionTilt: "4deg",
    }, rigCue);
  }
  if (action === "play") {
    return withRigCue({
      ...profile,
      headTilt: 8,
      actionScale: 1.16,
      actionLift: -18,
      actionTilt: "7deg",
    }, rigCue);
  }
  if (action === "clean") {
    return withRigCue({
      ...profile,
      headTilt: -4,
      actionScale: 1.08,
      actionLift: -6,
      actionTilt: "-4deg",
    }, rigCue);
  }
  if (action === "sleep") {
    return withRigCue({
      ...profile,
      breatheScaleY: 0.97,
      breatheY: 2,
      headLift: 2,
      headTilt: -1,
      actionScale: 1,
      actionLift: 2,
      actionTilt: "0deg",
    }, rigCue);
  }
  if (action === "wake") {
    return withRigCue({
      ...profile,
      breatheScaleY: 1.01,
      breatheY: -2,
      headLift: -4,
      headTilt: 2,
      actionScale: 1.06,
      actionLift: -8,
      actionTilt: "2deg",
    }, rigCue);
  }
  if (action === "sad") {
    return withRigCue({
      ...profile,
      headLift: 3,
      headTilt: -4,
      actionScale: 0.99,
      actionLift: 0,
      actionTilt: "-2deg",
    }, rigCue);
  }
  return withRigCue(profile, rigCue);
}

function withRigCue(profile: PetMotionProfile, rigCue?: PetRigCue | null): PetMotionProfile {
  if (!rigCue) {
    return profile;
  }
  const next = { ...profile };

  if (rigCue.blink === "sleepy") {
    next.headLift += 2;
  }

  if (rigCue.pose === "bounce") {
    next.actionLift -= 6;
    next.actionScale += 0.03;
  } else if (rigCue.pose === "crouch") {
    next.actionScale = Math.max(0.96, next.actionScale - 0.04);
    next.headLift += 3;
  } else if (rigCue.pose === "nap") {
    next.breatheScaleY = 0.97;
  }

  return next;
}
