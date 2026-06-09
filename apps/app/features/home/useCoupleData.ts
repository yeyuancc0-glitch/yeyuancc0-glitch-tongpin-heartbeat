import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase/client";
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
  PetMemory,
} from "@/lib/supabase/database.types";
import { prefetchImageUrls } from "@/lib/supabase/storage";
import {
  coupleAvatarHydrationMatches,
  createAvatarUrlMap,
  profileAvatarHydrationMatches,
  withHydratedProfileAvatar,
} from "@/features/home/homeAvatarHydration";
import { readCachedDashboard, writeCachedDashboard } from "@/features/home/homeDashboardCache";
import {
  activeCoupleDashboardSelect,
  calendarEventDashboardSelect,
  checkinDashboardSelect,
  creationActionDashboardSelect,
  footprintDashboardSelect,
  mediaFileDashboardSelect,
  messageDashboardSelect,
  moodStatusDashboardSelect,
  notificationDashboardSelect,
  pairInviteDashboardSelect,
  petMemoryDashboardSelect,
  profileDashboardSelect,
} from "@/features/home/homeDashboardSelects";
import { type QueryResult, queryDataOrFallback, waitForIdle } from "@/features/home/homeDashboardUtils";
import { createEmptyDashboard, type CoupleDashboard } from "@/features/home/homeDashboardTypes";
import { hydrateMediaFile, mergeHydratedMediaFiles } from "@/features/home/homeMediaHydration";
import { notificationsMatch } from "@/features/home/homeNotificationRefresh";

const emptyDashboard = createEmptyDashboard();
const homeAlbumPreviewLimit = 9;
const mediaHydrationChunkSize = 3;
const notificationFallbackRefreshMs = 90000;
const dashboardFallbackRefreshMs = 120000;
const maxDashboardFallbackRefreshMs = 10 * 60 * 1000;
const notificationRealtimeDebounceMs = 1200;

