import type { CreationAction, CreationSpace } from "@/lib/supabase/database.types";
import type { PetWorldAnimation, PetWorldDecision, PetWorldIntent, PetWorldMood } from "@/features/pet/services/petAiBrain";
import { petAnimalLine, petHumanLine } from "@/features/pet-world/logic/petExpression";
import { normalizePetWorldSurface, type PetWorldSurface } from "./petWorldRoutes";

type RuleDecisionInput = {
  space: CreationSpace | null;
  surface: PetWorldSurface;
  partnerOnline?: boolean;
  hidden?: boolean;
  now?: Date;
};

export type PetWorldRuleTrigger =
  | "page_change"
  | "refresh"
  | "idle_tick"
  | "pet"
  | "feed"
  | "clean"
  | "play"
  | "sleep"
  | "partner_online";

type RoamDecisionInput = RuleDecisionInput & {
  trigger: PetWorldRuleTrigger;
  currentSurface?: PetWorldSurface;
  recentActions?: CreationAction[];
};

export type PetWorldRoamResolution = {
  shouldApply: boolean;
  decision: PetWorldDecision;
  reason: string;
  minIntervalMinutes: number;
};

const roamSurfaceCycle: PetWorldSurface[] = ["home", "share", "memory", "creation_hub", "pet_room"];
const initialRoamSurfaces: PetWorldSurface[] = ["home", "share", "memory"];
const highFrequencyActionTypes = new Set(["feed", "pet", "clean", "play", "sleep"]);

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
  symbol?: PetWorldDecision["symbol"];
  soundCue?: PetWorldDecision["sound_cue"];
  prop?: PetWorldDecision["prop"];
  stateDelta?: PetWorldDecision["state_delta"];
}): PetWorldDecision {
  const speech = input.bubble.slice(0, 28);
  return {
    intent: input.intent,
    target_surface: input.surface,
    mood: input.mood,
    animation: input.animation,
    expression: input.mood,
    symbol: input.symbol ?? "none",
    sound_cue: input.soundCue ?? "none",
    speech,
    prop: input.prop ?? "none",
    bubble: speech,
    state_delta: input.stateDelta,
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
      bubble: petAnimalLine({ intent: "wander" }),
    });
  }

  if (hidden) {
    return baseDecision({
      intent: "hide",
      surface: normalizePetWorldSurface(space.pet_world_surface, surface),
      mood: "curious",
      animation: "hide",
      bubble: petAnimalLine({ intent: "hide" }),
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
      bubble: petAnimalLine({ intent: "ask_food", symbol: "food" }),
    });
  }

  if (space.cleanliness < 35) {
    return baseDecision({
      intent: "return_home",
      surface: "pet_room",
      mood: "lonely",
      animation: "clean",
      bubble: petAnimalLine({ intent: "return_home" }),
    });
  }

  if (space.energy < 24 || hour >= 23 || hour < 7) {
    return baseDecision({
      intent: "rest",
      surface: "pet_room",
      mood: "sleepy",
      animation: "sleep",
      bubble: petAnimalLine({ intent: "rest", symbol: "sleep" }),
    });
  }

  if (minutesFromFound < 12) {
    return baseDecision({
      intent: "seek_attention",
      surface,
      mood: "happy",
      animation: "found",
      bubble: petHumanLine("found"),
    });
  }

  if (partnerOnline && space.energy >= 36) {
    return baseDecision({
      intent: "seek_attention",
      surface,
      mood: "excited",
      animation: "happy",
      bubble: petAnimalLine({ triggerType: "partner_online", intent: "seek_attention", symbol: "heart" }),
    });
  }

  if (space.affection < 32 && minutesFromInteraction > 45 && space.energy >= 30) {
    return baseDecision({
      intent: "seek_attention",
      surface,
      mood: "lonely",
      animation: "peek",
      bubble: petAnimalLine({ intent: "seek_attention" }),
    });
  }

  if (space.boredom > 72 && minutesFromPlay > 90) {
    return baseDecision({
      intent: "play",
      surface: "pet_room",
      mood: "curious",
      animation: "play",
      bubble: petAnimalLine({ intent: "play" }),
    });
  }

  if (space.affection >= 76 && minutesFromSeen > 120 && space.energy >= 34) {
    return baseDecision({
      intent: "comfort_user",
      surface,
      mood: "calm",
      animation: "pet",
      bubble: petAnimalLine({ intent: "comfort_user", symbol: "heart" }),
    });
  }

  if (space.comfort < 36) {
    return baseDecision({
      intent: "return_home",
      surface: "creation_hub",
      mood: "lonely",
      animation: "return_home",
      bubble: petAnimalLine({ intent: "return_home" }),
    });
  }

  if (minutesFromSurfaceChange > 150 && space.energy >= 40 && space.comfort >= 42) {
    return baseDecision({
      intent: "visit_partner",
      surface: surface === "share" ? "home" : "share",
      mood: "curious",
      animation: "visit_partner",
      bubble: petAnimalLine({ intent: "visit_partner" }),
    });
  }

  if (minutesFromInteraction > 8 * 60) {
    return baseDecision({
      intent: "hide",
      surface: surface === "memory" ? "share" : "memory",
      mood: "lonely",
      animation: "hide",
      bubble: petAnimalLine({ intent: "hide" }),
    });
  }

  if (space.current_action === "eat") {
    return baseDecision({
      intent: "return_home",
      surface: "pet_room",
      mood: "happy",
      animation: "eat",
      bubble: petHumanLine("feed"),
    });
  }

  if (space.current_action === "play") {
    return baseDecision({
      intent: "play",
      surface: "pet_room",
      mood: "excited",
      animation: "hop",
      bubble: petHumanLine("play"),
    });
  }

  if (space.current_action === "clean") {
    return baseDecision({
      intent: "return_home",
      surface: "creation_hub",
      mood: "happy",
      animation: "clean",
      bubble: petHumanLine("clean"),
    });
  }

  if (space.current_action === "sleep") {
    return baseDecision({
      intent: "rest",
      surface: "pet_room",
      mood: "sleepy",
      animation: "sleep",
      symbol: "sleep",
      bubble: petHumanLine("sleep"),
    });
  }

  return baseDecision({
    intent: "wander",
    surface,
    mood: space.pet_world_mood ?? "calm",
    animation: space.energy < 36 ? "idle" : "walk",
    bubble: petAnimalLine({ intent: "wander" }),
  });
}

