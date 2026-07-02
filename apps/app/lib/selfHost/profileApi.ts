import { selfHostRequest } from "./apiClient";
import type { Profile } from "@/lib/supabase/database.types";

type SelfHostProfile = {
  id: string;
  displayName: string | null;
  avatarStoragePath: string | null;
  avatarThumbnailStoragePath: string | null;
  accountStatus: Profile["account_status"];
  deletionRequestedAt: string | null;
  birthday: string | null;
  createdAt: string;
  updatedAt: string;
};

type SelfHostActiveCouple = {
  id: string;
  relationshipStartedAt: string | null;
  createdAt: string;
  endedAt: string | null;
  status: "active" | "ended";
};

type SelfHostAvatarUpload = {
  id: string;
  userId: string;
  storagePath: string;
  thumbnailStoragePath: string | null;
  mimeType: string;
  sizeBytes: number;
  thumbnailMimeType: string | null;
  thumbnailSizeBytes: number | null;
  uploadStatus: "pending" | "ready" | "deleted";
  completedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SignedUpload = {
  method: "PUT";
  url: string;
  expiresInSeconds: number;
  requiredHeaders: Record<string, string>;
};

type CreateAvatarUploadResponse = {
  avatarUpload: SelfHostAvatarUpload;
  upload: SignedUpload;
  thumbnailUpload: SignedUpload | null;
};

function mapSelfHostProfile(profile: SelfHostProfile): Profile {
  return {
    id: profile.id,
    display_name: profile.displayName,
    avatar_url: profile.avatarStoragePath,
    avatar_thumbnail_url: profile.avatarThumbnailStoragePath,
    avatar_signed_url: null,
    avatar_thumb_signed_url: null,
    birthdate: profile.birthday,
    account_status: profile.accountStatus,
    deletion_requested_at: profile.deletionRequestedAt,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  };
}

async function putSignedUpload(upload: SignedUpload, file: File) {
  const response = await fetch(upload.url, {
    method: upload.method,
    headers: browserSafeUploadHeaders(upload.requiredHeaders),
    body: file,
  });
  if (!response.ok) {
    throw new Error(`上传文件失败：${response.status}`);
  }
}

function browserSafeUploadHeaders(headers: Record<string, string>) {
  const safeHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "content-length") {
      continue;
    }
    safeHeaders[key] = value;
  }
  return safeHeaders;
}

export async function getSelfHostProfile(accessToken: string) {
  const response = await selfHostRequest<{
    profile: SelfHostProfile;
    activeCouple: SelfHostActiveCouple | null;
  }>("/api/profile", { accessToken });
  return {
    profile: mapSelfHostProfile(response.profile),
    activeCouple: response.activeCouple,
  };
}

export async function uploadSelfHostAvatar(input: {
  accessToken: string;
  file: File;
  thumbnailFile?: File | null;
}) {
  const created = await selfHostRequest<CreateAvatarUploadResponse>("/api/profile/avatar/uploads", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      mimeType: input.file.type,
      sizeBytes: input.file.size,
      thumbnailMimeType: input.thumbnailFile?.type ?? null,
      thumbnailSizeBytes: input.thumbnailFile?.size ?? null,
    },
  });

  await putSignedUpload(created.upload, input.file);
  if (created.thumbnailUpload && input.thumbnailFile) {
    await putSignedUpload(created.thumbnailUpload, input.thumbnailFile);
  }

  const completed = await selfHostRequest<{
    avatarUpload: SelfHostAvatarUpload;
    profile: SelfHostProfile;
  }>("/api/profile/avatar/uploads/complete", {
    method: "POST",
    accessToken: input.accessToken,
    body: { avatarUploadId: created.avatarUpload.id },
  });
  const profile = mapSelfHostProfile(completed.profile);
  const avatarSignedUrl = profile.avatar_url
    ? await createSelfHostAvatarReadUrl({
        accessToken: input.accessToken,
        userId: profile.id,
        variant: "original",
      }).catch((error) => {
        console.warn("Self-host avatar uploaded read-url failed:", error);
        return null;
      })
    : null;
  const avatarThumbSignedUrl = profile.avatar_thumbnail_url
    ? await createSelfHostAvatarReadUrl({
        accessToken: input.accessToken,
        userId: profile.id,
        variant: "thumbnail",
      }).catch((error) => {
        console.warn("Self-host avatar uploaded thumbnail read-url failed:", error);
        return null;
      })
    : null;
  return {
    ...profile,
    avatar_signed_url: avatarSignedUrl,
    avatar_thumb_signed_url: avatarThumbSignedUrl,
  };
}

export async function createSelfHostAvatarReadUrl(input: {
  accessToken: string;
  userId?: string | null;
  variant?: "original" | "thumbnail";
}) {
  const response = await selfHostRequest<{
    profile: SelfHostProfile;
    read: {
      url: string;
      expiresInSeconds: number;
    };
  }>("/api/profile/avatar/read-url", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      userId: input.userId,
      variant: input.variant,
    },
  });
  return response.read.url;
}

export async function deleteSelfHostAvatar(accessToken: string) {
  const response = await selfHostRequest<{ profile: SelfHostProfile }>("/api/profile/avatar/delete", {
    method: "POST",
    accessToken,
  });
  return mapSelfHostProfile(response.profile);
}

export async function updateSelfHostProfile(input: {
  accessToken: string;
  displayName: string;
  birthday?: string | null;
  isLunarBirthdate?: boolean;
  avatarStoragePath?: string | null;
  avatarThumbnailStoragePath?: string | null;
}) {
  const body: Record<string, string | boolean | null> = {
    displayName: input.displayName,
  };
  if (Object.hasOwn(input, "birthday")) {
    body.birthday = input.birthday ?? null;
  }
  if (Object.hasOwn(input, "isLunarBirthdate")) {
    body.isLunarBirthdate = input.isLunarBirthdate ?? false;
  }
  if (Object.hasOwn(input, "avatarStoragePath")) {
    body.avatarStoragePath = input.avatarStoragePath ?? null;
  }
  if (Object.hasOwn(input, "avatarThumbnailStoragePath")) {
    body.avatarThumbnailStoragePath = input.avatarThumbnailStoragePath ?? null;
  }

  const response = await selfHostRequest<{ profile: SelfHostProfile }>("/api/profile", {
    method: "POST",
    accessToken: input.accessToken,
    body,
  });
  return mapSelfHostProfile(response.profile);
}

export async function updateSelfHostActiveCoupleDates(input: {
  accessToken: string;
  relationshipStartedAt?: string | null;
}) {
  return selfHostRequest<{ couple: SelfHostActiveCouple | null }>("/api/couples/active/dates", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      relationshipStartedAt: input.relationshipStartedAt ?? null,
    },
  });
}
