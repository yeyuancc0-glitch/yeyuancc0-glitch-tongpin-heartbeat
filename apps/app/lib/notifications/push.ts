import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase/client";

type PushRegistrationResult =
  | { status: "registered"; token: string }
  | { status: "unsupported" | "denied" | "missing_project_id" | "error"; message?: string };

const notificationChannelId = "couple-updates";
let latestExpoPushToken: string | null = null;

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (Platform.OS === "web") {
    return { status: "unsupported", message: "Web MVP 不注册系统推送。" };
  }

  if (!Device.isDevice) {
    return { status: "unsupported", message: "模拟器不注册远程推送。" };
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    return { status: "missing_project_id", message: "缺少 Expo EAS projectId，无法生成 Expo Push Token。" };
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(notificationChannelId, {
        name: "情侣动态",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: "default",
        vibrationPattern: [0, 220, 120, 220],
      });
    }

    const permission = await Notifications.getPermissionsAsync();
    const finalPermission = permission.granted ? permission : await Notifications.requestPermissionsAsync();
    if (!finalPermission.granted) {
      return { status: "denied", message: "系统通知权限未开启。" };
    }

    const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
    latestExpoPushToken = pushToken.data;
    const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown";

    const { error } = await supabase.rpc("register_push_token", {
      push_token: pushToken.data,
      push_platform: platform,
      push_device_id: await getDeviceId(),
      push_app_version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null,
    });
    if (error) {
      return { status: "error", message: error.message };
    }

    return { status: "registered", token: pushToken.data };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "推送注册失败。" };
  }
}

export async function disableCurrentPushToken() {
  if (!latestExpoPushToken) {
    return;
  }

  await supabase.rpc("disable_current_push_token", {
    push_token: latestExpoPushToken,
  });
  latestExpoPushToken = null;
}

export function subscribePushTokenRefresh() {
  if (Platform.OS === "web") {
    return { remove: () => {} };
  }

  return Notifications.addPushTokenListener((token) => {
    const tokenValue = token.data;
    if (!tokenValue) {
      return;
    }
    latestExpoPushToken = tokenValue;
    const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown";
    void supabase.rpc("register_push_token", {
      push_token: tokenValue,
      push_platform: platform,
      push_device_id: null,
      push_app_version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null,
    });
  });
}

function getExpoProjectId() {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
}

async function getDeviceId() {
  try {
    if (Platform.OS === "ios") {
      return await Application.getIosIdForVendorAsync();
    }
    if (Platform.OS === "android") {
      return Application.getAndroidId();
    }
  } catch {
    return null;
  }
  return null;
}
