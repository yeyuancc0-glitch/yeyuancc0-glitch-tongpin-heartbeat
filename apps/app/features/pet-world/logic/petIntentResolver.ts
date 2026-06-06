import type { CreationSpace } from "@/lib/supabase/database.types";
import { defaultPetWorldSurface, isPetWorldSurface, type PetWorldSurface } from "./petWorldRoutes";
import { resolvePetWorldRuleDecision } from "./petWorldRules";
import type { PetWorldAnimation, PetWorldDecision, PetWorldIntent, PetWorldMood } from "@/features/pet/services/petAiBrain";

const allowedIntents: PetWorldIntent[] = ["wander", "hide", "seek_attention", "inspect_memory", "visit_partner", "return_home", "rest", "play", "ask_food", "comfort_user"];
const allowedAnimations: PetWorldAnimation[] = ["idle", "walk", "run", "hop", "float", "eat", "pet", "clean", "play", "sleep", "sad", "happy", "curious", "hide", "peek", "found", "summon", "return_home", "inspect", "visit_partner"];
const allowedMoods: PetWorldMood[] = ["happy", "curious", "sleepy", "lonely", "excited", "calm", "hungry"];

function normalizeWorldMood(mood: string | null | undefined): PetWorldMood {
  if (allowedMoods.includes(mood as PetWorldMood)) {
    return mood as PetWorldMood;
  }
  return "calm";
}

function normalizeWorldIntent(intent: unknown, fallbackValue: PetWorldIntent): PetWorldIntent {
  return typeof intent === "string" && allowedIntents.includes(intent as PetWorldIntent) ? intent as PetWorldIntent : fallbackValue;
}

function normalizeWorldAnimation(animation: unknown, fallbackValue: PetWorldAnimation): PetWorldAnimation {
  return typeof animation === "string" && allowedAnimations.includes(animation as PetWorldAnimation) ? animation as PetWorldAnimation : fallbackValue;
}

function normalizeWorldSurface(surface: unknown, fallbackValue: PetWorldSurface): PetWorldSurface {
  return typeof surface === "string" && isPetWorldSurface(surface) ? surface : fallbackValue;
}

function safeBubble(value: unknown, fallbackValue: string) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, "") : "";
  return (text || fallbackValue).slice(0, 28);
}

function persistentWorldAnimation(animation: PetWorldAnimation, intent: PetWorldIntent): PetWorldAnimation {
  if (animation === "found" || animation === "summon") {
    return intent === "return_home" || intent === "rest" ? "return_home" : "idle";
  }
  return animation;
}

export function petWorldDecisionFromSpace(input: {
  space: CreationSpace | null;
  surface: PetWorldSurface;
  partnerOnline?: boolean;
}): PetWorldDecision {
  const autonomousSurface = input.space?.pet_world_surface ?? defaultPetWorldSurface;
  const fallback = resolvePetWorldDecision({
    space: input.space,
    surface: autonomousSurface,
    partnerOnline: input.partnerOnline,
    hidden: input.space?.pet_hidden,
  });
  const space = input.space;
  if (!space) {
    return fallback;
  }

  const raw = space.last_world_decision && typeof space.last_world_decision === "object" && !Array.isArray(space.last_world_decision)
    ? space.last_world_decision as Record<string, unknown>
    : {};
  const world = raw.world && typeof raw.world === "object" && !Array.isArray(raw.world)
    ? raw.world as Record<string, unknown>
    : raw;
  const animation = normalizeWorldAnimation(world.animation, space.pet_hidden ? "peek" : space.pet_world_state);
  const intent = normalizeWorldIntent(world.intent, space.pet_hidden ? "hide" : fallback.intent);
  const persistedTargetSurface = normalizeWorldSurface(world.target_surface, autonomousSurface);
  const targetSurface = persistedTargetSurface === autonomousSurface ? persistedTargetSurface : autonomousSurface;
  const mood = normalizeWorldMood(typeof world.mood === "string" ? world.mood : space.pet_world_mood);
  return {
    intent,
    target_surface: targetSurface,
    mood,
    animation: persistentWorldAnimation(animation, intent),
    bubble: safeBubble(world.bubble, space.last_ai_bubble ?? fallback.bubble),
    memory_policy: {
      should_write: false,
      importance: 0,
      summary: "",
      ...(world.memory_policy && typeof world.memory_policy === "object" && !Array.isArray(world.memory_policy) ? world.memory_policy : {}),
    },
  };
}

export function resolvePetWorldDecision(input: {
  space: CreationSpace | null;
  surface: PetWorldSurface;
  partnerOnline?: boolean;
  hidden?: boolean;
}): PetWorldDecision {
  return resolvePetWorldRuleDecision(input);
}
