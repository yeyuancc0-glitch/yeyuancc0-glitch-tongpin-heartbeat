import { supabase } from "@/lib/supabase/client";

type WebPushRegistrationResult =
  | { status: "registered"; endpoint: string }
  | { status: "unsupported" | "denied" | "missing_vapid_key" | "service_unavailable" | "error"; message?: string };

type WebPushEnvironment = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  isAndroidEdge: boolean;
  isStandalone: boolean;
  userAgent: string;
};

const serviceWorkerPath = "/sw.js";
const chromiumGcmSenderId = "103953800507";

export function isWebPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    window.isSecureContext &&
    !isAndroidEdgeBrowser()
  );
}

export function getWebPushPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export function getWebPushEnvironment(): WebPushEnvironment {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return {
    supported: isWebPushSupported(),
    permission: getWebPushPermission(),
    isAndroidEdge: /\bEdgA\//.test(userAgent) || (/\bEdg\//.test(userAgent) && /Android/i.test(userAgent)),
    isStandalone: isStandaloneWebApp(),
    userAgent,
  };
}

export async function registerForWebPushNotifications(): Promise<WebPushRegistrationResult> {
  if (getWebPushEnvironment().isAndroidEdge) {
    return {
      status: "unsupported",
      message: "Android Edge 在中国大陆环境下无法稳定完成网页后台推送订阅。当前只能使用站内通知；可靠系统推送需要后续接入原生 Android 国内厂商推送通道。",
    };
  }

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

    const manifestReady = await hasChromiumPushManifestSenderId();
    if (!manifestReady) {
      return {
        status: "service_unavailable",
        message: "当前桌面图标可能仍在使用旧版网页配置。请删除桌面图标，清除 Edge 中本站的存储数据，再从 https://app.fanch.tech 重新添加到桌面后重试。",
      };
    }

    const registration = await getReadyServiceWorkerRegistration();
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription && !subscriptionMatchesVapidKey(existingSubscription, applicationServerKey)) {
      await supabase.rpc("disable_current_push_token", {
        push_token: existingSubscription.endpoint,
      });
      await existingSubscription.unsubscribe();
    }
    const reusableSubscription = await registration.pushManager.getSubscription();
    const subscription =
      reusableSubscription ??
      await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
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
    const message = formatWebPushRegistrationError(error);
    return {
      status: isWebPushServiceError(error) ? "unsupported" : "error",
      message,
    };
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

async function hasChromiumPushManifestSenderId() {
  if (!isChromiumBasedBrowser()) {
    return true;
  }

  try {
    const manifestHref = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? "/site.webmanifest";
    const response = await fetch(manifestHref, { cache: "no-store" });
    if (!response.ok) {
      return false;
    }
    const manifest = await response.json() as { gcm_sender_id?: unknown };
    return manifest.gcm_sender_id === chromiumGcmSenderId;
  } catch {
    return false;
  }
}

async function getReadyServiceWorkerRegistration() {
  await navigator.serviceWorker.register(serviceWorkerPath);
  return await navigator.serviceWorker.ready;
}

function subscriptionMatchesVapidKey(subscription: PushSubscription, vapidKey: Uint8Array) {
  const key = subscription.options.applicationServerKey;
  if (!key) {
    return false;
  }
  const existing = new Uint8Array(key);
  if (existing.length !== vapidKey.length) {
    return false;
  }
  return existing.every((value, index) => value === vapidKey[index]);
}

function formatWebPushRegistrationError(error: unknown) {
  if (!(error instanceof Error)) {
    return "网页推送开启失败。";
  }

  const message = error.message.trim();
  if (isWebPushServiceError(error)) {
    if (getWebPushEnvironment().isAndroidEdge) {
      return "权限已经允许，但 Android Edge 无法完成网页后台推送订阅。这不是站点权限问题；在中国大陆环境下请使用站内通知，可靠系统推送需要后续接入原生 Android 国内厂商推送通道。";
    }
    return "权限已经允许，但浏览器推送服务注册失败。请清除本站数据后重新添加到桌面再试；如果仍失败，只能使用站内通知。";
  }

  if (error.name === "NotAllowedError" || message.includes("permission")) {
    return "浏览器通知权限未开启。";
  }

  if (error.name === "InvalidAccessError" || message.includes("applicationServerKey")) {
    return "网页推送公钥无效，请检查 Web Push VAPID 公钥配置。";
  }

  if (error.name === "InvalidStateError" || message.includes("active Service Worker")) {
    return "网页推送服务尚未准备好，请刷新页面后重试。";
  }

  return message || "网页推送开启失败。";
}

function isWebPushServiceError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.trim();
  return message.includes("push service error") || message.includes("Registration failed");
}

function isChromiumBasedBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Chrome|Chromium|CriOS|Edg|EdgA/i.test(navigator.userAgent);
}

function isAndroidEdgeBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /\bEdgA\//.test(navigator.userAgent) || (/\bEdg\//.test(navigator.userAgent) && /Android/i.test(navigator.userAgent));
}

function isStandaloneWebApp() {
  if (typeof window === "undefined") {
    return false;
  }
  const navigatorLike = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || navigatorLike.standalone === true;
}
