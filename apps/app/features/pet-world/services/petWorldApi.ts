import { supabase } from "@/lib/supabase/client";
import type { CreationSpace, Json } from "@/lib/supabase/database.types";
import type { PetWorldDecision } from "@/features/pet/services/petAiBrain";

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
  const { data, error } = await supabase.rpc("apply_pet_world_decision", {
    target_couple_id: targetCoupleId,
    decision,
    generation_meta: generationMeta,
  }).maybeSingle();

  if (error) {
    throw error;
  }

  return data as CreationSpace | null;
}

export async function markPetSurfaceSeen(targetCoupleId: string, surface: string) {
  const { data, error } = await supabase.rpc("mark_pet_surface_seen", {
    target_couple_id: targetCoupleId,
    surface,
  }).maybeSingle();
  if (error) {
    throw error;
  }
  return data as CreationSpace | null;
}