export function useCoupleData(userId?: string) {
  const requestIdRef = useRef(0);
  const loadingRequestRef = useRef(false);
  const notificationRefreshInFlightRef = useRef(false);
  const notificationRealtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dashboardRefreshDelayRef = useRef(dashboardFallbackRefreshMs);
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
    if (!options.initial && loadingRequestRef.current) {
      return;
    }
    const requestId = ++requestIdRef.current;
    loadingRequestRef.current = true;

    if (!userId) {
      saveData(createEmptyDashboard());
      setLoadedUserId(undefined);
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
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [profileResult, coupleResult] = await Promise.all([
        supabase.from("profiles").select(profileDashboardSelect).eq("id", userId).maybeSingle(),
        supabase
          .from("couples")
          .select(activeCoupleDashboardSelect)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const currentDashboard = dataRef.current;
      if (profileResult.error || coupleResult.error) {
        console.warn("Couple dashboard base load failed:", profileResult.error?.message ?? coupleResult.error?.message);
        if (currentDashboard.profile?.id === userId) {
          saveData(currentDashboard);
          setLoadedUserId(userId);
        }
        setLoading(false);
        setRefreshing(false);
        loadingRequestRef.current = false;
        return;
      }

      const couple = coupleResult.data as ActiveCouple | null;
      const coupleMembers = couple?.couple_members ?? [];
      const coupleId = couple?.id;

      const avatarStateByUserId = new Map(
        [
          ...(currentDashboard.profile ? [currentDashboard.profile] : []),
          ...(currentDashboard.couple?.couple_members.map((member) => member.profile).filter(Boolean) ?? []),
        ]
          .filter((avatarProfile): avatarProfile is DashboardProfile => Boolean(avatarProfile))
          .map((avatarProfile) => [
            avatarProfile.id,
            {
              path: avatarProfile.avatar_url,
              signedUrl: avatarProfile.avatar_signed_url ?? null,
              thumbSignedUrl: avatarProfile.avatar_thumb_signed_url ?? null,
            },
          ] as const)
      );
      const preservedAvatarUrlsForUser = (userIdToMatch: string, avatarPath?: string | null) => {
        const existingAvatar = avatarStateByUserId.get(userIdToMatch);
        if (!existingAvatar || existingAvatar.path !== avatarPath) {
          return { signedUrl: null, thumbSignedUrl: null };
        }
        return { signedUrl: existingAvatar.signedUrl, thumbSignedUrl: existingAvatar.thumbSignedUrl };
      };
      const preservedProfileAvatarUrls = profileResult.data ? preservedAvatarUrlsForUser(profileResult.data.id, profileResult.data.avatar_url) : null;
      const profile = profileResult.data
        ? {
            ...profileResult.data,
            avatar_signed_url: preservedProfileAvatarUrls?.signedUrl ?? null,
            avatar_thumb_signed_url: preservedProfileAvatarUrls?.thumbSignedUrl ?? null,
          }
        : null;
      const coupleWithAvatarUrls = couple
        ? {
            ...couple,
            couple_members: coupleMembers.map((member) => ({
              ...member,
              profile: member.profile ? (() => {
                const preservedUrls = preservedAvatarUrlsForUser(member.user_id, member.profile.avatar_url);
                return {
                  ...member.profile,
                  avatar_signed_url: preservedUrls.signedUrl,
                  avatar_thumb_signed_url: preservedUrls.thumbSignedUrl,
                };
              })() : member.profile,
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
      dashboardRefreshDelayRef.current = dashboardFallbackRefreshMs;

      const avatarProfiles = [profileResult.data, ...coupleMembers.map((member) => member.profile).filter(Boolean)].filter(
        (avatarProfile): avatarProfile is DashboardProfile => Boolean(avatarProfile)
      );
      if (avatarProfiles.some((avatarProfile) => Boolean(avatarProfile.avatar_url))) {
        void (async () => {
          const avatarUrlByPath = await createAvatarUrlMap(avatarProfiles);
          const hydratedProfile = profileResult.data ? withHydratedProfileAvatar(profileResult.data, avatarUrlByPath) : null;
          const hydratedCouple = couple
            ? {
                ...couple,
                couple_members: coupleMembers.map((member) => ({
                  ...member,
                  profile: member.profile ? withHydratedProfileAvatar(member.profile, avatarUrlByPath) : member.profile,
                })),
              }
            : null;

          if (requestId !== requestIdRef.current) {
            return;
          }

          void prefetchImageUrls(Array.from(avatarUrlByPath.values()).map((urls) => urls.thumbSignedUrl ?? urls.signedUrl), 2);

          startTransition(() => {
            saveData((current) => {
              if (current.profile?.id !== userId) {
                return current;
              }
              if (profileAvatarHydrationMatches(current.profile, hydratedProfile) && coupleAvatarHydrationMatches(current.couple, hydratedCouple)) {
                return current;
              }
              const hydratedAvatarData = {
                ...current,
                profile: hydratedProfile,
                couple: hydratedCouple ?? current.couple,
              };
              writeCachedDashboard(userId, hydratedAvatarData);
              return hydratedAvatarData;
            });
          });
        })().catch((error) => {
          console.warn("Couple dashboard avatar hydration failed:", error);
        });
      }

      if (!coupleId) {
        const { data: pendingInvites } = await supabase
          .from("pair_invites")
          .select(pairInviteDashboardSelect)
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
        loadingRequestRef.current = false;
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
            .select(checkinDashboardSelect)
            .eq("couple_id", coupleId)
            .is("deleted_at", null)
            .order("checkin_date", { ascending: false })
            .limit(8),
          supabase
            .from("messages")
            .select(messageDashboardSelect)
            .eq("couple_id", coupleId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(12),
          supabase
            .from("calendar_events")
            .select(calendarEventDashboardSelect)
            .eq("couple_id", coupleId)
            .is("deleted_at", null)
            .order("event_date", { ascending: true })
            .limit(8),
          supabase
            .from("media_files")
            .select(mediaFileDashboardSelect)
            .eq("couple_id", coupleId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(12),
          supabase
            .from("mood_status")
            .select(moodStatusDashboardSelect)
            .eq("couple_id", coupleId)
            .order("updated_at", { ascending: false }),
          supabase
            .from("notifications")
            .select(notificationDashboardSelect)
            .is("dismissed_at", null)
            .order("created_at", { ascending: false })
            .limit(16),
          supabase.rpc("ensure_creation_space", { target_couple_id: coupleId }).maybeSingle(),
          supabase
            .from("creation_actions")
            .select(creationActionDashboardSelect)
            .eq("couple_id", coupleId)
            .order("created_at", { ascending: false })
            .limit(12),
          supabase
            .from("pet_memories")
            .select(petMemoryDashboardSelect)
            .eq("couple_id", coupleId)
            .is("archived_at", null)
            .or(`memory_scope.eq.core,expires_at.gt.${new Date().toISOString()}`)
            .order("created_at", { ascending: false })
            .limit(12),
          supabase
            .from("couple_footprints")
            .select(footprintDashboardSelect)
            .eq("couple_id", coupleId)
            .is("deleted_at", null)
            .order("visited_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(12),
          supabase.rpc("list_letters", {}),
        ]);

        const currentContent = dataRef.current;
        const mediaRows = queryDataOrFallback("media files", mediaFilesResult as QueryResult<MediaFile[]>, currentContent.mediaFiles, []);
        const signedMediaUrlById = new Map(
          currentContent.mediaFiles
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
        const mediaFiles = mediaRows.map((file) => {
          const existingMediaUrl = signedMediaUrlById.get(file.id);
          const shouldPreserve = existingMediaUrl?.path === file.storage_path;
          return {
            ...file,
            signedUrl: shouldPreserve ? existingMediaUrl.signedUrl : null,
            thumbnailSignedUrl: shouldPreserve ? existingMediaUrl.thumbnailSignedUrl : null,
          };
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        saveData((current) => {
          if (current.profile?.id !== userId) {
            return current;
          }
          const contentData: CoupleDashboard = {
            ...current,
            checkins: queryDataOrFallback("checkins", checkinsResult as QueryResult<Checkin[]>, current.checkins, []),
            messages: queryDataOrFallback("messages", messagesResult as QueryResult<Message[]>, current.messages, []),
            events: queryDataOrFallback("events", eventsResult as QueryResult<CalendarEvent[]>, current.events, []),
            letters: queryDataOrFallback("letters", lettersResult as QueryResult<LetterPreview[]>, current.letters, []),
            mediaFiles,
            moodStatuses: queryDataOrFallback("mood statuses", moodStatusesResult as QueryResult<MoodStatus[]>, current.moodStatuses, []),
            notifications: queryDataOrFallback("notifications", notificationsResult as QueryResult<Notification[]>, current.notifications, []),
            creationSpace: queryDataOrFallback("creation space", creationSpaceResult as QueryResult<CreationSpace | null>, current.creationSpace, null),
            creationActions: queryDataOrFallback("creation actions", creationActionsResult as QueryResult<CreationAction[]>, current.creationActions, []),
            petMemories: queryDataOrFallback("pet memories", petMemoriesResult as QueryResult<PetMemory[]>, current.petMemories, []),
            footprints: queryDataOrFallback("footprints", footprintsResult as QueryResult<CoupleFootprint[]>, current.footprints, []),
          };
          writeCachedDashboard(userId, contentData);
          return contentData;
        });

        const hydrateMediaBatch = async (files: MediaFile[], shouldPrefetch: boolean) => {
          const hydratedFiles = await Promise.all(files.map((file) => hydrateMediaFile(file, signedMediaUrlById)));
          if (shouldPrefetch) {
            await prefetchImageUrls(hydratedFiles.map((file) => file.thumbnailSignedUrl ?? file.signedUrl), 3);
          }
          return hydratedFiles;
        };

        const visibleMediaRows = mediaRows.slice(0, homeAlbumPreviewLimit);
        const deferredMediaRows = mediaRows.slice(homeAlbumPreviewLimit);
        const visibleHydratedMediaFiles = await hydrateMediaBatch(visibleMediaRows, true);

        if (requestId !== requestIdRef.current) {
          return;
        }

        startTransition(() => {
          saveData((current) => {
            if (current.profile?.id !== userId) {
              return current;
            }
            const nextMediaFiles = mergeHydratedMediaFiles(current.mediaFiles, visibleHydratedMediaFiles);
            if (nextMediaFiles === current.mediaFiles) {
              return current;
            }
            const hydratedData = {
              ...current,
              mediaFiles: nextMediaFiles,
            };
            writeCachedDashboard(userId, hydratedData);
            return hydratedData;
          });
        });

        for (let index = 0; index < deferredMediaRows.length; index += mediaHydrationChunkSize) {
          await waitForIdle();
          const hydratedChunk = await hydrateMediaBatch(deferredMediaRows.slice(index, index + mediaHydrationChunkSize), false);
          if (requestId !== requestIdRef.current) {
            return;
          }
          startTransition(() => {
            saveData((current) => {
              if (current.profile?.id !== userId) {
                return current;
              }
              const nextMediaFiles = mergeHydratedMediaFiles(current.mediaFiles, hydratedChunk);
              if (nextMediaFiles === current.mediaFiles) {
                return current;
              }
              const hydratedData = {
                ...current,
                mediaFiles: nextMediaFiles,
              };
              writeCachedDashboard(userId, hydratedData);
              return hydratedData;
            });
          });
        }
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
      dashboardRefreshDelayRef.current = Math.min(dashboardRefreshDelayRef.current * 2, maxDashboardFallbackRefreshMs);
    } finally {
      if (requestId === requestIdRef.current || !options.initial) {
        loadingRequestRef.current = false;
      }
    }
  }, [saveData, userId]);

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
      const { data: notifications, error } = await supabase
        .from("notifications")
        .select(notificationDashboardSelect)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(16);

      if (error) {
        console.warn("Couple dashboard notifications refresh failed:", error.message);
        return;
      }

      saveData((current) => {
        if (loadedUserId !== userId) {
          return current;
        }
        const nextNotifications = notifications ?? current.notifications;
        if (notificationsMatch(current.notifications, nextNotifications)) {
          return current;
        }
        const nextData = {
          ...current,
          notifications: nextNotifications,
        };
        writeCachedDashboard(userId, nextData);
        return nextData;
      });
    } finally {
      notificationRefreshInFlightRef.current = false;
    }
  }, [data.couple?.id, loadedUserId, saveData, userId]);

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
          if (notificationRealtimeTimerRef.current) {
            clearTimeout(notificationRealtimeTimerRef.current);
          }
          notificationRealtimeTimerRef.current = setTimeout(() => {
            notificationRealtimeTimerRef.current = null;
            void refreshNotifications();
          }, notificationRealtimeDebounceMs);
        }
      )
      .subscribe();

    return () => {
      if (notificationRealtimeTimerRef.current) {
        clearTimeout(notificationRealtimeTimerRef.current);
        notificationRealtimeTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [data.couple?.id, loadedUserId, refreshNotifications, userId]);

  const currentData = loadedUserId === userId ? data : emptyDashboard;
  const currentLoading = loading || loadedUserId !== userId;

  return { data: currentData, loading: currentLoading, refreshing, reload: load };
}
