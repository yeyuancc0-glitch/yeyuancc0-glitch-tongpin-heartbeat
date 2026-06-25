import { selfHostRequest } from "./apiClient";
import type { NotificationPreference } from "@/lib/supabase/database.types";

type SelfHostPushSummary = {
  activeTokens: number;
  activeWebPushTokens: number;
  activeExpoTokens: number;
};

type PreferenceResponse = {
  preferences: NotificationPreference;
  push: SelfHostPushSummary;
};

export type SelfHostNotificationPreferenceUpdate = Partial<Pick<
  NotificationPreference,
  | "push_enabled"
  | "message_enabled"
  | "interaction_enabled"
  | "checkin_enabled"
  | "letter_enabled"
  | "calendar_enabled"
  | "quiet_hours_enabled"
>>;

export async function getSelfHostNotificationPreferences(input: { accessToken: string }) {
  return await selfHostRequest<PreferenceResponse>("/api/notification-preferences", {
    accessToken: input.accessToken,
  });
}

export async function updateSelfHostNotificationPreferences(input: {
  accessToken: string;
  update: SelfHostNotificationPreferenceUpdate;
}) {
  return await selfHostRequest<PreferenceResponse>("/api/notification-preferences", {
    method: "POST",
    accessToken: input.accessToken,
    body: input.update,
  });
}

export async function registerSelfHostWebPushSubscription(input: {
  accessToken: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}) {
  return await selfHostRequest<{ push: SelfHostPushSummary }>("/api/push-tokens/web", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function registerSelfHostExpoPushToken(input: {
  accessToken: string;
  token: string;
  platform: "ios" | "android" | "web" | "unknown";
  deviceId?: string | null;
  appVersion?: string | null;
}) {
  return await selfHostRequest<{ push: SelfHostPushSummary }>("/api/push-tokens/expo", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      token: input.token,
      platform: input.platform,
      deviceId: input.deviceId ?? null,
      appVersion: input.appVersion ?? null,
    },
  });
}

export async function disableSelfHostPushToken(input: {
  accessToken: string;
  token: string;
}) {
  return await selfHostRequest<{ push: SelfHostPushSummary }>("/api/push-tokens/disable", {
    method: "POST",
    accessToken: input.accessToken,
    body: { token: input.token },
  });
}
