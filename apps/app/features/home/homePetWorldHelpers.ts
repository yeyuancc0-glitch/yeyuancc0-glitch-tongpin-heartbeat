import type { VisiblePetSurface } from "@/features/home/homeShared";
import { petAnimalLine } from "@/features/pet-world/logic/petExpression";
import type { PetWorldSurface } from "@/features/pet-world/logic/petWorldRoutes";
import { applyPetRitualDecision } from "@/features/pet-world/services/petWorldRituals";
import { localDateKey } from "@/lib/dates/date";
import type { CreationSpace } from "@/lib/supabase/database.types";

const petNightSleepStartHour = 23;
const petNightSleepEndHour = 7;

export function visiblePetSurfaceFor(surface: PetWorldSurface): VisiblePetSurface | null {
  if (surface === "home" || surface === "share" || surface === "memory") {
    return surface;
  }
  return null;
}

export function visibleGlobalPetSurfaceForRealSurface(surface: PetWorldSurface): VisiblePetSurface | null {
  if (surface === "pet_room" || surface === "creation_hub") {
    return "home";
  }
  return visiblePetSurfaceFor(surface);
}

function isPetNightSleepTime(now = new Date()) {
  const hour = now.getHours();
  return hour >= petNightSleepStartHour || hour < petNightSleepEndHour;
}

export function isAutoNightSleepReadyToWake(sleepStartedAt?: string | null, now = new Date()) {
  if (!sleepStartedAt || isPetNightSleepTime(now)) {
    return false;
  }
  const started = new Date(sleepStartedAt);
  if (Number.isNaN(started.getTime())) {
    return false;
  }
  return isPetNightSleepTime(started);
}

export function petWorldPropFromDecision(value: CreationSpace["last_world_decision"] | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const world = raw.world && typeof raw.world === "object" && !Array.isArray(raw.world) ? raw.world as Record<string, unknown> : raw;
  return world.prop === "letter" || world.prop === "photo" || world.prop === "memory" || world.prop === "none" ? world.prop : null;
}

export async function movePetForLetterDelivery(coupleId: string, mode: "now" | "later") {
  await applyPetRitualDecision({
    coupleId,
    triggerType: "letter_delivery",
    localHint: {
      surface: "share",
      partner_online: false,
    },
    fallbackDecision: {
      intent: "visit_partner",
      target_surface: "share",
      mood: "happy",
      animation: "run",
      expression: "happy",
      symbol: "letter",
      sound_cue: "letter",
      speech: petAnimalLine({ triggerType: "letter_delivery", prop: "letter" }),
      prop: "letter",
      bubble: petAnimalLine({ triggerType: "letter_delivery", prop: "letter" }),
      state_delta: {
        affection: mode === "now" ? 1 : 0,
      },
      memory_policy: {
        should_write: true,
        memory_type: "milestone",
        memory_scope: "core",
        importance: 98,
        summary: "第一次帮你们送出一封信",
        dedupe_key: "first_letter_delivery",
      },
      rig_cue: {
        gaze: "partner",
        blink: "normal",
        tail: "fast",
        pose: "bounce",
      },
    },
    fallbackMeta: {
      source: "write_letter",
      privacy: "letter_body_not_included",
    },
  });
}

export async function movePetForMemoryEvent(coupleId: string, kind: "photo" | "memory" | "anniversary" | "today_capsule") {
  const isPhoto = kind === "photo";
  const isTodayCapsule = kind === "today_capsule";
  const triggerType = kind === "anniversary" ? "memory_anniversary" : isPhoto ? "memory_photo" : isTodayCapsule ? "today_capsule" : "memory_event";
  await applyPetRitualDecision({
    coupleId,
    triggerType,
    localHint: {
      surface: "memory",
      partner_online: false,
    },
    fallbackDecision: {
      intent: "inspect_memory",
      target_surface: "memory",
      mood: "curious",
      animation: "inspect",
      expression: kind === "anniversary" ? "soft" : "curious",
      symbol: isPhoto ? "photo" : "memory",
      sound_cue: isPhoto ? "photo" : "soft_chime",
      speech: petAnimalLine({
        triggerType,
        prop: isPhoto ? "photo" : "memory",
        symbol: isPhoto ? "photo" : "memory",
      }),
      prop: isPhoto ? "photo" : "memory",
      bubble: petAnimalLine({
        triggerType,
        prop: isPhoto ? "photo" : "memory",
        symbol: isPhoto ? "photo" : "memory",
      }),
      state_delta: {
        affection: kind === "anniversary" ? 1 : 0,
      },
      memory_policy: kind === "anniversary"
        ? {
            should_write: true,
            memory_type: "event",
            memory_scope: "core",
            importance: 96,
            summary: "陪你们记住一个纪念日",
            dedupe_key: `anniversary_memory:${localDateKey()}`,
          }
        : { should_write: false, importance: 0, summary: "" },
      rig_cue: {
        gaze: "none",
        blink: "slow",
        tail: "soft",
        pose: "sit",
      },
    },
    fallbackMeta: {
      source: "memory_surface_trigger",
      privacy: "body_caption_photo_content_not_included",
    },
  });
}
