import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import type {
  ActiveCouple,
  CalendarEvent,
  Checkin,
  CreationAction,
  CreationSpace,
  LetterPreview,
  MediaFile,
  Message,
  MoodStatus,
  Notification,
  PairInvite,
  PetMemory,
  CoupleFootprint,
  Profile,
} from "@/lib/supabase/database.types";
import { createSignedUrl, storageBuckets } from "@/lib/supabase/storage";

export type CoupleDashboard = {
  profile: Profile | null;
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

function createEmptyDashboard(): CoupleDashboard {
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

const emptyDashboard = createEmptyDashboard();
const dashboardCachePrefix = "couple-dashboard:v3:";

function stripVolatileSignedUrls(data: CoupleDashboard): CoupleDashboard {
  return {
    ...data,
    profile: data.profile ? { ...data.profile, avatar_signed_url: null } : null,
    couple: data.couple
      ? {
          ...data.couple,
          couple_members: data.couple.couple_members.map((member) => ({
            ...member,
            profile: member.profile ? { ...member.profile, avatar_signed_url: null } : member.profile,
          })),
        }
      : null,
    messages: data.messages.map((message) => ({
      ...message,
      sender: message.sender ? { ...message.sender, avatar_signed_url: null } : message.sender,
    })),
    mediaFiles: data.mediaFiles.map((file) => ({ ...file, signedUrl: null })),
  };
}

function readCachedDashboard(userId: string) {
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
    return stripVolatileSignedUrls(cached.data);
  } catch {
    return null;
  }
}

function writeCachedDashboard(userId: string, data: CoupleDashboard) {
  if (typeof window === "undefined" || data.profile?.id !== userId) {
    return;
  }

  try {
    window.localStorage.setItem(`${dashboardCachePrefix}${userId}`, JSON.stringify({ savedAt: Date.now(), data: stripVolatileSignedUrls(data) }));
  } catch {
    // Cache writes are only for refresh UX; storage quota/private mode failures should not affect the app.
  }
}

export function useCoupleData(userId?: string) {
  const requestIdRef = useRef(0);
  const [data, setData] = useState<CoupleDashboard>(() => createEmptyDashboard());
  const dataRef = useRef<CoupleDashboard>(createEmptyDashboard());
  const [loadedUserId, setLoadedUserId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const saveData = useCallback((nextData: CoupleDashboard | ((current: CoupleDashboard) => CoupleDashboard)) => {
    const resolved = typeof nextData === "function" ? nextData(dataRef.current) : nextData;
    dataRef.current = resolved;
    setData(resolved);
  }, []);

  const load = useCallback(async (options: { initial?: boolean } = {}) => {
    const requestId = ++requestIdRef.current;

    if (!userId) {
      saveData(createEmptyDashboard());
      setLoadedUserId(undefined);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (options.initial) {
      const cachedDashboard = readCachedDashboard(userId);
      if (cachedDashboard) {
        saveData(cachedDashboard);
        setLoadedUserId(userId);
      } else {
        saveData(createEmptyDashboard());
        setLoadedUserId(undefined);
      }
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [profileResult, coupleResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase
          .from("couples")
          .select("*, couple_members(*, profile:profiles(*))")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const couple = coupleResult.data as ActiveCouple | null;
      const coupleMembers = couple?.couple_members ?? [];
      const coupleId = couple?.id;
      const currentDashboard = dataRef.current;

      const avatarStateByUserId = new Map(
        [
          ...(currentDashboard.profile ? [currentDashboard.profile] : []),
          ...(currentDashboard.couple?.couple_members.map((member) => member.profile).filter(Boolean) ?? []),
        ]
          .filter((avatarProfile): avatarProfile is Profile => Boolean(avatarProfile))
          .map((avatarProfile) => [
            avatarProfile.id,
            { path: avatarProfile.avatar_url, signedUrl: avatarProfile.avatar_signed_url ?? null },
          ] as const)
      );
      const preservedAvatarUrlForUser = (userIdToMatch: string, avatarPath?: string | null) => {
        const existingAvatar = avatarStateByUserId.get(userIdToMatch);
        if (!existingAvatar || existingAvatar.path !== avatarPath) {
          return null;
        }
        return existingAvatar.signedUrl;
      };
      const profile = profileResult.data
        ? { ...profileResult.data, avatar_signed_url: preservedAvatarUrlForUser(profileResult.data.id, profileResult.data.avatar_url) }
        : null;
      const coupleWithAvatarUrls = couple
        ? {
            ...couple,
            couple_members: coupleMembers.map((member) => ({
              ...member,
              profile: member.profile
                ? {
                    ...member.profile,
                    avatar_signed_url: preservedAvatarUrlForUser(member.user_id, member.profile.avatar_url),
                  }
                : member.profile,
            })),
        }
        : null;

      if (requestId !== requestIdRef.current) {
        return;
      }

      const baseData: CoupleDashboard = {
        profile,
        couple: coupleWithAvatarUrls,
        pendingInvites: currentDashboard.profile?.id === userId ? currentDashboard.pendingInvites : [],
        checkins: currentDashboard.profile?.id === userId ? currentDashboard.checkins : [],
        messages: currentDashboard.profile?.id === userId ? currentDashboard.messages : [],
        events: currentDashboard.profile?.id === userId ? currentDashboard.events : [],
        letters: currentDashboard.profile?.id === userId ? currentDashboard.letters : [],
        mediaFiles: currentDashboard.profile?.id === userId ? currentDashboard.mediaFiles : [],
        moodStatuses: currentDashboard.profile?.id === userId ? currentDashboard.moodStatuses : [],
      notifications: currentDashboard.profile?.id === userId ? currentDashboard.notifications : [],
      creationSpace: currentDashboard.profile?.id === userId ? currentDashboard.creationSpace : null,
      creationActions: currentDashboard.profile?.id === userId ? currentDashboard.creationActions : [],
      petMemories: currentDashboard.profile?.id === userId ? currentDashboard.petMemories : [],
      footprints: currentDashboard.profile?.id === userId ? currentDashboard.footprints : [],
    };
      saveData(baseData);
      writeCachedDashboard(userId, baseData);
      setLoadedUserId(userId);
      setLoading(false);
      setRefreshing(false);

      if (!coupleId) {
        const { data: pendingInvites } = await supabase
          .from("pair_invites")
          .select("*")
          .eq("created_by", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false });

        if (requestId !== requestIdRef.current) {
          return;
        }

        saveData((current) => {
          if (current.profile?.id !== userId) {
            return current;
          }
          const pairingData = {
            ...current,
            pendingInvites: pendingInvites ?? [],
          };
          writeCachedDashboard(userId, pairingData);
          return pairingData;
        });
        return;
      }

      void (async () => {
      const [
        checkinsResult,
        messagesResult,
        eventsResult,
        mediaFilesResult,
        moodStatusesResult,
        notificationsResult,
        creationSpaceResult,
        creationActionsResult,
        petMemoriesResult,
        footprintsResult,
        lettersResult,
      ] = await Promise.all([
        supabase
          .from("checkins")
          .select("*")
          .eq("couple_id", coupleId)
          .order("checkin_date", { ascending: false })
          .limit(8),
        supabase
          .from("messages")
          .select("*, sender:profiles(*)")
          .eq("couple_id", coupleId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("calendar_events")
          .select("*")
          .eq("couple_id", coupleId)
          .is("deleted_at", null)
          .order("event_date", { ascending: true })
          .limit(8),
        supabase
          .from("media_files")
          .select("*")
          .eq("couple_id", coupleId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("mood_status")
          .select("*")
          .eq("couple_id", coupleId)
          .order("updated_at", { ascending: false }),
        supabase
          .from("notifications")
          .select("*")
          .is("dismissed_at", null)
          .order("created_at", { ascending: false })
          .limit(16),
        supabase.from("creation_spaces").select("*").eq("couple_id", coupleId).maybeSingle(),
        supabase
          .from("creation_actions")
          .select("*")
          .eq("couple_id", coupleId)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("pet_memories")
          .select("*")
          .eq("couple_id", coupleId)
          .is("archived_at", null)
          .or(`memory_scope.eq.core,expires_at.gt.${new Date().toISOString()}`)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("couple_footprints")
          .select("*")
          .eq("couple_id", coupleId)
          .is("deleted_at", null)
          .order("visited_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(12),
        supabase.rpc("list_letters", {}),
      ]);

      const mediaRows = ((mediaFilesResult.data as MediaFile[] | null) ?? []);
      const signedMediaUrlById = new Map(
        dataRef.current.mediaFiles
          .filter((file) => file.storage_path)
          .map((file) => [file.id, { path: file.storage_path, signedUrl: file.signedUrl ?? null }] as const)
      );
      const mediaFiles = mediaRows.map((file) => {
        const existingMediaUrl = signedMediaUrlById.get(file.id);
        return { ...file, signedUrl: existingMediaUrl?.path === file.storage_path ? existingMediaUrl.signedUrl : null };
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      const contentData: CoupleDashboard = {
        ...baseData,
        checkins: checkinsResult.data ?? [],
        messages: (messagesResult.data as Message[] | null) ?? [],
        events: eventsResult.data ?? [],
        letters: (lettersResult.data as LetterPreview[] | null) ?? [],
        mediaFiles,
        moodStatuses: moodStatusesResult.data ?? [],
        notifications: notificationsResult.data ?? [],
        creationSpace: (creationSpaceResult.data as CreationSpace | null) ?? null,
        creationActions: (creationActionsResult.data as CreationAction[] | null) ?? [],
        petMemories: (petMemoriesResult.data as PetMemory[] | null) ?? [],
        footprints: (footprintsResult.data as CoupleFootprint[] | null) ?? [],
      };
      saveData(contentData);
      writeCachedDashboard(userId, contentData);

      const avatarProfiles = [profileResult.data, ...coupleMembers.map((member) => member.profile).filter(Boolean)] as Profile[];
      const avatarUrlByPath = new Map<string, string | null>();
      await Promise.all(
        avatarProfiles
          .filter((avatarProfile) => avatarProfile.avatar_url)
          .map(async (avatarProfile) => {
            const path = avatarProfile.avatar_url!;
            if (!avatarUrlByPath.has(path)) {
              avatarUrlByPath.set(path, await createSignedUrl(storageBuckets.avatars, path));
            }
          })
      );

      const hydratedProfile = profileResult.data
        ? { ...profileResult.data, avatar_signed_url: profileResult.data.avatar_url ? avatarUrlByPath.get(profileResult.data.avatar_url) ?? null : null }
        : null;
      const hydratedCouple = couple
        ? {
            ...couple,
            couple_members: coupleMembers.map((member) => ({
              ...member,
              profile: member.profile
                ? {
                    ...member.profile,
                    avatar_signed_url: member.profile.avatar_url ? avatarUrlByPath.get(member.profile.avatar_url) ?? null : null,
                  }
                : member.profile,
            })),
          }
        : null;
      const hydratedMediaFiles = await Promise.all(
        mediaRows.map(async (file) => {
          const existingMediaUrl = signedMediaUrlById.get(file.id);
          const existingSignedUrl = existingMediaUrl?.path === file.storage_path ? existingMediaUrl.signedUrl : null;
          return {
            ...file,
            signedUrl: existingSignedUrl ?? await createSignedUrl(storageBuckets.coupleMedia, file.storage_path),
          };
        })
      );

      if (requestId !== requestIdRef.current) {
        return;
      }

      saveData((current) => {
        if (current.profile?.id !== userId) {
          return current;
        }
        const hydratedData = {
          ...current,
          profile: hydratedProfile,
          couple: hydratedCouple,
          mediaFiles: hydratedMediaFiles,
        };
        writeCachedDashboard(userId, hydratedData);
        return hydratedData;
      });
      })().catch((error) => {
        console.warn("Couple dashboard background load failed:", error);
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      console.warn("Couple dashboard initial load failed:", error);
      setLoadedUserId(userId);
      setLoading(false);
      setRefreshing(false);
    }
  }, [saveData, userId]);

  useEffect(() => {
    load({ initial: true });
  }, [load]);

  const refreshNotifications = useCallback(async () => {
    if (!userId || !data.couple?.id) {
      return;
    }

    const { data: notifications } = await supabase
      .from("notifications")
      .select("*")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(16);

    saveData((current) => {
      if (loadedUserId !== userId) {
        return current;
      }
      const nextData = {
        ...current,
        notifications: notifications ?? current.notifications,
      };
      writeCachedDashboard(userId, nextData);
      return nextData;
    });
  }, [data.couple?.id, loadedUserId, saveData, userId]);

  useEffect(() => {
    if (!data.couple?.id || loadedUserId !== userId) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void load();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [data.couple?.id, load, loadedUserId, userId]);

  useEffect(() => {
    if (!data.couple?.id || !userId || loadedUserId !== userId) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void refreshNotifications();
    }, 2500);

    return () => clearInterval(intervalId);
  }, [data.couple?.id, loadedUserId, refreshNotifications, userId]);

  useEffect(() => {
    if (!data.couple?.id || !userId || loadedUserId !== userId) {
      return undefined;
    }

    const channel = supabase
      .channel(`notifications:${userId}:${data.couple.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refreshNotifications();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [data.couple?.id, loadedUserId, refreshNotifications, userId]);

  const currentData = loadedUserId === userId ? data : emptyDashboard;
  const currentLoading = loading || loadedUserId !== userId;

  return { data: currentData, loading: currentLoading, refreshing, reload: load };
}
