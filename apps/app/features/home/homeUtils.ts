import { todayIsoDate } from "@/lib/dates/date";
import type { Message, Notification } from "@/lib/supabase/database.types";

import { quickInteractionIcons } from "./homeAssets";

const quickInteractionNotificationTitles = new Set(["TA 投递了一点心情", "TA 向你投递了一点心情"]);
const quickInteractionMessagePattern = /^投递了「.+」$/;

export function isQuickInteractionMessage(message: Message) {
  return quickInteractionMessagePattern.test(message.body.trim());
}

export function isQuickInteractionNotification(notification: Notification) {
  return notification.type === "message" && quickInteractionNotificationTitles.has(notification.title);
}

export function isTodayTimestamp(value: string) {
  return value.slice(0, 10) === todayIsoDate();
}

export function interactionIconFor(id: string) {
  const icons = {
    miss: quickInteractionIcons.miss,
    hug: quickInteractionIcons.hug,
    close: quickInteractionIcons.close,
    message: quickInteractionIcons.custom,
  };
  return icons[id as keyof typeof icons];
}

export function interactionIconForLabel(label: string) {
  if (label.includes("想")) return quickInteractionIcons.miss;
  if (label.includes("抱")) return quickInteractionIcons.hug;
  if (label.includes("贴")) return quickInteractionIcons.close;
  if (label.includes("自定义") || label.includes("胶囊") || label.includes("留言")) return quickInteractionIcons.custom;
  return undefined;
}

export function floatingIconForInteraction(id: string) {
  if (id === "miss") return "♡";
  if (id === "hug") return "♡";
  if (id === "close") return "◐";
  return "✦";
}

export function customQuickTone(index: number) {
  const tones = ["#f7e9f1", "#f0edf8", "#fff2df", "#edf5f3", "#f4ece7", "#eef1f8"];
  return tones[index % tones.length];
}
