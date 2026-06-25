import type { ActiveCouple, DashboardProfile } from "@/lib/supabase/database.types";
import { createSelfHostAvatarReadUrl } from "@/lib/selfHost/profileApi";

export type AvatarUrlPair = { signedUrl: string | null; thumbSignedUrl: string | null };

export async function createAvatarUrlMap(profiles: DashboardProfile[], accessToken?: string | null) {
  const avatarPathByOriginalPath = new Map<string, { originalPath: string; thumbnailPath: string | null; userId: string }>();
  profiles.forEach((profile) => {
    if (profile.avatar_url && !avatarPathByOriginalPath.has(profile.avatar_url)) {
      avatarPathByOriginalPath.set(profile.avatar_url, {
        originalPath: profile.avatar_url,
        thumbnailPath: profile.avatar_thumbnail_url ?? null,
        userId: profile.id,
      });
    }
  });

  const avatarUrlByPath = new Map<string, AvatarUrlPair>();
  await Promise.all(
    Array.from(avatarPathByOriginalPath.values()).map(async ({ originalPath, thumbnailPath, userId }) => {
      const thumbSignedUrl = accessToken
        ? await createSelfHostAvatarReadUrl({
            accessToken,
            userId,
            variant: thumbnailPath ? "thumbnail" : "original",
          }).catch((error) => {
            console.warn("Self-host avatar hydration failed:", error);
            return null;
          })
        : null;
      avatarUrlByPath.set(originalPath, {
        signedUrl: thumbSignedUrl,
        thumbSignedUrl,
      });
    })
  );
  return avatarUrlByPath;
}

function avatarUrlsForPath(avatarUrlByPath: Map<string, AvatarUrlPair>, path?: string | null) {
  return path ? avatarUrlByPath.get(path) ?? { signedUrl: null, thumbSignedUrl: null } : { signedUrl: null, thumbSignedUrl: null };
}

export function withHydratedProfileAvatar(profile: DashboardProfile, avatarUrlByPath: Map<string, AvatarUrlPair>): DashboardProfile {
  const urls = avatarUrlsForPath(avatarUrlByPath, profile.avatar_url);
  return {
    ...profile,
    avatar_signed_url: urls.signedUrl,
    avatar_thumb_signed_url: urls.thumbSignedUrl,
  };
}

export function profileAvatarHydrationMatches(current?: DashboardProfile | null, next?: DashboardProfile | null) {
  return Boolean(
    current &&
      next &&
      current.avatar_url === next.avatar_url &&
      current.avatar_thumbnail_url === next.avatar_thumbnail_url &&
      current.avatar_signed_url === next.avatar_signed_url &&
      current.avatar_thumb_signed_url === next.avatar_thumb_signed_url
  );
}

export function coupleAvatarHydrationMatches(current?: ActiveCouple | null, next?: ActiveCouple | null) {
  if (!current || !next || current.couple_members.length !== next.couple_members.length) {
    return current === next;
  }

  return next.couple_members.every((nextMember) => {
    const currentMember = current.couple_members.find((member) => member.user_id === nextMember.user_id);
    if (!currentMember) {
      return false;
    }
    return profileAvatarHydrationMatches(currentMember.profile, nextMember.profile);
  });
}
