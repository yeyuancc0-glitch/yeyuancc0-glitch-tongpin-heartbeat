import { useEffect, useRef, type MutableRefObject } from "react";

import type { CreationAction, CreationSpace } from "@/lib/supabase/database.types";
import { applyPetWorldDecision, refreshPetSleep, startPetSleep } from "@/features/pet-world/services/petWorldApi";
import { resolvePetWorldRoamDecision, type PetWorldRuleTrigger } from "@/features/pet-world/logic/petWorldRules";
import { normalizePetWorldSurface, type PetWorldSurface } from "@/features/pet-world/logic/petWorldRoutes";

const idleTickMs = 2 * 60 * 1000;
const sleepRefreshTickMs = 30 * 1000;
const appOpenAppliedKeys = new Set<string>();

function createAppOpenRandomSeed() {
  const randomValue = typeof crypto !== "undefined" && "getRandomValues" in crypto
    ? crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 0xffffffff);
  return `${Date.now().toString(36)}:${randomValue.toString(36)}`;
}

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
  const lastAppliedAtRef = useRef<Record<string, number>>({});
  const lastPartnerOnlineRef = useRef(false);
  const appOpenRandomSeedRef = useRef(createAppOpenRandomSeed());

  useEffect(() => {
    if (!coupleId || !creationSpace || disabled) {
      return;
    }
    const openKey = `${coupleId}:${creationSpace.id ?? "space"}`;
    const firstOpenForSession = !appOpenAppliedKeys.has(openKey);
    if (firstOpenForSession) {
      appOpenAppliedKeys.add(openKey);
    }
    const reason = firstOpenForSession ? "app_open" : creationSpace.pet_last_surface_changed_at ? "page_change" : "refresh";
    void applyRuleRoam({
      coupleId,
      creationSpace,
      creationActions,
      currentSurface,
      partnerOnline,
      trigger: reason,
      source: firstOpenForSession ? "app_open" : "route_effect",
      randomSeed: firstOpenForSession ? appOpenRandomSeedRef.current : undefined,
      lastAppliedRef,
      lastAppliedAtRef,
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
        lastAppliedAtRef,
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
    if (!coupleId || !creationSpace || disabled || !creationSpace.pet_sleep_started_at) {
      return undefined;
    }
    const interval = setInterval(() => {
      void refreshPetSleep(coupleId)
        .then((space) => {
          if (space && space.updated_at !== creationSpace.updated_at) {
            onChanged();
          }
        })
        .catch((error) => {
          console.warn("Pet sleep refresh failed:", error instanceof Error ? error.message : error);
        });
    }, sleepRefreshTickMs);
    return () => clearInterval(interval);
  }, [
    coupleId,
    creationSpace,
    disabled,
    onChanged,
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
      lastAppliedAtRef,
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
        lastAppliedAtRef,
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
  lastAppliedAtRef,
  randomSeed,
  onChanged,
}: {
  coupleId: string;
  creationSpace: CreationSpace;
  creationActions: CreationAction[];
  currentSurface: PetWorldSurface;
  partnerOnline?: boolean;
  trigger: PetWorldRuleTrigger;
  source: string;
  randomSeed?: string;
  lastAppliedRef: MutableRefObject<string | null>;
  lastAppliedAtRef: MutableRefObject<Record<string, number>>;
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
    randomSeed,
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
  const now = Date.now();
  const intervalKey = `${coupleId}:${resolution.reason}`;
  const lastAppliedAt = lastAppliedAtRef.current[intervalKey] ?? 0;
  if (lastAppliedAt > 0 && now - lastAppliedAt < resolution.minIntervalMinutes * 60 * 1000) {
    return false;
  }

  try {
    if (resolution.reason === "outside_visible_rest_rule") {
      await startPetSleep(coupleId, "outside_rest", resolution.decision.target_surface);
    } else if (resolution.reason === "rest_return_home") {
      await startPetSleep(coupleId, "night_auto");
    } else {
      await applyPetWorldDecision(coupleId, resolution.decision, {
        trigger,
        source,
        rule_reason: resolution.reason,
        ai_used: false,
        privacy: "rule_only_low_sensitive_pet_state",
      });
    }
    lastAppliedRef.current = dedupeKey;
    lastAppliedAtRef.current = {
      ...lastAppliedAtRef.current,
      [intervalKey]: now,
    };
    onChanged();
    return true;
  } catch (error) {
    console.warn("Pet world roam rule failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
