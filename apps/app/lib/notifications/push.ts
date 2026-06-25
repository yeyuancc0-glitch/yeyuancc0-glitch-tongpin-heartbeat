import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { disableSelfHostPushToken, registerSelfHostExpoPushToken } from "@/lib/selfHost/pushApi";

type PushRegistrationResult =
  | { status: "registered"; token: string }
  | { status: "unsupported" | "denied" | "missing_project_id" | "error"; message?: string };

const notificationChannelId = "couple-updates";
const latestPushTokenStorageKey = "tongpin-latest-expo-push-token";
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

type PushAuthOptions = {
  accessToken?: string | null;
};

export async function registerForPushNotifications(options: PushAuthOptions = {}): Promise<PushRegistrationResult> {
  if (Platform.OS === "web") {
    return { status: "unsupported", message: "Web 端使用独立 Web Push 订阅，不注册原生 Expo 推送。" };
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
    setLatestExpoPushToken(pushToken.data);
    const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown";

    await registerExpoPushToken({
      accessToken: options.accessToken,
      token: pushToken.data,
      platform,
      deviceId: await getDeviceId(),
      appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null,
    });

    return { status: "registered", token: pushToken.data };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "推送注册失败。" };
  }
}

export async function disableCurrentPushToken(options: PushAuthOptions = {}) {
  const token = latestExpoPushToken ?? readPersistedExpoPushToken();
  if (!token) {
    return;
  }

  await disableExpoPushToken({ accessToken: options.accessToken, token });
  setLatestExpoPushToken(null);
}

export function subscribePushTokenRefresh(options: PushAuthOptions = {}) {
  if (Platform.OS === "web") {
    return { remove: () => {} };
  }

  return Notifications.addPushTokenListener((token) => {
    const tokenValue = token.data;
    if (!tokenValue) {
      return;
    }
    setLatestExpoPushToken(tokenValue);
    const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown";
    void registerExpoPushToken({
      accessToken: options.accessToken,
      token: tokenValue,
      platform,
      deviceId: null,
      appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null,
    });
  });
}

async function registerExpoPushToken(input: {
  accessToken?: string | null;
  token: string;
  platform: "ios" | "android" | "web" | "unknown";
  deviceId?: string | null;
  appVersion?: string | null;
}) {
  if (!input.accessToken) {
    throw new Error("登录状态已失效，请重新登录。");
  }
  await registerSelfHostExpoPushToken({
    accessToken: input.accessToken,
    token: input.token,
    platform: input.platform,
    deviceId: input.deviceId ?? null,
    appVersion: input.appVersion ?? null,
  });
}

async function disableExpoPushToken(input: {
  accessToken?: string | null;
  token: string;
}) {
  if (!input.accessToken) {
    throw new Error("登录状态已失效，请重新登录。");
  }
  await disableSelfHostPushToken({
    accessToken: input.accessToken,
    token: input.token,
  });
}

function getExpoProjectId() {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
}

function setLatestExpoPushToken(token: string | null) {
  latestExpoPushToken = token;
  if (Platform.OS === "web") {
    return;
  }
  try {
    if (token) {
      globalThis.localStorage?.setItem(latestPushTokenStorageKey, token);
    } else {
      globalThis.localStorage?.removeItem(latestPushTokenStorageKey);
    }
  } catch {
    // Native localStorage can be absent depending on runtime; push cleanup remains best-effort.
  }
}

function readPersistedExpoPushToken() {
  if (Platform.OS === "web") {
    return null;
  }
  try {
    return globalThis.localStorage?.getItem(latestPushTokenStorageKey) ?? null;
  } catch {
    return null;
  }
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
