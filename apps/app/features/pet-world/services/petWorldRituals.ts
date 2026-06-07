import { invokePetAiBrain } from "@/features/pet/services/petAiBrain";
import { canUsePetAiToday, isPetAiRitualTrigger } from "@/features/pet-world/logic/petAiBudget";
import { applyPetWorldDecision } from "@/features/pet-world/services/petWorldApi";
import type { PetWorldDecision } from "@/features/pet-world/services/petWorldApi";
import type { Json } from "@/lib/supabase/database.types";

export async function applyPetRitualDecision({
  coupleId,
  triggerType,
  localHint,
  fallbackDecision,
  fallbackMeta,
}: {
  coupleId: string;
  triggerType: string;
  localHint?: Record<string, Json | undefined>;
  fallbackDecision: PetWorldDecision;
  fallbackMeta: Json;
}) {
  const baseMeta = normalizeMeta(fallbackMeta);
  if (isPetAiRitualTrigger(triggerType)) {
    const budget = await canUsePetAiToday(coupleId);
    if (budget.allowed) {
      try {
        const result = await invokePetAiBrain({
          coupleId,
          triggerType,
          localHint,
        });
        if (!result.fallback && result.decision?.world) {
          return result.space;
        }
      } catch (error) {
        console.warn("Pet ritual AI fallback used:", error instanceof Error ? error.message : error);
      }
    }
  }

  return applyPetWorldDecision(coupleId, fallbackDecision, {
    ...baseMeta,
    trigger: triggerType,
    ai_used: false,
    source: baseMeta.source ?? "ritual_rule_fallback",
  });
}

function normalizeMeta(meta: Json): Record<string, Json | undefined> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {};
  }
  return meta as Record<string, Json | undefined>;
}
