import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";
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
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!coupleId || !userId) {
      setPartnerOnline(false);
      return undefined;
    }

    const channel = supabase
      .channel(`pet-room:${coupleId}`, {
        config: {
          presence: { key: userId },
          broadcast: { self: false },
        },
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const onlineIds = Object.keys(state);
        setPartnerOnline(onlineIds.some((id) => id !== userId));
      })
      .on("broadcast", { event: "pet_interaction" }, ({ payload }) => {
        onPetEvent?.(payload as PetRealtimeEvent);
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "creation_spaces",
          filter: `couple_id=eq.${coupleId}`,
        },
        () => {
          onSpaceChanged?.();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "creation_actions",
          filter: `couple_id=eq.${coupleId}`,
        },
        () => {
          onSpaceChanged?.();
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });
    channelRef.current = channel;

    return () => {
      setPartnerOnline(false);
      channelRef.current = null;
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [coupleId, onPetEvent, onSpaceChanged, userId]);

  const broadcastPetEvent = useCallback(async (event: PetRealtimeEvent) => {
    const channel = channelRef.current;
    if (!channel) {
      return;
    }
    await channel.send({
      type: "broadcast",
      event: "pet_interaction",
      payload: event,
    });
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
