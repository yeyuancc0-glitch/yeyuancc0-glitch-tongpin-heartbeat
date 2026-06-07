import type { CreationSpace } from "@/lib/supabase/database.types";
import { sanitizePassivePetText } from "@/features/pet-world/logic/petExpression";
import { normalizePetWorldSurface, type PetWorldSurface } from "./petWorldRoutes";
import { resolvePetWorldRuleDecision } from "./petWorldRules";
import type { PetWorldAnimation, PetWorldDecision, PetWorldExpression, PetWorldIntent, PetWorldMood, PetWorldSoundCue, PetWorldSymbol } from "@/features/pet/services/petAiBrain";

const allowedIntents: PetWorldIntent[] = ["wander", "hide", "seek_attention", "inspect_memory", "visit_partner", "return_home", "rest", "play", "ask_food", "comfort_user"];
const allowedAnimations: PetWorldAnimation[] = ["idle", "walk", "run", "hop", "float", "eat", "pet", "clean", "play", "sleep", "sad", "happy", "curious", "hide", "peek", "found", "summon", "return_home", "inspect", "visit_partner"];
const allowedMoods: PetWorldMood[] = ["happy", "curious", "sleepy", "lonely", "excited", "calm", "hungry"];
const allowedExpressions: PetWorldExpression[] = [...allowedMoods, "soft", "shy"];
const allowedSymbols: PetWorldSymbol[] = ["none", "heart", "sparkle", "letter", "photo", "memory", "food", "sleep"];
const allowedSoundCues: PetWorldSoundCue[] = ["none", "soft_chime", "purr", "tap", "letter", "photo"];

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

function normalizeWorldExpression(expression: unknown, fallbackValue: PetWorldExpression): PetWorldExpression {
  return typeof expression === "string" && allowedExpressions.includes(expression as PetWorldExpression) ? expression as PetWorldExpression : fallbackValue;
}

function normalizeWorldSymbol(symbol: unknown, fallbackValue: PetWorldSymbol): PetWorldSymbol {
  return typeof symbol === "string" && allowedSymbols.includes(symbol as PetWorldSymbol) ? symbol as PetWorldSymbol : fallbackValue;
}

function normalizeWorldSoundCue(soundCue: unknown, fallbackValue: PetWorldSoundCue): PetWorldSoundCue {
  return typeof soundCue === "string" && allowedSoundCues.includes(soundCue as PetWorldSoundCue) ? soundCue as PetWorldSoundCue : fallbackValue;
}

function normalizeWorldSurface(surface: unknown, fallbackValue: PetWorldSurface): PetWorldSurface {
  return normalizePetWorldSurface(typeof surface === "string" ? surface : null, fallbackValue);
}

function safeBubble(value: unknown, fallbackValue: string) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, "") : "";
  return (sanitizePassivePetText(text) || sanitizePassivePetText(fallbackValue) || "喵").slice(0, 8);
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
  const autonomousSurface = normalizePetWorldSurface(input.space?.pet_world_surface);
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
  const speech = safeBubble(world.speech ?? world.bubble, space.last_ai_bubble ?? fallback.speech);
  const memoryPolicy = world.memory_policy && typeof world.memory_policy === "object" && !Array.isArray(world.memory_policy)
    ? world.memory_policy as PetWorldDecision["memory_policy"]
    : fallback.memory_policy;
  return {
    intent,
    target_surface: targetSurface,
    mood,
    animation: persistentWorldAnimation(animation, intent),
    expression: normalizeWorldExpression(world.expression, fallback.expression),
    symbol: normalizeWorldSymbol(world.symbol, fallback.symbol),
    sound_cue: normalizeWorldSoundCue(world.sound_cue, fallback.sound_cue),
    speech,
    prop: world.prop === "letter" || world.prop === "photo" || world.prop === "memory" || world.prop === "none" ? world.prop : fallback.prop,
    bubble: speech,
    memory_policy: {
      should_write: Boolean(memoryPolicy.should_write),
      memory_type: memoryPolicy.memory_type,
      memory_scope: memoryPolicy.memory_scope,
      importance: Number.isFinite(Number(memoryPolicy.importance)) ? Number(memoryPolicy.importance) : 0,
      summary: typeof memoryPolicy.summary === "string" ? memoryPolicy.summary.slice(0, 60) : "",
      dedupe_key: typeof memoryPolicy.dedupe_key === "string" ? memoryPolicy.dedupe_key.slice(0, 80) : undefined,
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
