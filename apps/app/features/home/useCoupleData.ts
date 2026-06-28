import { useCallback, useEffect, useRef, useState } from "react";

import { getSelfHostDashboard } from "@/lib/selfHost/dashboardApi";
import { listSelfHostNotifications, subscribeSelfHostNotificationEvents } from "@/lib/selfHost/notificationApi";
import type {
  Checkin,
  DashboardProfile,
  MediaFile,
  Profile,
} from "@/lib/supabase/database.types";
import {
  createAvatarUrlMap,
  withHydratedProfileAvatar,
} from "@/features/home/homeAvatarHydration";
import { readCachedDashboard, writeCachedDashboard } from "@/features/home/homeDashboardCache";
import { createEmptyDashboard, type CoupleDashboard } from "@/features/home/homeDashboardTypes";
import { hydrateMediaFile } from "@/features/home/homeMediaHydration";
import { notificationsMatch } from "@/features/home/homeNotificationRefresh";

const emptyDashboard = createEmptyDashboard();
const notificationFallbackRefreshMs = 90000;
const dashboardFallbackRefreshMs = 120000;
const maxDashboardFallbackRefreshMs = 10 * 60 * 1000;
const notificationRealtimeDebounceMs = 1200;
const dashboardListLimit = 1000;

function isSameCheckinSlot(left: Checkin, right: Checkin) {
  return (
    left.id === right.id ||
    (left.couple_id === right.couple_id &&
      left.user_id === right.user_id &&
      left.checkin_date === right.checkin_date)
  );
}

function mergeCheckinIntoList(checkins: Checkin[], checkin: Checkin) {
  let replaced = false;
  const merged = checkins.map((item) => {
    if (isSameCheckinSlot(item, checkin)) {
      replaced = true;
      return checkin;
    }
    return item;
  });
  return replaced ? merged : [checkin, ...checkins];
}

function mergeMediaFileIntoList(mediaFiles: MediaFile[], mediaFile: MediaFile) {
  let replaced = false;
  const merged = mediaFiles.map((item) => {
    if (item.id === mediaFile.id) {
      replaced = true;
      return mediaFile;
    }
    return item;
  });
  return replaced ? merged : [mediaFile, ...mediaFiles];
}

function mergeProfileAvatarUrls(current: DashboardProfile | null | undefined, nextProfile: DashboardProfile) {
  if (
    current?.avatar_url === nextProfile.avatar_url &&
    current?.avatar_thumbnail_url === nextProfile.avatar_thumbnail_url
  ) {
    return {
      ...nextProfile,
      avatar_signed_url: nextProfile.avatar_signed_url ?? current.avatar_signed_url ?? null,
      avatar_thumb_signed_url: nextProfile.avatar_thumb_signed_url ?? current.avatar_thumb_signed_url ?? current.avatar_signed_url ?? null,
    };
  }
  return nextProfile;
}

function mergeDashboardProfile(currentProfile: DashboardProfile | null | undefined, nextProfile: DashboardProfile) {
  const mergedAvatarProfile = mergeProfileAvatarUrls(currentProfile, nextProfile);
  return currentProfile ? { ...currentProfile, ...mergedAvatarProfile } : mergedAvatarProfile;
}

