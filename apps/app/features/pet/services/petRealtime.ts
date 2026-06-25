import type { CreationSpace } from "@/lib/supabase/database.types";

export type PetRealtimeEvent = {
  action: CreationSpace["current_action"];
  message: string;
  actorId?: string;
};

export function broadcastPetEvent(coupleId: string, event: PetRealtimeEvent) {
  void coupleId;
  void event;
  return Promise.resolve();
}
