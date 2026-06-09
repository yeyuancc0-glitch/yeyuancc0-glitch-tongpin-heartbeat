import type {
  ActiveCouple,
  CalendarEvent,
  Checkin,
  CoupleFootprint,
  CreationAction,
  CreationSpace,
  DashboardProfile,
  LetterPreview,
  MediaFile,
  Message,
  MoodStatus,
  Notification,
  PairInvite,
  PetMemory,
} from "@/lib/supabase/database.types";

export type CoupleDashboard = {
  profile: DashboardProfile | null;
  couple: ActiveCouple | null;
  pendingInvites: PairInvite[];
  checkins: Checkin[];
  messages: Message[];
  events: CalendarEvent[];
  letters: LetterPreview[];
  mediaFiles: MediaFile[];
  moodStatuses: MoodStatus[];
  notifications: Notification[];
  creationSpace: CreationSpace | null;
  creationActions: CreationAction[];
  petMemories: PetMemory[];
  footprints: CoupleFootprint[];
};

export function createEmptyDashboard(): CoupleDashboard {
  return {
    profile: null,
    couple: null,
    pendingInvites: [],
    checkins: [],
    messages: [],
    events: [],
    letters: [],
    mediaFiles: [],
    moodStatuses: [],
    notifications: [],
    creationSpace: null,
    creationActions: [],
    petMemories: [],
    footprints: [],
  };
}
