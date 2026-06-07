import { useEffect, useRef, type MutableRefObject } from "react";

import type { CreationAction, CreationSpace } from "@/lib/supabase/database.types";
import { applyPetWorldDecision } from "@/features/pet-world/services/petWorldApi";
import { resolvePetWorldRoamDecision, type PetWorldRuleTrigger } from "@/features/pet-world/logic/petWorldRules";
import { normalizePetWorldSurface, type PetWorldSurface } from "@/features/pet-world/logic/petWorldRoutes";

const idleTickMs = 2 * 60 * 1000;

export function usePetWorldRoaming({
  coupleId,
  creationSpace,
  creationActions,
  currentSurface,
  disabled,
  partnerOnline,
  onChanged,
}: {
  coupleId?: string | null;
  creationSpace: CreationSpace | null;
  creationActions: CreationAction[];
  currentSurface: PetWorldSurface;
  disabled?: boolean;
  partnerOnline?: boolean;
  onChanged: () => void;
}) {
  const lastAppliedRef = useRef<string | null>(null);
  const lastPartnerOnlineRef = useRef(false);

  useEffect(() => {
    if (!coupleId || !creationSpace || disabled) {
      return;
    }
    const reason = creationSpace.pet_last_surface_changed_at ? "page_change" : "refresh";
    void applyRuleRoam({
      coupleId,
      creationSpace,
      creationActions,
      currentSurface,
      partnerOnline,
      trigger: reason,
      source: "route_effect",
      lastAppliedRef,
      onChanged,
    });
  }, [
    coupleId,
    creationActions,
    creationSpace,
    currentSurface,
    disabled,
    onChanged,
    partnerOnline,
  ]);

  useEffect(() => {
    if (!coupleId || !creationSpace || disabled) {
      return undefined;
    }
    const interval = setInterval(() => {
      void applyRuleRoam({
        coupleId,
        creationSpace,
        creationActions,
        currentSurface,
        partnerOnline,
        trigger: "idle_tick",
        source: "idle_tick",
        lastAppliedRef,
        onChanged,
      });
    }, idleTickMs);
    return () => clearInterval(interval);
  }, [
    coupleId,
    creationActions,
    creationSpace,
    currentSurface,
    disabled,
    onChanged,
    partnerOnline,
  ]);

  useEffect(() => {
    const wasOnline = lastPartnerOnlineRef.current;
    lastPartnerOnlineRef.current = Boolean(partnerOnline);
    if (!coupleId || !creationSpace || disabled || !partnerOnline || wasOnline) {
      return;
    }
    void applyRuleRoam({
      coupleId,
      creationSpace,
      creationActions,
      currentSurface,
      partnerOnline,
      trigger: "partner_online",
      source: "partner_presence",
      lastAppliedRef,
      onChanged,
    });
  }, [
    coupleId,
    creationActions,
    creationSpace,
    currentSurface,
    disabled,
    onChanged,
    partnerOnline,
  ]);

  return {
    applyRuleRoam: (trigger: PetWorldRuleTrigger, baseSpace = creationSpace) => {
      if (!coupleId || !baseSpace || disabled) {
        return Promise.resolve(false);
      }
      return applyRuleRoam({
        coupleId,
        creationSpace: baseSpace,
        creationActions,
        currentSurface,
        partnerOnline,
        trigger,
        source: "user_interaction",
        lastAppliedRef,
        onChanged,
      });
    },
  };
}

async function applyRuleRoam({
  coupleId,
  creationSpace,
  creationActions,
  currentSurface,
  partnerOnline,
  trigger,
  source,
  lastAppliedRef,
  onChanged,
}: {
  coupleId: string;
  creationSpace: CreationSpace;
  creationActions: CreationAction[];
  currentSurface: PetWorldSurface;
  partnerOnline?: boolean;
  trigger: PetWorldRuleTrigger;
  source: string;
  lastAppliedRef: MutableRefObject<string | null>;
  onChanged: () => void;
}) {
  const petSurface = normalizePetWorldSurface(creationSpace.pet_world_surface);
  const resolution = resolvePetWorldRoamDecision({
    space: creationSpace,
    surface: petSurface,
    currentSurface,
    partnerOnline,
    hidden: creationSpace.pet_hidden,
    trigger,
    recentActions: creationActions,
  });

  if (!resolution.shouldApply) {
    return false;
  }

  const dedupeKey = [
    coupleId,
    trigger,
    resolution.reason,
    resolution.decision.target_surface,
    creationSpace.updated_at,
    creationSpace.pet_last_surface_changed_at ?? "",
  ].join(":");
  if (lastAppliedRef.current === dedupeKey) {
    return false;
  }
  lastAppliedRef.current = dedupeKey;

  try {
    await applyPetWorldDecision(coupleId, resolution.decision, {
      trigger,
      source,
      rule_reason: resolution.reason,
      ai_used: false,
      privacy: "rule_only_low_sensitive_pet_state",
    });
    onChanged();
    return true;
  } catch (error) {
    console.warn("Pet world roam rule failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
