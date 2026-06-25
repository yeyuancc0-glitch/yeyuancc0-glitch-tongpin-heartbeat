import { selfHostRequest } from "./apiClient";
import type { CreationFoodType } from "@/features/home/homeShared";
import type { PetWorldSurface } from "@/features/pet-world/logic/petWorldRoutes";
import type { CreationAction, CreationSpace } from "@/lib/supabase/database.types";

type SelfHostCreationSpace = {
  id: string;
  coupleId: string;
  petKey: CreationSpace["pet_key"];
  petSpecies: CreationSpace["pet_species"];
  petName: string;
  petMood: string;
  petLevel: number;
  growthPoints: number;
  fullness: number;
  cleanliness: number;
  affection: number;
  energy: number;
  boredom: number;
  comfort: number;
  curiosity: number;
  currentAction: CreationSpace["current_action"];
  personalitySeed: string;
  lastBrainTickAt: string | null;
  lastAiResponseAt: string | null;
  lastAiBubble: string | null;
  lastRigCue: CreationSpace["last_rig_cue"];
  treatBalance: number;
  basicFoodCount: number;
  premiumFoodCount: number;
  lastFedFood: CreationSpace["last_fed_food"];
  lastFedAt: string | null;
  lastPlayedAt: string | null;
  homeTheme: string;
  decorSlot1: string;
  decorSlot2: string;
  decorSlot3: string;
  lastInteractionAt: string | null;
  lastWorldDecision: CreationSpace["last_world_decision"];
  petWorldSurface: CreationSpace["pet_world_surface"];
  petWorldState: CreationSpace["pet_world_state"];
  petWorldMood: CreationSpace["pet_world_mood"];
  petHidden: boolean;
  petLastSeenAt: string | null;
  petLastFoundAt: string | null;
  petLastSurfaceChangedAt: string | null;
  petSleepStartedAt: string | null;
  petSleepRecoveredEnergy: number;
  createdAt: string;
  updatedAt: string;
};

type SelfHostCreationAction = {
  id: string;
  coupleId: string;
  actorId: string;
  actionType: CreationAction["action_type"];
  actionLabel: string;
  metadata: CreationAction["metadata"];
  createdAt: string;
};

function mapSelfHostCreationSpace(space: SelfHostCreationSpace | null): CreationSpace | null {
  if (!space) {
    return null;
  }
  return {
    id: space.id,
    couple_id: space.coupleId,
    pet_key: space.petKey,
    pet_species: space.petSpecies,
    pet_name: space.petName,
    pet_mood: space.petMood,
    pet_level: space.petLevel,
    growth_points: space.growthPoints,
    fullness: space.fullness,
    cleanliness: space.cleanliness,
    affection: space.affection,
    energy: space.energy,
    boredom: space.boredom,
    comfort: space.comfort,
    curiosity: space.curiosity,
    current_action: space.currentAction,
    personality_seed: space.personalitySeed,
    last_brain_tick_at: space.lastBrainTickAt,
    last_ai_response_at: space.lastAiResponseAt,
    last_ai_bubble: space.lastAiBubble,
    last_rig_cue: space.lastRigCue ?? {},
    treat_balance: space.treatBalance,
    basic_food_count: space.basicFoodCount,
    premium_food_count: space.premiumFoodCount,
    last_fed_food: space.lastFedFood,
    last_fed_at: space.lastFedAt,
    last_played_at: space.lastPlayedAt,
    home_theme: space.homeTheme,
    decor_slot_1: space.decorSlot1,
    decor_slot_2: space.decorSlot2,
    decor_slot_3: space.decorSlot3,
    last_interaction_at: space.lastInteractionAt,
    last_world_decision: space.lastWorldDecision ?? {},
    pet_world_surface: space.petWorldSurface,
    pet_world_state: space.petWorldState,
    pet_world_mood: space.petWorldMood,
    pet_hidden: space.petHidden,
    pet_last_seen_at: space.petLastSeenAt,
    pet_last_found_at: space.petLastFoundAt,
    pet_last_surface_changed_at: space.petLastSurfaceChangedAt,
    pet_sleep_started_at: space.petSleepStartedAt,
    pet_sleep_recovered_energy: space.petSleepRecoveredEnergy,
    created_at: space.createdAt,
    updated_at: space.updatedAt,
  };
}

