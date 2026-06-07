import type { CreationSpace } from "@/lib/supabase/database.types";
import type { PetWorldAnimation, PetWorldDecision, PetWorldIntent, PetWorldMood } from "@/features/pet/services/petAiBrain";
import { normalizePetWorldSurface, type PetWorldSurface } from "./petWorldRoutes";

type RuleDecisionInput = {
  space: CreationSpace | null;
  surface: PetWorldSurface;
  partnerOnline?: boolean;
  hidden?: boolean;
  now?: Date;
};

function minutesSince(value: string | null | undefined, now: Date) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, (now.getTime() - time) / 60000);
}

function baseDecision(input: {
  intent: PetWorldIntent;
  surface: PetWorldSurface;
  mood: PetWorldMood;
  animation: PetWorldAnimation;
  bubble: string;
}): PetWorldDecision {
  const speech = input.bubble.slice(0, 28);
  return {
    intent: input.intent,
    target_surface: input.surface,
    mood: input.mood,
    animation: input.animation,
    expression: input.mood,
    symbol: "none",
    sound_cue: "none",
    speech,
    prop: "none",
    bubble: speech,
    memory_policy: { should_write: false, importance: 0, summary: "" },
  };
}

export function resolvePetWorldRuleDecision({
  space,
  surface,
  partnerOnline,
  hidden,
  now = new Date(),
}: RuleDecisionInput): PetWorldDecision {
  if (!space) {
    return baseDecision({
      intent: "wander",
      surface,
      mood: "calm",
      animation: "idle",
      bubble: "我在等你们。",
    });
  }

  if (hidden) {
    return baseDecision({
      intent: "hide",
      surface: normalizePetWorldSurface(space.pet_world_surface, surface),
      mood: "curious",
      animation: "hide",
      bubble: "我先躲一下。",
    });
  }

  const hour = now.getHours();
  const minutesFromInteraction = Math.min(
    minutesSince(space.last_interaction_at, now),
    minutesSince(space.last_ai_response_at, now),
  );
  const minutesFromFeed = minutesSince(space.last_fed_at, now);
  const minutesFromPlay = minutesSince(space.last_played_at, now);
  const minutesFromSeen = minutesSince(space.pet_last_seen_at, now);
  const minutesFromFound = minutesSince(space.pet_last_found_at, now);
  const minutesFromSurfaceChange = minutesSince(space.pet_last_surface_changed_at, now);

  if (space.fullness < 28 || minutesFromFeed > 18 * 60) {
    return baseDecision({
      intent: "ask_food",
      surface: "pet_room",
      mood: "hungry",
      animation: "inspect",
      bubble: "我想吃点东西。",
    });
  }

  if (space.cleanliness < 35) {
    return baseDecision({
      intent: "return_home",
      surface: "pet_room",
      mood: "lonely",
      animation: "clean",
      bubble: "小窝想打扫一下。",
    });
  }

  if (space.energy < 24 || hour >= 23 || hour < 7) {
    return baseDecision({
      intent: "rest",
      surface: "pet_room",
      mood: "sleepy",
      animation: "sleep",
      bubble: "我想趴一会儿。",
    });
  }

  if (minutesFromFound < 12) {
    return baseDecision({
      intent: "seek_attention",
      surface,
      mood: "happy",
      animation: "found",
      bubble: "我还在你旁边。",
    });
  }

  if (partnerOnline && space.energy >= 36) {
    return baseDecision({
      intent: "seek_attention",
      surface,
      mood: "excited",
      animation: "happy",
      bubble: "你们都在呀。",
    });
  }

  if (space.affection < 32 && minutesFromInteraction > 45 && space.energy >= 30) {
    return baseDecision({
      intent: "seek_attention",
      surface,
      mood: "lonely",
      animation: "peek",
      bubble: "我想靠近一点。",
    });
  }

  if (space.boredom > 72 && minutesFromPlay > 90) {
    return baseDecision({
      intent: "play",
      surface: "pet_room",
      mood: "curious",
      animation: "play",
      bubble: "想去玩一会儿。",
    });
  }

  if (space.affection >= 76 && minutesFromSeen > 120 && space.energy >= 34) {
    return baseDecision({
      intent: "comfort_user",
      surface,
      mood: "calm",
      animation: "pet",
      bubble: "我来陪你一下。",
    });
  }

  if (space.comfort < 36) {
    return baseDecision({
      intent: "return_home",
      surface: "creation_hub",
      mood: "lonely",
      animation: "return_home",
      bubble: "我想回小家看看。",
    });
  }

  if (minutesFromSurfaceChange > 150 && space.energy >= 40 && space.comfort >= 42) {
    return baseDecision({
      intent: "visit_partner",
      surface: surface === "share" ? "home" : "share",
      mood: "curious",
      animation: "visit_partner",
      bubble: "我去别处逛逛。",
    });
  }

  if (minutesFromInteraction > 8 * 60) {
    return baseDecision({
      intent: "hide",
      surface: surface === "memory" ? "share" : "memory",
      mood: "lonely",
      animation: "hide",
      bubble: "来找找我。",
    });
  }

  if (space.current_action === "eat") {
    return baseDecision({
      intent: "return_home",
      surface: "pet_room",
      mood: "happy",
      animation: "eat",
      bubble: "饭饭真香。",
    });
  }

  if (space.current_action === "play") {
    return baseDecision({
      intent: "play",
      surface: "pet_room",
      mood: "excited",
      animation: "hop",
      bubble: "再玩一下。",
    });
  }

  if (space.current_action === "clean") {
    return baseDecision({
      intent: "return_home",
      surface: "creation_hub",
      mood: "happy",
      animation: "clean",
      bubble: "小窝舒服啦。",
    });
  }

  return baseDecision({
    intent: "wander",
    surface,
    mood: space.pet_world_mood ?? "calm",
    animation: space.energy < 36 ? "idle" : "walk",
    bubble: space.last_ai_bubble || "我在这儿。",
  });
}
