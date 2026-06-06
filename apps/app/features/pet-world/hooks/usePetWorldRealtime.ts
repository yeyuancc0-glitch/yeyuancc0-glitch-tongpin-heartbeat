import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";
import type { PetWorldEvent } from "@/features/pet-world/services/petWorldApi";
import type { Json } from "@/lib/supabase/database.types";

export function usePetWorldRealtime(input: {
  coupleId?: string | null;
  userId?: string | null;
  onWorldChanged?: () => void;
  onPetEvent?: (event: PetWorldEvent) => void;
}) {
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [lastEvent, setLastEvent] = useState<PetWorldEvent | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const publishEvent = useCallback((event: PetWorldEvent) => {
    setLastEvent(event);
    input.onPetEvent?.(event);
  }, [input.onPetEvent]);

  useEffect(() => {
    if (!input.coupleId || !input.userId) {
      setPartnerOnline(false);
      return undefined;
    }

    const channel = supabase
      .channel(`pet-world:${input.coupleId}`, {
        config: {
          presence: { key: input.userId },
          broadcast: { self: false },
        },
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setPartnerOnline(Object.keys(state).some((id) => id !== input.userId));
      })
      .on("broadcast", { event: "pet_world_event" }, ({ payload }) => {
        publishEvent(payload as PetWorldEvent);
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "creation_spaces", filter: `couple_id=eq.${input.coupleId}` },
        () => input.onWorldChanged?.(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pet_world_events", filter: `couple_id=eq.${input.coupleId}` },
        ({ new: row }) => {
          publishEvent({
            id: row.id as string,
            couple_id: row.couple_id as string,
            actor_id: row.actor_id as string | null,
            event_type: row.event_type as string,
            surface: row.surface as string,
            intent: row.intent as string | null,
            metadata: row.metadata as Json,
            created_at: row.created_at as string,
          });
          input.onWorldChanged?.();
        },
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: input.userId, online_at: new Date().toISOString() });
        }
      });

    channelRef.current = channel;

    return () => {
      setPartnerOnline(false);
      channelRef.current = null;
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [input.coupleId, input.onWorldChanged, input.userId, publishEvent]);

  const broadcastPetWorldEvent = async (event: PetWorldEvent) => {
    const channel = channelRef.current;
    if (!channel) {
      return;
    }
    await channel.send({
      type: "broadcast",
      event: "pet_world_event",
      payload: event,
    });
  };

  return { partnerOnline, lastEvent, broadcastPetWorldEvent };
}