export function resolvePetWorldRoamDecision({
  space,
  surface,
  currentSurface = surface,
  partnerOnline,
  hidden,
  now = new Date(),
  trigger,
  recentActions = [],
}: RoamDecisionInput): PetWorldRoamResolution {
  const autonomousSurface = normalizePetWorldSurface(space?.pet_world_surface, surface);
  const fallback = resolvePetWorldRuleDecision({
    space,
    surface: autonomousSurface,
    partnerOnline,
    hidden,
    now,
  });

  if (!space || hidden) {
    return { shouldApply: false, decision: fallback, reason: "space_unavailable", minIntervalMinutes: 30 };
  }

  if (trigger === "refresh" && !space.pet_last_surface_changed_at) {
    const initialSurface = initialSurfaceForSpace(space);
    return {
      shouldApply: !space.pet_hidden && space.energy >= 24,
      decision: baseDecision({
        intent: "wander",
        surface: initialSurface,
        mood: "curious",
        animation: "peek",
        symbol: "sparkle",
        soundCue: "soft_chime",
        bubble: petAnimalLine({ triggerType: "refresh", intent: "wander", symbol: "sparkle" }),
      }),
      reason: "initial_surface_seed",
      minIntervalMinutes: 3,
    };
  }

  const minutesFromSurfaceChange = minutesSince(space.pet_last_surface_changed_at, now);
  const minutesFromInteraction = minutesSince(space.last_interaction_at, now);
  const minutesFromSeen = minutesSince(space.pet_last_seen_at, now);
  const minutesFromFeed = minutesSince(space.last_fed_at, now);
  const minutesFromPlay = minutesSince(space.last_played_at, now);
  const recentCare = countRecentActions(recentActions, now, 10, highFrequencyActionTypes);
  const currentActionBoost = trigger === "feed" || trigger === "pet" || trigger === "clean" || trigger === "play" || trigger === "sleep" ? 1 : 0;
  const recentPetCount = countRecentActions(recentActions, now, 12, new Set(["pet"])) + (trigger === "pet" ? currentActionBoost : 0);
  const recentFeedCount = countRecentActions(recentActions, now, 18, new Set(["feed"])) + (trigger === "feed" ? currentActionBoost : 0);
  const hour = now.getHours();

  if (trigger === "pet" && recentPetCount >= 3 && minutesFromSurfaceChange >= 10 && space.energy >= 24) {
    return {
      shouldApply: true,
      reason: "continuous_pet_rule",
      minIntervalMinutes: 10,
      decision: baseDecision({
        intent: "seek_attention",
        surface: currentSurface,
        mood: "happy",
        animation: "pet",
        symbol: "heart",
        soundCue: "purr",
        bubble: petHumanLine("pet"),
        stateDelta: { affection: 1, comfort: 1, boredom: -1 },
      }),
    };
  }

  if (trigger === "feed" && recentFeedCount >= 2 && minutesFromSurfaceChange >= 12) {
    return {
      shouldApply: true,
      reason: "continuous_feed_rule",
      minIntervalMinutes: 12,
      decision: baseDecision({
        intent: "return_home",
        surface: "pet_room",
        mood: "happy",
        animation: "eat",
        symbol: "food",
        soundCue: "soft_chime",
        bubble: petHumanLine("feed"),
        stateDelta: { comfort: 1, boredom: -1 },
      }),
    };
  }

  if (trigger === "clean" && minutesFromSurfaceChange >= 10) {
    return {
      shouldApply: true,
      reason: "clean_home_rule",
      minIntervalMinutes: 10,
      decision: baseDecision({
        intent: "return_home",
        surface: "pet_room",
        mood: "happy",
        animation: "clean",
        symbol: "sparkle",
        soundCue: "soft_chime",
        bubble: petHumanLine("clean"),
        stateDelta: { comfort: 1 },
      }),
    };
  }

  if (trigger === "sleep") {
    return {
      shouldApply: autonomousSurface !== "pet_room" || fallback.animation !== "sleep",
      reason: "sleep_home_rule",
      minIntervalMinutes: 6,
      decision: baseDecision({
        intent: "rest",
        surface: "pet_room",
        mood: "sleepy",
        animation: "sleep",
        symbol: "sleep",
        soundCue: "purr",
        bubble: petHumanLine("sleep"),
        stateDelta: { comfort: 1, boredom: -1 },
      }),
    };
  }

  if (space.fullness < 24 || minutesFromFeed > 20 * 60) {
    return {
      shouldApply: minutesFromSurfaceChange >= 18,
      reason: "hungry_return_home",
      minIntervalMinutes: 18,
      decision: baseDecision({
        intent: "ask_food",
        surface: "pet_room",
        mood: "hungry",
        animation: "inspect",
        symbol: "food",
        bubble: petAnimalLine({ intent: "ask_food", symbol: "food" }),
      }),
    };
  }

  if (space.energy < 22 || hour >= 23 || hour < 7) {
    return {
      shouldApply: autonomousSurface !== "pet_room" && minutesFromSurfaceChange >= 20,
      reason: "rest_return_home",
      minIntervalMinutes: 20,
      decision: baseDecision({
        intent: "rest",
        surface: "pet_room",
        mood: "sleepy",
        animation: "sleep",
        symbol: "sleep",
        bubble: petAnimalLine({ intent: "rest", symbol: "sleep" }),
      }),
    };
  }

  if (partnerOnline && trigger === "partner_online" && space.energy >= 34 && minutesFromSurfaceChange >= 24) {
    return {
      shouldApply: true,
      reason: "partner_online_rule",
      minIntervalMinutes: 24,
      decision: baseDecision({
        intent: "seek_attention",
        surface: "home",
        mood: "excited",
        animation: "happy",
        symbol: "heart",
        soundCue: "soft_chime",
        bubble: petAnimalLine({ triggerType: "partner_online", intent: "seek_attention", symbol: "heart" }),
        stateDelta: { affection: 1, boredom: -2 },
      }),
    };
  }

  if (
    (trigger === "page_change" || trigger === "idle_tick") &&
    currentSurface === "home" &&
    autonomousSurface === "pet_room" &&
    space.energy >= 26 &&
    minutesFromSurfaceChange >= 12
  ) {
    return {
      shouldApply: true,
      reason: "home_visit_from_room",
      minIntervalMinutes: 12,
      decision: baseDecision({
        intent: "wander",
        surface: "home",
        mood: "curious",
        animation: "peek",
        symbol: "sparkle",
        soundCue: "soft_chime",
        bubble: petAnimalLine({ intent: "wander", symbol: "sparkle" }),
      }),
    };
  }

  if ((trigger === "page_change" || trigger === "refresh") && autonomousSurface === currentSurface) {
    return {
      shouldApply: false,
      reason: "same_surface_no_move",
      minIntervalMinutes: 20,
      decision: fallback,
    };
  }

  if (recentCare >= 4 && minutesFromSurfaceChange >= 22 && space.energy >= 28) {
    return {
      shouldApply: true,
      reason: "recent_care_rest_rule",
      minIntervalMinutes: 22,
      decision: baseDecision({
        intent: "rest",
        surface: "pet_room",
        mood: "calm",
        animation: "return_home",
        symbol: "heart",
        bubble: petAnimalLine({ intent: "return_home", symbol: "heart" }),
      }),
    };
  }

  if (space.boredom > 68 && minutesFromPlay > 80 && minutesFromSurfaceChange >= 32) {
    return {
      shouldApply: true,
      reason: "boredom_wander_rule",
      minIntervalMinutes: 32,
      decision: baseDecision({
        intent: "play",
        surface: "creation_hub",
        mood: "curious",
        animation: "hop",
        symbol: "sparkle",
        bubble: petAnimalLine({ intent: "play", symbol: "sparkle" }),
      }),
    };
  }

  if (minutesFromInteraction > 6 * 60 && minutesFromSurfaceChange >= 90) {
    const nextSurface = nextRoamSurface(autonomousSurface, currentSurface, "quiet");
    return {
      shouldApply: true,
      reason: "quiet_hide_rule",
      minIntervalMinutes: 90,
      decision: baseDecision({
        intent: "hide",
        surface: nextSurface,
        mood: "calm",
        animation: "hide",
        symbol: "sparkle",
        bubble: petAnimalLine({ intent: "hide", symbol: "sparkle" }),
      }),
    };
  }

  if (minutesFromSurfaceChange >= 8 && space.energy >= 38 && space.comfort >= 42 && (minutesFromSeen >= 8 || autonomousSurface === "pet_room")) {
    const nextSurface = nextRoamSurface(autonomousSurface, currentSurface, "wander");
    return {
      shouldApply: nextSurface !== autonomousSurface,
      reason: "autonomous_wander_rule",
      minIntervalMinutes: 75,
      decision: baseDecision({
        intent: "wander",
        surface: nextSurface,
        mood: "curious",
        animation: "walk",
        symbol: "sparkle",
        bubble: roamLineForSurface(nextSurface),
      }),
    };
  }

  return { shouldApply: false, decision: fallback, reason: "no_rule_move", minIntervalMinutes: 30 };
}

