import type { CoupleDashboard } from "@/features/home/homeDashboardTypes";

const dashboardCachePrefix = "couple-dashboard:v4:";

function sanitizeDashboardForCache(data: CoupleDashboard): CoupleDashboard {
  return {
    ...data,
    profile: data.profile ? { ...data.profile, avatar_signed_url: null, avatar_thumb_signed_url: null } : null,
    couple: data.couple
      ? {
          ...data.couple,
          couple_members: data.couple.couple_members.map((member) => ({
            ...member,
            profile: member.profile ? { ...member.profile, avatar_signed_url: null, avatar_thumb_signed_url: null } : member.profile,
          })),
        }
      : null,
    pendingInvites: data.pendingInvites,
    checkins: [],
    messages: [],
    events: [],
    letters: [],
    mediaFiles: data.mediaFiles.map((file) => ({
      ...file,
      caption: null,
      signedUrl: null,
      thumbnailSignedUrl: null,
    })),
    moodStatuses: [],
    notifications: [],
    creationSpace: data.creationSpace
      ? {
          ...data.creationSpace,
          pet_mood: data.creationSpace.pet_world_mood,
          last_ai_bubble: null,
          last_world_decision: {},
          last_rig_cue: {},
        }
      : null,
    creationActions: [],
    petMemories: [],
    footprints: [],
  };
}

export function readCachedDashboard(userId: string): CoupleDashboard | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(`${dashboardCachePrefix}${userId}`);
    if (!raw) {
      return null;
    }
    const cached = JSON.parse(raw) as { data?: CoupleDashboard };
    if (cached.data?.profile?.id !== userId) {
      return null;
    }
    return sanitizeDashboardForCache(cached.data);
  } catch {
    return null;
  }
}

export function writeCachedDashboard(userId: string, data: CoupleDashboard) {
  if (typeof window === "undefined" || data.profile?.id !== userId) {
    return;
  }

  try {
    window.localStorage.setItem(`${dashboardCachePrefix}${userId}`, JSON.stringify({ savedAt: Date.now(), data: sanitizeDashboardForCache(data) }));
  } catch {
    // Cache writes are only for refresh UX; storage quota/private mode failures should not affect the app.
  }
}
