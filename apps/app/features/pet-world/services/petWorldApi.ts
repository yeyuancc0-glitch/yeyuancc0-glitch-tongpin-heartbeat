import type { CreationSpace, Json } from "@/lib/supabase/database.types";
import type { PetWorldDecision } from "@/features/pet/services/petAiBrain";
import type { PetWorldSurface } from "@/features/pet-world/logic/petWorldRoutes";

export type { PetWorldDecision };

export type PetWorldEvent = {
  id?: string;
  couple_id: string;
  actor_id?: string | null;
  event_type: string;
  surface: string;
  intent?: string | null;
  metadata?: Json;
  created_at?: string;
};

export async function applyPetWorldDecision(targetCoupleId: string, decision: PetWorldDecision, generationMeta: Json = {}) {
  void targetCoupleId;
  void decision;
  void generationMeta;
  return null as CreationSpace | null;
}

export async function markPetSurfaceSeen(targetCoupleId: string, surface: string) {
  void targetCoupleId;
  void surface;
  return null as CreationSpace | null;
}

export async function summonPetToSurface(targetCoupleId: string, surface: PetWorldSurface) {
  void targetCoupleId;
  void surface;
  return null as CreationSpace | null;
}

export async function startPetSleep(targetCoupleId: string, sleepReason = "night_auto", sleepSurface?: PetWorldSurface) {
  void targetCoupleId;
  void sleepReason;
  void sleepSurface;
  return null as CreationSpace | null;
}

export async function refreshPetSleep(targetCoupleId: string) {
  void targetCoupleId;
  return null as CreationSpace | null;
}

export async function settlePetNightSleep(targetCoupleId: string) {
  void targetCoupleId;
  return null as CreationSpace | null;
}
