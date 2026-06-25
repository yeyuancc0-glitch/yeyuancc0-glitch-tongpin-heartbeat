import { useCallback, useEffect, useRef, useState } from "react";

import type { CreationSpace } from "@/lib/supabase/database.types";
import type { PetRealtimeEvent } from "@/features/pet/services/petRealtime";

type UsePetRealtimeOptions = {
  coupleId?: string | null;
  userId?: string | null;
  onSpaceChanged?: () => void;
  onPetEvent?: (event: PetRealtimeEvent) => void;
};

export function usePetRealtime({ coupleId, userId, onSpaceChanged, onPetEvent }: UsePetRealtimeOptions) {
  const [partnerOnline, setPartnerOnline] = useState(false);
  const callbacksRef = useRef({ onSpaceChanged, onPetEvent });

  useEffect(() => {
    callbacksRef.current = { onSpaceChanged, onPetEvent };
  }, [onPetEvent, onSpaceChanged]);

  useEffect(() => {
    void coupleId;
    void userId;
    setPartnerOnline(false);
    return undefined;
  }, [coupleId, userId]);

  const broadcastPetEvent = useCallback(async (event: PetRealtimeEvent) => {
    void event;
  }, []);

  return { partnerOnline, broadcastPetEvent };
}

export function creationActionToPetEvent(space: CreationSpace | null): PetRealtimeEvent | null {
  if (!space || space.current_action === "idle" || space.current_action === "walk") {
    return null;
  }
  return {
    action: space.current_action,
    message: space.pet_mood,
  };
}
