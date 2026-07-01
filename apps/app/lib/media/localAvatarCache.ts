import type { DashboardProfile } from "@/lib/supabase/database.types";
import type { CoupleDashboard } from "@/features/home/homeDashboardTypes";

const avatarCachePrefix = "avatar-image-cache:v1:";
const avatarCacheIndexPrefix = "avatar-image-cache-index:v1:";
const maxCachedAvatarBytes = 360 * 1024;

function avatarCacheStoragePath(profile: DashboardProfile) {
  return profile.avatar_thumbnail_url ?? null;
}

function avatarCacheKey(userId: string, storagePath: string) {
  return `${avatarCachePrefix}${userId}:${encodeURIComponent(storagePath)}`;
}

function avatarCacheIndexKey(userId: string) {
  return `${avatarCacheIndexPrefix}${userId}`;
}

function isUsableStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readCachedAvatarDataUrl(profile: DashboardProfile) {
  const storagePath = avatarCacheStoragePath(profile);
  if (!storagePath || !isUsableStorage()) {
    return null;
  }
  try {
    const value = window.localStorage.getItem(avatarCacheKey(profile.id, storagePath));
    return value?.startsWith("data:image/") ? value : null;
  } catch {
    return null;
  }
}

function rememberAvatarCacheKey(userId: string, key: string) {
  if (!isUsableStorage()) {
    return;
  }
  try {
    const indexKey = avatarCacheIndexKey(userId);
    const current = JSON.parse(window.localStorage.getItem(indexKey) || "[]") as string[];
    const next = [key, ...current.filter((item) => item !== key)].slice(0, 6);
    current.forEach((item) => {
      if (!next.includes(item)) {
        window.localStorage.removeItem(item);
      }
    });
    window.localStorage.setItem(indexKey, JSON.stringify(next));
  } catch {
    // Avatar cache is a performance hint; quota/private-mode failures should not affect rendering.
  }
}

function writeCachedAvatarDataUrl(profile: DashboardProfile, dataUrl: string) {
  const storagePath = avatarCacheStoragePath(profile);
  if (!storagePath || !dataUrl.startsWith("data:image/") || !isUsableStorage()) {
    return;
  }
  try {
    const key = avatarCacheKey(profile.id, storagePath);
    window.localStorage.setItem(key, dataUrl);
    rememberAvatarCacheKey(profile.id, key);
  } catch {
    // Avatar cache is best-effort.
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function fetchAvatarDataUrl(profile: DashboardProfile) {
  if (profile.avatar_thumb_data_url?.startsWith("data:image/")) {
    writeCachedAvatarDataUrl(profile, profile.avatar_thumb_data_url);
    return profile.avatar_thumb_data_url;
  }
  const sourceUrl = profile.avatar_thumb_signed_url;
  if (!sourceUrl || sourceUrl.startsWith("data:image/")) {
    return sourceUrl ?? null;
  }
  try {
    const response = await fetch(sourceUrl, { cache: "force-cache" });
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size <= 0 || blob.size > maxCachedAvatarBytes) {
      return null;
    }
    const dataUrl = await blobToDataUrl(blob);
    if (dataUrl) {
      writeCachedAvatarDataUrl(profile, dataUrl);
    }
    return dataUrl;
  } catch {
    return null;
  }
}

function mapDashboardProfiles(
  dashboard: CoupleDashboard,
  mapper: (profile: DashboardProfile) => DashboardProfile,
): CoupleDashboard {
  return {
    ...dashboard,
    profile: dashboard.profile ? mapper(dashboard.profile) : dashboard.profile,
    couple: dashboard.couple
      ? {
          ...dashboard.couple,
          couple_members: dashboard.couple.couple_members.map((member) => ({
            ...member,
            profile: member.profile ? mapper(member.profile) : member.profile,
          })),
        }
      : dashboard.couple,
  };
}

function dashboardAvatarProfiles(dashboard: CoupleDashboard) {
  return [
    dashboard.profile,
    ...(dashboard.couple?.couple_members.map((member) => member.profile) ?? []),
  ].filter((profile): profile is DashboardProfile => Boolean(profile));
}

function profileNeedsAvatarImage(profile: DashboardProfile) {
  return Boolean(profile.avatar_url || profile.avatar_thumbnail_url);
}

function profileHasReadyAvatarImage(profile: DashboardProfile) {
  if (!profileNeedsAvatarImage(profile)) {
    return true;
  }
  return Boolean(
    profile.avatar_thumb_signed_url?.startsWith("data:image/") ||
      profile.avatar_thumb_data_url?.startsWith("data:image/"),
  );
}

export function hasReadyDashboardAvatarImages(dashboard: CoupleDashboard) {
  return dashboardAvatarProfiles(dashboard).every(profileHasReadyAvatarImage);
}

export function withCachedDashboardAvatarImages(dashboard: CoupleDashboard): CoupleDashboard {
  return mapDashboardProfiles(dashboard, (profile) => {
    if (profile.avatar_thumb_data_url?.startsWith("data:image/")) {
      writeCachedAvatarDataUrl(profile, profile.avatar_thumb_data_url);
      return {
        ...profile,
        avatar_thumb_signed_url: profile.avatar_thumb_data_url,
      };
    }
    const cachedDataUrl = readCachedAvatarDataUrl(profile);
    return cachedDataUrl
      ? {
          ...profile,
          avatar_thumb_signed_url: cachedDataUrl,
        }
      : profile;
  });
}

export async function cacheDashboardAvatarImages(dashboard: CoupleDashboard, timeoutMs: number) {
  const profiles = dashboardAvatarProfiles(dashboard).filter(profileNeedsAvatarImage);
  if (!profiles.length) {
    return dashboard;
  }

  const hydrate = Promise.all(
    profiles.map(async (profile) => [profile.id, await fetchAvatarDataUrl(profile)] as const),
  ).then((entries) => {
    const dataUrlByUserId = new Map(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
    if (!dataUrlByUserId.size) {
      return dashboard;
    }
    return mapDashboardProfiles(dashboard, (profile) => {
      const dataUrl = dataUrlByUserId.get(profile.id);
      return dataUrl
        ? {
            ...profile,
            avatar_thumb_signed_url: dataUrl,
          }
        : profile;
    });
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    hydrate,
    new Promise<CoupleDashboard>((resolve) => {
      timer = setTimeout(() => resolve(dashboard), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}