function mapSelfHostCreationAction(action: SelfHostCreationAction): CreationAction {
  return {
    id: action.id,
    couple_id: action.coupleId,
    actor_id: action.actorId,
    action_type: action.actionType,
    action_label: action.actionLabel,
    metadata: action.metadata ?? {},
    created_at: action.createdAt,
  };
}

export async function ensureSelfHostCreationSpace(input: {
  accessToken: string;
  coupleId: string;
}) {
  const response = await selfHostRequest<{ creationSpace: SelfHostCreationSpace }>("/api/creation/space", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
    },
  });
  return mapSelfHostCreationSpace(response.creationSpace);
}

export async function recordSelfHostCreationAction(input: {
  accessToken: string;
  coupleId: string;
  actionType: CreationAction["action_type"];
  actionLabel: string;
  metadata?: CreationAction["metadata"];
}) {
  const response = await selfHostRequest<{ creationAction: SelfHostCreationAction }>("/api/creation/actions", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      actionType: input.actionType,
      actionLabel: input.actionLabel,
      metadata: input.metadata ?? {},
    },
  });
  return mapSelfHostCreationAction(response.creationAction);
}

export async function feedSelfHostCreationPet(input: {
  accessToken: string;
  coupleId: string;
  foodType: CreationFoodType;
}) {
  const response = await selfHostRequest<{ creationSpace: SelfHostCreationSpace }>("/api/creation/pet/feed", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      foodType: input.foodType,
    },
  });
  return mapSelfHostCreationSpace(response.creationSpace);
}

export async function interactSelfHostCreationPet(input: {
  accessToken: string;
  coupleId: string;
  interactionType: "pet" | "clean" | "play" | "sleep";
}) {
  const response = await selfHostRequest<{ creationSpace: SelfHostCreationSpace }>("/api/creation/pet/interact", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      interactionType: input.interactionType,
    },
  });
  return mapSelfHostCreationSpace(response.creationSpace);
}

export async function settleSelfHostCreationPetSleep(input: {
  accessToken: string;
  coupleId: string;
}) {
  const response = await selfHostRequest<{ creationSpace: SelfHostCreationSpace }>("/api/creation/pet/sleep/settle", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
    },
  });
  return mapSelfHostCreationSpace(response.creationSpace);
}

export async function buySelfHostCreationFood(input: {
  accessToken: string;
  coupleId: string;
  foodType: CreationFoodType;
  quantity?: number;
}) {
  const response = await selfHostRequest<{ creationSpace: SelfHostCreationSpace }>("/api/creation/pet/food/buy", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      foodType: input.foodType,
      quantity: input.quantity ?? 1,
    },
  });
  return mapSelfHostCreationSpace(response.creationSpace);
}

export async function claimSelfHostCreationGameReward(input: {
  accessToken: string;
  coupleId: string;
  puzzleId: string;
}) {
  const response = await selfHostRequest<{ creationSpace: SelfHostCreationSpace }>("/api/creation/game/reward", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      puzzleId: input.puzzleId,
      solved: true,
    },
  });
  return mapSelfHostCreationSpace(response.creationSpace);
}

export async function summonSelfHostCreationPet(input: {
  accessToken: string;
  coupleId: string;
  surface: Extract<PetWorldSurface, "home" | "share" | "memory" | "creation_hub" | "pet_room">;
}) {
  const response = await selfHostRequest<{ creationSpace: SelfHostCreationSpace }>("/api/creation/pet/summon", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      surface: input.surface,
    },
  });
  return mapSelfHostCreationSpace(response.creationSpace);
}
