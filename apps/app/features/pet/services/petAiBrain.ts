import { supabase } from "@/lib/supabase/client";
import type { CreationSpace, Json } from "@/lib/supabase/database.types";

export type PetAiAction = CreationSpace["current_action"];
export type PetWorldSurface = "home" | "share" | "memory" | "creation_hub" | "pet_room";
export type PetWorldIntent = "wander" | "hide" | "seek_attention" | "inspect_memory" | "visit_partner" | "return_home" | "rest" | "play" | "ask_food" | "comfort_user";
export type PetWorldMood = "happy" | "curious" | "sleepy" | "lonely" | "excited" | "calm" | "hungry";
export type PetWorldExpression = PetWorldMood | "soft" | "shy";
export type PetWorldSymbol = "none" | "heart" | "sparkle" | "letter" | "photo" | "memory" | "food" | "sleep";
export type PetWorldSoundCue = "none" | "soft_chime" | "purr" | "tap" | "letter" | "photo";
export type PetWorldAnimation =
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

export type PetRigCue = {
  gaze: "user" | "bowl" | "toy" | "partner" | "none";
  blink: "normal" | "slow" | "sleepy";
  tail: "still" | "soft" | "fast";
  pose: "stand" | "sit" | "crouch" | "nap" | "bounce";
};

export type PetAiDecision = {
  action: PetAiAction;
  mood: string;
  bubble: string;
  state_delta?: {
    fullness?: number;
    cleanliness?: number;
    affection?: number;
    energy?: number;
    boredom?: number;
    comfort?: number;
    growth_points?: number;
  };
  memory?: {
    should_write: boolean;
    memory_type: "preference" | "care_summary" | "event" | "footprint" | "online_together" | "milestone";
    memory_scope: "short" | "core";
    importance: number;
    summary: string;
    dedupe_key?: string;
  };
  rig_cue?: PetRigCue;
  world?: PetWorldDecision;
};

export type PetWorldDecision = {
  intent: PetWorldIntent;
  target_surface: PetWorldSurface;
  mood: PetWorldMood;
  animation: PetWorldAnimation;
  expression: PetWorldExpression;
  symbol: PetWorldSymbol;
  sound_cue: PetWorldSoundCue;
  speech: string;
  prop?: "letter" | "photo" | "memory" | "none";
  bubble: string;
  memory_policy: {
    should_write: boolean;
    memory_type?: "preference" | "care_summary" | "event" | "footprint" | "online_together" | "milestone";
    memory_scope?: "short" | "core";
    importance: number;
    summary: string;
    dedupe_key?: string;
  };
  rig_cue?: PetRigCue;
  state_delta?: {
    fullness?: number;
    cleanliness?: number;
    affection?: number;
    energy?: number;
    boredom?: number;
    comfort?: number;
    growth_points?: number;
  };
};

export type PetBrainResult = {
  space: CreationSpace | null;
  decision: PetAiDecision | null;
  fallback: boolean;
  errorCode?: string;
};

export async function invokePetAiBrain({
  coupleId,
  triggerType,
  localHint,
}: {
  coupleId: string;
  triggerType: string;
  localHint?: Record<string, Json | undefined>;
}) {
  const { data, error } = await supabase.functions.invoke("pet-ai-brain", {
    body: {
      coupleId,
      triggerType,
      localHint,
    },
  });

  if (error) {
    throw error;
  }

  return normalizeBrainResult(data);
}

export function petRigCueFromJson(value: Json | null | undefined): PetRigCue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const cue = value as Record<string, Json | undefined>;
  return {
    gaze: cue.gaze === "user" || cue.gaze === "bowl" || cue.gaze === "toy" || cue.gaze === "partner" || cue.gaze === "none" ? cue.gaze : "none",
    blink: cue.blink === "slow" || cue.blink === "sleepy" || cue.blink === "normal" ? cue.blink : "normal",
    tail: cue.tail === "still" || cue.tail === "fast" || cue.tail === "soft" ? cue.tail : "soft",
    pose: cue.pose === "sit" || cue.pose === "crouch" || cue.pose === "nap" || cue.pose === "bounce" || cue.pose === "stand" ? cue.pose : "stand",
  };
}

function normalizeBrainResult(value: unknown): PetBrainResult {
  if (!value || typeof value !== "object") {
    return { space: null, decision: null, fallback: true, errorCode: "empty_response" };
  }
  const payload = value as Partial<PetBrainResult>;
  return {
    space: (payload.space as CreationSpace | null | undefined) ?? null,
    decision: (payload.decision as PetAiDecision | null | undefined) ?? null,
    fallback: Boolean(payload.fallback),
    errorCode: typeof payload.errorCode === "string" ? payload.errorCode : undefined,
  };
}
