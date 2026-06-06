import { supabase } from "@/lib/supabase/client";

type WebPushRegistrationResult =
  | { status: "registered"; endpoint: string }
  | { status: "unsupported" | "denied" | "missing_vapid_key" | "error"; message?: string };

const serviceWorkerPath = "/sw.js";

export function isWebPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    window.isSecureContext
  );
}

export function getWebPushPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function registerForWebPushNotifications(): Promise<WebPushRegistrationResult> {
  if (!isWebPushSupported()) {
    return { status: "unsupported", message: "当前浏览器不支持网页系统推送，或页面不是 HTTPS 安全环境。" };
  }

  const vapidPublicKey = process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return { status: "missing_vapid_key", message: "缺少 Web Push VAPID 公钥。" };
  }

  try {
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") {
      return { status: "denied", message: "浏览器通知权限未开启。" };
    }

    const registration = await navigator.serviceWorker.register(serviceWorkerPath);
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription =
      existingSubscription ??
      await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

    const subscriptionJson = subscription.toJSON();
    const endpoint = subscriptionJson.endpoint;
    const p256dh = subscriptionJson.keys?.p256dh;
    const auth = subscriptionJson.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return { status: "error", message: "浏览器返回的推送订阅不完整。" };
    }

    const { error } = await supabase.rpc("register_web_push_subscription", {
      push_endpoint: endpoint,
      push_p256dh: p256dh,
      push_auth: auth,
      push_user_agent: navigator.userAgent,
    });

    if (error) {
      return { status: "error", message: error.message };
    }

    return { status: "registered", endpoint };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "网页推送开启失败。" };
  }
}

export async function disableCurrentWebPushSubscription() {
  if (!isWebPushSupported()) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) {
    return;
  }

  await supabase.rpc("disable_current_push_token", {
    push_token: subscription.endpoint,
  });
  await subscription.unsubscribe();
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}
