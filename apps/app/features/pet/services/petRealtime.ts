import { supabase } from "@/lib/supabase/client";
import type { CreationSpace } from "@/lib/supabase/database.types";

export type PetRealtimeEvent = {
  action: CreationSpace["current_action"];
  message: string;
  actorId?: string;
};

export function broadcastPetEvent(coupleId: string, event: PetRealtimeEvent) {
  return supabase.channel(`pet-room:${coupleId}`).send({
    type: "broadcast",
    event: "pet_interaction",
    payload: event,
  });
}