export function useCoupleData(userId?: string, accessToken?: string | null) {
  const requestIdRef = useRef(0);
  const loadingRequestRef = useRef(false);
  const notificationRefreshInFlightRef = useRef(false);
  const notificationRealtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dashboardRefreshDelayRef = useRef(dashboardFallbackRefreshMs);
  const [data, setData] = useState<CoupleDashboard>(() => createEmptyDashboard());
  const dataRef = useRef<CoupleDashboard>(createEmptyDashboard());
  const [loadedUserId, setLoadedUserId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const saveData = useCallback((nextData: CoupleDashboard | ((current: CoupleDashboard) => CoupleDashboard)) => {
    const resolved = typeof nextData === "function" ? nextData(dataRef.current) : nextData;
    dataRef.current = resolved;
    setData(resolved);
  }, []);

  const load = useCallback(async (options: { initial?: boolean } = {}) => {
    if (!options.initial && loadingRequestRef.current) {
      return;
    }
    const requestId = ++requestIdRef.current;
    loadingRequestRef.current = true;

    if (!userId) {
      saveData(createEmptyDashboard());
      setLoadedUserId(undefined);
      setLoadError(null);
      setLoading(false);
      setRefreshing(false);
      loadingRequestRef.current = false;
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
      setLoadError(null);
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      if (!accessToken) {
        saveData(createEmptyDashboard());
        setLoadedUserId(userId);
        setLoadError(null);
        setLoading(false);
        setRefreshing(false);
        loadingRequestRef.current = false;
        return;
      }

      const dashboard = await getSelfHostDashboard({ accessToken, currentUserId: userId });
      const avatarProfiles = [
        dashboard.profile,
        ...(dashboard.couple?.couple_members.map((member) => member.profile).filter(Boolean) ?? []),
      ].filter((avatarProfile): avatarProfile is DashboardProfile => Boolean(avatarProfile));
      const avatarUrlByPath = avatarProfiles.some((avatarProfile) => Boolean(avatarProfile.avatar_url))
        ? await createAvatarUrlMap(avatarProfiles, accessToken)
        : null;
      const hydratedProfile = dashboard.profile && avatarUrlByPath ? withHydratedProfileAvatar(dashboard.profile, avatarUrlByPath) : dashboard.profile;
      const hydratedCouple = dashboard.couple && avatarUrlByPath
        ? {
            ...dashboard.couple,
            couple_members: dashboard.couple.couple_members.map((member) => ({
              ...member,
              profile: member.profile ? withHydratedProfileAvatar(member.profile, avatarUrlByPath) : member.profile,
            })),
          }
        : dashboard.couple;
      const signedMediaUrlById = new Map(
        dataRef.current.mediaFiles
          .filter((file) => file.storage_path)
          .map((file) => [
            file.id,
            {
              path: file.storage_path,
              signedUrl: file.signedUrl ?? null,
              thumbnailSignedUrl: file.thumbnailSignedUrl ?? null,
            },
          ] as const)
      );
      const mediaFiles = await Promise.all(
        dashboard.mediaFiles.map((file) => hydrateMediaFile(file, signedMediaUrlById, accessToken))
      );
      const nextData: CoupleDashboard = {
        ...createEmptyDashboard(),
        profile: hydratedProfile,
        couple: hydratedCouple,
        pendingInvites: dashboard.pendingInvites,
        checkins: dashboard.checkins,
        events: dashboard.events,
        footprints: dashboard.footprints,
        letters: dashboard.letters,
        messages: dashboard.messages,
        mediaFiles,
        moodStatuses: dashboard.moodStatuses,
        notifications: dashboard.notifications,
        creationSpace: dashboard.creationSpace,
        creationActions: dashboard.creationActions,
        petMemories: dashboard.petMemories,
      };
      if (requestId !== requestIdRef.current) {
        return;
      }
      saveData(nextData);
      writeCachedDashboard(userId, nextData);
      setLoadedUserId(userId);
      setLoadError(null);
      setLoading(false);
      setRefreshing(false);
      dashboardRefreshDelayRef.current = dashboardFallbackRefreshMs;
      loadingRequestRef.current = false;
      return;
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      console.warn("Couple dashboard initial load failed:", error);
      setLoadedUserId(userId);
      setLoadError(error instanceof Error ? error.message : "首页数据加载失败，请稍后重试。");
      setLoading(false);
      setRefreshing(false);
      dashboardRefreshDelayRef.current = Math.min(dashboardRefreshDelayRef.current * 2, maxDashboardFallbackRefreshMs);
    } finally {
      if (requestId === requestIdRef.current || !options.initial) {
        loadingRequestRef.current = false;
      }
    }
  }, [accessToken, saveData, userId]);

  useEffect(() => {
    load({ initial: true });
  }, [load]);

  const refreshNotifications = useCallback(async () => {
    if (!userId || !data.couple?.id) {
      return;
    }
    if (notificationRefreshInFlightRef.current) {
      return;
    }
    notificationRefreshInFlightRef.current = true;

    try {
      if (!accessToken) {
        return;
      }
      const notifications = await listSelfHostNotifications({
        accessToken,
        coupleId: data.couple.id,
        limit: dashboardListLimit,
      });

      saveData((current) => {
        if (loadedUserId !== userId) {
          return current;
        }
        if (notificationsMatch(current.notifications, notifications)) {
          return current;
        }
        const nextData = {
          ...current,
          notifications,
        };
        writeCachedDashboard(userId, nextData);
        return nextData;
      });
    } finally {
      notificationRefreshInFlightRef.current = false;
    }
  }, [accessToken, data.couple?.id, loadedUserId, saveData, userId]);

  useEffect(() => {
    if (!data.couple?.id || !userId || loadedUserId !== userId || !accessToken) {
      return undefined;
    }

    const unsubscribe = subscribeSelfHostNotificationEvents({
      accessToken,
      coupleId: data.couple.id,
      onNotification: () => {
        if (notificationRealtimeTimerRef.current) {
          clearTimeout(notificationRealtimeTimerRef.current);
        }
        notificationRealtimeTimerRef.current = setTimeout(() => {
          notificationRealtimeTimerRef.current = null;
          void refreshNotifications();
        }, notificationRealtimeDebounceMs);
      },
      onError: (error) => {
        console.warn("Self-host notification stream failed:", error.message);
      },
    });

    return () => {
      if (notificationRealtimeTimerRef.current) {
        clearTimeout(notificationRealtimeTimerRef.current);
        notificationRealtimeTimerRef.current = null;
      }
      unsubscribe();
    };
  }, [accessToken, data.couple?.id, loadedUserId, refreshNotifications, userId]);

  useEffect(() => {
    if (!data.couple?.id || loadedUserId !== userId) {
      return undefined;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) {
        return;
      }
      timeoutId = setTimeout(() => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") {
          schedule();
          return;
        }
        const beforeDelay = dashboardRefreshDelayRef.current;
        void load().finally(() => {
          if (dashboardRefreshDelayRef.current === beforeDelay) {
            dashboardRefreshDelayRef.current = dashboardFallbackRefreshMs;
          }
          schedule();
        });
      }, dashboardRefreshDelayRef.current);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [data.couple?.id, load, loadedUserId, userId]);

  useEffect(() => {
    if (!data.couple?.id || !userId || loadedUserId !== userId) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      void refreshNotifications();
    }, notificationFallbackRefreshMs);

    return () => clearInterval(intervalId);
  }, [data.couple?.id, loadedUserId, refreshNotifications, userId]);

  const mergeCheckin = useCallback((checkin: Checkin) => {
    if (!userId || loadedUserId !== userId) {
      return;
    }
    saveData((current) => {
      if (!current.couple?.id || current.couple.id !== checkin.couple_id) {
        return current;
      }
      const nextData = {
        ...current,
        checkins: mergeCheckinIntoList(current.checkins, checkin),
      };
      writeCachedDashboard(userId, nextData);
      return nextData;
    });
  }, [loadedUserId, saveData, userId]);

  const mergeMediaFile = useCallback((mediaFile: MediaFile) => {
    if (!userId || loadedUserId !== userId) {
      return;
    }
    saveData((current) => {
      if (!current.couple?.id || current.couple.id !== mediaFile.couple_id) {
        return current;
      }
      const nextData = {
        ...current,
        mediaFiles: mergeMediaFileIntoList(current.mediaFiles, mediaFile),
      };
      writeCachedDashboard(userId, nextData);
      return nextData;
    });
  }, [loadedUserId, saveData, userId]);

  const mergeProfile = useCallback((profile: Profile | DashboardProfile) => {
    if (!userId || loadedUserId !== userId || profile.id !== userId) {
      return;
    }
    saveData((current) => {
      const nextProfile = mergeDashboardProfile(current.profile, profile);
      const nextCouple = current.couple
        ? {
            ...current.couple,
            couple_members: current.couple.couple_members.map((member) => (
              member.user_id === profile.id
                ? {
                    ...member,
                    profile: mergeDashboardProfile(member.profile, profile),
                  }
                : member
            )),
          }
        : current.couple;
      const nextData = {
        ...current,
        profile: nextProfile,
        couple: nextCouple,
      };
      writeCachedDashboard(userId, nextData);
      return nextData;
    });
  }, [loadedUserId, saveData, userId]);

  const currentData = loadedUserId === userId ? data : emptyDashboard;
  const currentLoading = loading || loadedUserId !== userId;
  const currentLoadError = loadedUserId === userId ? loadError : null;

  return { data: currentData, loading: currentLoading, loadError: currentLoadError, refreshing, reload: load, mergeCheckin, mergeMediaFile, mergeProfile };
}
