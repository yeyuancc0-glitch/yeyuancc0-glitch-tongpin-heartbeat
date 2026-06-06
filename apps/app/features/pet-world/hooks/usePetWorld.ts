import { useMemo } from "react";

import type { CreationSpace } from "@/lib/supabase/database.types";
import { petWorldSurfaceForAppState } from "@/features/pet-world/logic/petWorldRoutes";

export function usePetWorld(input: {
  activeTab: "home" | "checkins" | "calendar" | "me";
  subPage: string;
  townView?: "hub" | "pet" | "footprints" | "playground";
  creationSpace: CreationSpace | null;
  partnerOnline?: boolean;
  blockingModalOpen?: boolean;
  inputFocused?: boolean;
}) {
  return useMemo(() => {
    const route = petWorldSurfaceForAppState({
      activeTab: input.activeTab,
      subPage: input.subPage,
      townView: input.townView,
      blockingModalOpen: input.blockingModalOpen,
      inputFocused: input.inputFocused,
    });
    return {
      ...route,
      partnerOnline: input.partnerOnline ?? false,
      creationSpace: input.creationSpace,
    };
  }, [input.activeTab, input.blockingModalOpen, input.creationSpace, input.inputFocused, input.partnerOnline, input.subPage, input.townView]);
}
