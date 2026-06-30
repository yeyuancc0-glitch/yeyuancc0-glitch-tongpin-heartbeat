import { selfHostRequest } from "./apiClient";
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

type SelfHostDashboardProfile = {
  id: string;
  displayName: string | null;
  avatarStoragePath: string | null;
  avatarThumbnailStoragePath: string | null;
  avatarSignedUrl?: string | null;
  avatarThumbSignedUrl?: string | null;
  avatarThumbDataUrl?: string | null;
  birthday: string | null;
  accountStatus: DashboardProfile["account_status"];
  deletionRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SelfHostDashboardMember = {
  id: string;
  coupleId: string;
  userId: string;
  role: "member" | "partner";
  joinedAt: string;
  leftAt: string | null;
  profile: SelfHostDashboardProfile | null;
};

type SelfHostDashboardCouple = {
  id: string;
  relationshipStartedAt: string | null;
  createdByUserId: string;
  createdAt: string;
  endedAt: string | null;
  status: "active" | "ended";
  members: SelfHostDashboardMember[];
};

type SelfHostCheckin = {
  id: string;
  coupleId: string;
  userId: string;
  checkinDate: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type SelfHostMessage = {
  id: string;
  coupleId: string;
  senderId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  sender: SelfHostDashboardProfile | null;
};

type SelfHostMedia = {
  id: string;
  coupleId: string;
  uploaderId: string;
  storagePath: string;
  thumbnailStoragePath: string | null;
  signedUrl?: string | null;
  thumbnailSignedUrl?: string | null;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type SelfHostMoodStatus = {
  id: string;
  coupleId: string;
  userId: string;
  mood: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type SelfHostNotification = {
  id: string;
  coupleId: string | null;
  userId: string;
  actorId: string | null;
  type: Notification["type"];
  title: string;
  body: string | null;
  relatedTable: string | null;
  relatedId: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
};

type SelfHostCalendarEvent = {
  id: string;
  coupleId: string;
  createdBy: string;
  title: string;
  eventDate: string;
  type: CalendarEvent["type"];
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type SelfHostFootprint = {
  id: string;
  coupleId: string;
  createdBy: string;
  title: string;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  visitedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type SelfHostLetter = {
  id: string;
  coupleId: string;
  authorId: string;
  recipientId: string;
  authorDisplayName: string | null;
  title: string;
  body: string | null;
  deliverAt: string;
  unlockAt: string;
  isLocked: boolean;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
};

type SelfHostPairInvite = {
  id: string;
  inviteCode: string;
  inviterUserId: string;
  acceptedByUserId: string | null;
  coupleId: string | null;
  status: PairInvite["status"];
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
};

type SelfHostCreationSpace = {
  id: string;
  coupleId: string;
  petKey: CreationSpace["pet_key"];
  petSpecies: CreationSpace["pet_species"];
  petName: string;
  petMood: string;
  petLevel: number;
  growthPoints: number;
  fullness: number;
  cleanliness: number;
  affection: number;
  energy: number;
  boredom: number;
  comfort: number;
  curiosity: number;
  currentAction: CreationSpace["current_action"];
  personalitySeed: string;
  lastBrainTickAt: string | null;
  lastAiResponseAt: string | null;
  lastAiBubble: string | null;
  lastRigCue: CreationSpace["last_rig_cue"];
  treatBalance: number;
  basicFoodCount: number;
  premiumFoodCount: number;
  lastFedFood: CreationSpace["last_fed_food"];
  lastFedAt: string | null;
  lastPlayedAt: string | null;
  homeTheme: string;
  decorSlot1: string;
  decorSlot2: string;
  decorSlot3: string;
  lastInteractionAt: string | null;
  lastWorldDecision: CreationSpace["last_world_decision"];
  petWorldSurface: CreationSpace["pet_world_surface"];
  petWorldState: CreationSpace["pet_world_state"];
  petWorldMood: CreationSpace["pet_world_mood"];
  petHidden: boolean;
  petLastSeenAt: string | null;
  petLastFoundAt: string | null;
  petLastSurfaceChangedAt: string | null;
  petSleepStartedAt: string | null;
  petSleepRecoveredEnergy: number;
  createdAt: string;
  updatedAt: string;
};

type SelfHostCreationAction = {
  id: string;
  coupleId: string;
  actorId: string;
  actionType: CreationAction["action_type"];
  actionLabel: string;
  metadata: CreationAction["metadata"];
  createdAt: string;
};

type SelfHostPetMemory = {
  id: string;
  coupleId: string;
  memoryType: PetMemory["memory_type"];
  memoryScope: PetMemory["memory_scope"];
  importance: number;
  summary: string;
  metadata: PetMemory["metadata"];
  expiresAt: string | null;
  archivedAt: string | null;
  createdBy: string | null;
  createdAt: string;
};

type SelfHostDashboard = {
  profile: SelfHostDashboardProfile | null;
  couple: SelfHostDashboardCouple | null;
  pendingInvites?: SelfHostPairInvite[];
  checkins: SelfHostCheckin[];
  messages: SelfHostMessage[];
  events: SelfHostCalendarEvent[];
  letters: SelfHostLetter[];
  media: SelfHostMedia[];
  moodStatuses: SelfHostMoodStatus[];
  notifications: SelfHostNotification[];
  creationSpace: SelfHostCreationSpace | null;
  creationActions: SelfHostCreationAction[];
  petMemories: SelfHostPetMemory[];
  footprints: SelfHostFootprint[];
};

function mapProfile(profile: SelfHostDashboardProfile | null): DashboardProfile | null {
  if (!profile) {
    return null;
  }
  return {
    id: profile.id,
    display_name: profile.displayName,
    avatar_url: profile.avatarStoragePath,
    avatar_thumbnail_url: profile.avatarThumbnailStoragePath,
    avatar_signed_url: profile.avatarSignedUrl ?? null,
    avatar_thumb_signed_url: profile.avatarThumbSignedUrl ?? null,
    avatar_thumb_data_url: profile.avatarThumbDataUrl ?? null,
    birthdate: profile.birthday,
    account_status: profile.accountStatus,
    deletion_requested_at: profile.deletionRequestedAt,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  };
}

function mapCouple(couple: SelfHostDashboardCouple | null): ActiveCouple | null {
  if (!couple) {
    return null;
  }
  return {
    id: couple.id,
    started_at: couple.relationshipStartedAt ?? couple.createdAt,
    anniversary_date: null,
    status: couple.status,
    created_by: couple.createdByUserId,
    created_at: couple.createdAt,
    ended_at: couple.endedAt,
    couple_members: couple.members.map((member) => ({
      id: member.id,
      couple_id: member.coupleId,
      user_id: member.userId,
      role: "member",
      joined_at: member.joinedAt,
      left_at: member.leftAt,
      profile: mapProfile(member.profile) ?? undefined,
    })),
  };
}

function mapCheckin(checkin: SelfHostCheckin): Checkin {
  return {
    id: checkin.id,
    couple_id: checkin.coupleId,
    user_id: checkin.userId,
    checkin_date: checkin.checkinDate,
    content: checkin.content,
    created_at: checkin.createdAt,
    updated_at: checkin.updatedAt,
    deleted_at: checkin.deletedAt,
  };
}

function mapMessage(message: SelfHostMessage): Message {
  return {
    id: message.id,
    couple_id: message.coupleId,
    sender_id: message.senderId,
    body: message.body,
    created_at: message.createdAt,
    updated_at: message.updatedAt,
    deleted_at: message.deletedAt,
    sender: mapProfile(message.sender) ?? undefined,
  };
}

function mapMedia(media: SelfHostMedia): MediaFile {
  return {
    id: media.id,
    couple_id: media.coupleId,
    uploader_id: media.uploaderId,
    storage_path: media.storagePath,
    thumbnail_storage_path: media.thumbnailStoragePath,
    mime_type: media.mimeType,
    size_bytes: media.sizeBytes,
    caption: media.caption,
    created_at: media.createdAt,
    updated_at: media.updatedAt,
    deleted_at: media.deletedAt,
    signedUrl: media.signedUrl ?? null,
    thumbnailSignedUrl: media.thumbnailSignedUrl ?? null,
  };
}

function mapMoodStatus(moodStatus: SelfHostMoodStatus): MoodStatus {
  return {
    id: moodStatus.id,
    couple_id: moodStatus.coupleId,
    user_id: moodStatus.userId,
    mood: moodStatus.mood,
    note: moodStatus.note,
    created_at: moodStatus.createdAt,
    updated_at: moodStatus.updatedAt,
  };
}

function mapNotification(notification: SelfHostNotification): Notification {
  return {
    id: notification.id,
    couple_id: notification.coupleId,
    user_id: notification.userId,
    actor_id: notification.actorId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    related_table: notification.relatedTable,
    related_id: notification.relatedId,
    read_at: notification.readAt,
    dismissed_at: notification.dismissedAt,
    created_at: notification.createdAt,
  };
}

function mapCalendarEvent(event: SelfHostCalendarEvent): CalendarEvent {
  return {
    id: event.id,
    couple_id: event.coupleId,
    created_by: event.createdBy,
    title: event.title,
    event_date: event.eventDate,
    type: event.type,
    note: event.note,
    created_at: event.createdAt,
    updated_at: event.updatedAt,
    deleted_at: event.deletedAt,
  };
}

function mapFootprint(footprint: SelfHostFootprint): CoupleFootprint {
  return {
    id: footprint.id,
    couple_id: footprint.coupleId,
    created_by: footprint.createdBy,
    title: footprint.title,
    note: footprint.note,
    latitude: footprint.latitude,
    longitude: footprint.longitude,
    visited_at: footprint.visitedAt,
    created_at: footprint.createdAt,
    updated_at: footprint.updatedAt,
    deleted_at: footprint.deletedAt,
  };
}

function mapLetter(letter: SelfHostLetter): LetterPreview {
  return {
    id: letter.id,
    couple_id: letter.coupleId,
    author_id: letter.authorId,
    recipient_id: letter.recipientId,
    author_display_name: letter.authorDisplayName,
    title: letter.title,
    body: letter.body,
    deliver_at: letter.deliverAt,
    unlock_at: letter.unlockAt,
    is_locked: letter.isLocked,
    read_at: letter.readAt,
    dismissed_at: letter.dismissedAt,
    created_at: letter.createdAt,
    deleted_at: letter.deletedAt,
  };
}

function mapPairInvite(invite: SelfHostPairInvite): PairInvite {
  return {
    id: invite.id,
    code: invite.inviteCode,
    created_by: invite.inviterUserId,
    accepted_by: invite.acceptedByUserId,
    status: invite.status,
    expires_at: invite.expiresAt,
    created_at: invite.createdAt,
    accepted_at: invite.acceptedAt,
  };
}

function mapCreationSpace(space: SelfHostCreationSpace | null): CreationSpace | null {
  if (!space) {
    return null;
  }
  return {
    id: space.id,
    couple_id: space.coupleId,
    pet_key: space.petKey,
    pet_species: space.petSpecies,
    pet_name: space.petName,
    pet_mood: space.petMood,
    pet_level: space.petLevel,
    growth_points: space.growthPoints,
    fullness: space.fullness,
    cleanliness: space.cleanliness,
    affection: space.affection,
    energy: space.energy,
    boredom: space.boredom,
    comfort: space.comfort,
    curiosity: space.curiosity,
    current_action: space.currentAction,
    personality_seed: space.personalitySeed,
    last_brain_tick_at: space.lastBrainTickAt,
    last_ai_response_at: space.lastAiResponseAt,
    last_ai_bubble: space.lastAiBubble,
    last_rig_cue: space.lastRigCue ?? {},
    treat_balance: space.treatBalance,
    basic_food_count: space.basicFoodCount,
    premium_food_count: space.premiumFoodCount,
    last_fed_food: space.lastFedFood,
    last_fed_at: space.lastFedAt,
    last_played_at: space.lastPlayedAt,
    home_theme: space.homeTheme,
    decor_slot_1: space.decorSlot1,
    decor_slot_2: space.decorSlot2,
    decor_slot_3: space.decorSlot3,
    last_interaction_at: space.lastInteractionAt,
    last_world_decision: space.lastWorldDecision ?? {},
    pet_world_surface: space.petWorldSurface,
    pet_world_state: space.petWorldState,
    pet_world_mood: space.petWorldMood,
    pet_hidden: space.petHidden,
    pet_last_seen_at: space.petLastSeenAt,
    pet_last_found_at: space.petLastFoundAt,
    pet_last_surface_changed_at: space.petLastSurfaceChangedAt,
    pet_sleep_started_at: space.petSleepStartedAt,
    pet_sleep_recovered_energy: space.petSleepRecoveredEnergy,
    created_at: space.createdAt,
    updated_at: space.updatedAt,
  };
}

function mapCreationAction(action: SelfHostCreationAction): CreationAction {
  return {
    id: action.id,
    couple_id: action.coupleId,
    actor_id: action.actorId,
    action_type: action.actionType,
    action_label: action.actionLabel,
    metadata: action.metadata ?? {},
    created_at: action.createdAt,
  };
}

function mapPetMemory(memory: SelfHostPetMemory): PetMemory {
  return {
    id: memory.id,
    couple_id: memory.coupleId,
    memory_type: memory.memoryType,
    memory_scope: memory.memoryScope,
    importance: memory.importance,
    summary: memory.summary,
    metadata: memory.metadata ?? {},
    expires_at: memory.expiresAt,
    archived_at: memory.archivedAt,
    created_by: memory.createdBy,
    created_at: memory.createdAt,
  };
}

export async function getSelfHostDashboard(input: {
  accessToken: string;
  currentUserId: string;
}) {
  const response = await selfHostRequest<{ dashboard: SelfHostDashboard }>("/api/me/dashboard", {
    accessToken: input.accessToken,
  });
  const dashboard = response.dashboard;
  return {
    profile: mapProfile(dashboard.profile),
    couple: mapCouple(dashboard.couple),
    pendingInvites: (dashboard.pendingInvites ?? []).map(mapPairInvite),
    checkins: dashboard.checkins.map(mapCheckin),
    messages: dashboard.messages.map(mapMessage),
    events: dashboard.events.map(mapCalendarEvent),
    letters: dashboard.letters.map(mapLetter),
    mediaFiles: dashboard.media.map(mapMedia),
    moodStatuses: dashboard.moodStatuses.map(mapMoodStatus),
    notifications: dashboard.notifications.map(mapNotification),
    creationSpace: mapCreationSpace(dashboard.creationSpace),
    creationActions: dashboard.creationActions.map(mapCreationAction),
    petMemories: dashboard.petMemories.map(mapPetMemory),
    footprints: dashboard.footprints.map(mapFootprint),
  };
}
