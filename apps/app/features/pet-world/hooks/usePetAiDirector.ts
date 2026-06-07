import { useCallback, useState } from "react";

import type { CreationSpace } from "@/lib/supabase/database.types";
import { invokePetAiBrain } from "@/features/pet/services/petAiBrain";
import { resolvePetWorldDecision } from "@/features/pet-world/logic/petIntentResolver";
import { normalizePetWorldSurface, type PetWorldSurface } from "@/features/pet-world/logic/petWorldRoutes";

export function usePetAiDirector(input: {
  coupleId?: string | null;
  creationSpace: CreationSpace | null;
  surface: PetWorldSurface;
  petSurface?: PetWorldSurface | null;
  partnerOnline?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const requestWorldDecision = useCallback(async (triggerType: string) => {
    if (!input.coupleId || !input.creationSpace || busy) {
      return null;
    }
    setBusy(true);
    try {
      const result = await invokePetAiBrain({
        coupleId: input.coupleId,
        triggerType,
        localHint: {
          surface: input.surface,
          partner_online: input.partnerOnline ?? false,
        },
      });
      const decision = result.decision?.world ?? null;
      const autonomousSurface = input.petSurface ?? normalizePetWorldSurface(input.creationSpace.pet_world_surface);
      const nextDecision = decision ?? resolvePetWorldDecision({
        space: result.space ?? input.creationSpace,
        surface: autonomousSurface,
        partnerOnline: input.partnerOnline,
      });
      return { result, decision: nextDecision, updated: result.space };
    } catch (error) {
      const autonomousSurface = input.petSurface ?? normalizePetWorldSurface(input.creationSpace.pet_world_surface);
      const decision = resolvePetWorldDecision({
        space: input.creationSpace,
        surface: autonomousSurface,
        partnerOnline: input.partnerOnline,
      });
      return {
        result: {
          space: input.creationSpace,
          decision: { action: input.creationSpace.current_action, mood: decision.mood, bubble: decision.bubble, world: decision },
          fallback: true,
          errorCode: error instanceof Error ? error.message.slice(0, 60) : "pet_ai_failed",
        },
        decision,
        updated: input.creationSpace,
      };
    } finally {
      setBusy(false);
    }
  }, [busy, input.coupleId, input.creationSpace, input.partnerOnline, input.petSurface, input.surface]);

  return { busy, requestWorldDecision };
}
