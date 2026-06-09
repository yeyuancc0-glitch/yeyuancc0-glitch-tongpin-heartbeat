import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { quickInteractionIcons } from "@/features/home/homeAssets";
import type { QuickInteractionItem } from "@/features/home/homeShared";
import { customQuickTone, isQuickInteractionNotification, isTodayTimestamp } from "@/features/home/homeUtils";
import { quickInteractionPresets } from "@/lib/constants/appContent";
import { todayIsoDate } from "@/lib/dates/date";
import { supabase } from "@/lib/supabase/client";
import type { Notification } from "@/lib/supabase/database.types";

const maxQuickInteractionCards = 8;
const quickInteractionPresetItems = quickInteractionPresets.filter((item) => item.id !== "message");
const quickInteractionAddItem = quickInteractionPresets.find((item) => item.id === "message") ?? {
  id: "message",
  label: "自定义互动",
  tone: "#eef4f6",
  icon: quickInteractionIcons.custom,
};
const maxCustomQuickInteractions = Math.max(0, maxQuickInteractionCards - quickInteractionPresetItems.length - 1);

type ToastValue = {
  title: string;
  message?: string;
  tone: "success" | "error" | "info";
};

export function useQuickInteractions({
  coupleId,
  partnerId,
  notifications,
  showToast,
  reload,
}: {
  coupleId?: string | null;
  partnerId?: string | null;
  notifications: Notification[];
  showToast: (toast: ToastValue) => void;
  reload: () => void;
}) {
  const [interactionText, setInteractionText] = useState("");
  const [quickSending, setQuickSending] = useState(false);
  const [customQuickInteractions, setCustomQuickInteractions] = useState<QuickInteractionItem[]>([]);
  const [customQuickComposerOpen, setCustomQuickComposerOpen] = useState(false);
  const [customQuickDraft, setCustomQuickDraft] = useState("");
  const [customQuickLoadedCoupleId, setCustomQuickLoadedCoupleId] = useState<string | null>(null);
  const [localTodayInteractionCount, setLocalTodayInteractionCount] = useState(0);
  const [dismissedPopupIds, setDismissedPopupIds] = useState<string[]>([]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }

    if (!coupleId) {
      setCustomQuickInteractions([]);
      setCustomQuickComposerOpen(false);
      setCustomQuickDraft("");
      setCustomQuickLoadedCoupleId(null);
      setLocalTodayInteractionCount(0);
      return;
    }

    const rawItems = window.localStorage.getItem(`quick-interactions:${coupleId}`);
    const rawCount = window.localStorage.getItem(`quick-interactions-count:${coupleId}:${todayIsoDate()}`);
    let nextItems: QuickInteractionItem[] = [];
    if (rawItems) {
      try {
        const parsed = JSON.parse(rawItems) as Array<{ id: string; label: string; tone: string }>;
        nextItems = parsed.slice(0, maxCustomQuickInteractions).map((item) => ({
          ...item,
          icon: quickInteractionIcons.custom,
        }));
      } catch {
        nextItems = [];
      }
    }
    setCustomQuickInteractions(nextItems);
    setCustomQuickComposerOpen(false);
    setCustomQuickDraft("");
    setCustomQuickLoadedCoupleId(coupleId);
    setLocalTodayInteractionCount(rawCount ? Number(rawCount) || 0 : 0);
  }, [coupleId]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !coupleId || customQuickLoadedCoupleId !== coupleId) {
      return;
    }
    const serializable = customQuickInteractions.map(({ id, label, tone }) => ({ id, label, tone }));
    window.localStorage.setItem(`quick-interactions:${coupleId}`, JSON.stringify(serializable));
  }, [coupleId, customQuickInteractions, customQuickLoadedCoupleId]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !coupleId) {
      return;
    }
    window.localStorage.setItem(`quick-interactions-count:${coupleId}:${todayIsoDate()}`, String(localTodayInteractionCount));
  }, [coupleId, localTodayInteractionCount]);

  const quickInteractionItems = useMemo(
    () => [...quickInteractionPresetItems, ...customQuickInteractions, quickInteractionAddItem].slice(0, maxQuickInteractionCards),
    [customQuickInteractions]
  );

  const todayInteractionCount = useMemo(
    () => notifications.filter((notification) => isQuickInteractionNotification(notification) && isTodayTimestamp(notification.created_at)).length + localTodayInteractionCount,
    [localTodayInteractionCount, notifications]
  );

  const addCustomQuickInteraction = useCallback(() => {
    if (quickInteractionItems.length >= maxQuickInteractionCards) {
      showToast({ title: "快捷互动已满", message: `最多保留 ${maxQuickInteractionCards} 个。`, tone: "info" });
      return;
    }
    if (Platform.OS === "web" && typeof window !== "undefined") {
      setCustomQuickDraft("");
      setCustomQuickComposerOpen(true);
      return;
    }
    showToast({ title: "当前端暂不支持", message: "自定义快捷互动当前先在 Web 端开放。", tone: "info" });
  }, [quickInteractionItems.length, showToast]);

  const saveCustomQuickInteraction = useCallback(() => {
    const trimmed = customQuickDraft.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      showToast({ title: "先写一句互动", message: "比如“晚安抱抱”或“想喝奶茶”。", tone: "info" });
      return;
    }
    if (quickInteractionItems.length >= maxQuickInteractionCards) {
      showToast({ title: "快捷互动已满", message: `最多保留 ${maxQuickInteractionCards} 个。`, tone: "info" });
      return;
    }

    setCustomQuickInteractions((items) => {
      if (items.length >= maxCustomQuickInteractions) {
        return items;
      }
      return [
        ...items,
        {
          id: `custom-${Date.now()}`,
          label: trimmed.slice(0, 8),
          tone: customQuickTone(items.length),
          icon: quickInteractionIcons.custom,
        },
      ];
    });
    setCustomQuickComposerOpen(false);
    setCustomQuickDraft("");
    showToast({ title: "已添加互动", message: "新的快捷互动已经放进此刻同频。", tone: "success" });
  }, [customQuickDraft, quickInteractionItems.length, showToast]);

  const cancelCustomQuickInteraction = useCallback(() => {
    setCustomQuickComposerOpen(false);
    setCustomQuickDraft("");
  }, []);

  const sendQuickInteraction = useCallback(async (label: string) => {
    if (!coupleId || quickSending) {
      return false;
    }

    if (!partnerId) {
      showToast({ title: "投递失败", message: "还没有找到对方账号，请刷新后再试。", tone: "error" });
      return false;
    }

    setQuickSending(true);
    try {
      const { data: notification, error: notificationError } = await supabase
        .rpc("send_quick_interaction", {
          target_couple_id: coupleId,
          interaction_label: label,
        })
        .maybeSingle();

      if (notificationError || !notification?.notification_id) {
        showToast({ title: "投递失败", message: notificationError?.message ?? "对方提醒没有创建。", tone: "error" });
        reload();
        return false;
      }
      setDismissedPopupIds((ids) => (ids.includes(notification.notification_id) ? ids : [...ids, notification.notification_id]));
      setLocalTodayInteractionCount((count) => count + 1);
      setInteractionText(`“${label}”已经投递给对方。`);
      showToast({ title: `已投递 ${label}`, message: "对方会在首页收到一个小提醒。", tone: "success" });
      setTimeout(() => setInteractionText(""), 1600);
      reload();
      return true;
    } catch (error) {
      showToast({ title: "投递失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
      reload();
      return false;
    } finally {
      setQuickSending(false);
    }
  }, [coupleId, partnerId, quickSending, reload, showToast]);

  return {
    addCustomQuickInteraction,
    cancelCustomQuickInteraction,
    customQuickComposerOpen,
    customQuickDraft,
    dismissedPopupIds,
    interactionText,
    quickInteractionItems,
    quickSending,
    saveCustomQuickInteraction,
    sendQuickInteraction,
    setCustomQuickDraft,
    setDismissedPopupIds,
    todayInteractionCount,
  };
}