function initialSurfaceForSpace(space: CreationSpace) {
  const seed = `${space.couple_id ?? ""}:${space.created_at ?? ""}:${space.id ?? ""}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return initialRoamSurfaces[hash % initialRoamSurfaces.length] ?? "home";
}

function countRecentActions(actions: CreationAction[], now: Date, withinMinutes: number, actionTypes: Set<string>) {
  return actions.filter((action) => {
    if (!actionTypes.has(action.action_type)) {
      return false;
    }
    return minutesSince(action.created_at, now) <= withinMinutes;
  }).length;
}

function nextRoamSurface(current: PetWorldSurface, userSurface: PetWorldSurface, mode: "wander" | "quiet") {
  if (mode === "quiet") {
    return current === "pet_room" ? "creation_hub" : "pet_room";
  }
  const startIndex = Math.max(0, roamSurfaceCycle.indexOf(current));
  for (let offset = 1; offset <= roamSurfaceCycle.length; offset += 1) {
    const candidate = roamSurfaceCycle[(startIndex + offset) % roamSurfaceCycle.length];
    if (candidate === current) {
      continue;
    }
    if (candidate === userSurface && current !== userSurface) {
      continue;
    }
    return candidate;
  }
  return current;
}

function roamLineForSurface(surface: PetWorldSurface) {
  if (surface === "memory") return petAnimalLine({ prop: "memory", symbol: "memory" });
  if (surface === "pet_room") return petAnimalLine({ intent: "rest", symbol: "sleep" });
  return petAnimalLine({ intent: "wander", symbol: surface === "share" ? "sparkle" : "none" });
}
