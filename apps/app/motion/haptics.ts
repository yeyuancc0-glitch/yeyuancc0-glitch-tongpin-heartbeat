import { Platform } from "react-native";
import * as ExpoHaptics from "expo-haptics";

export type HapticTone = "light" | "selection" | "success" | "warning" | "error" | "none";

const throttleMs: Record<Exclude<HapticTone, "none">, number> = {
  light: 120,
  selection: 120,
  success: 900,
  warning: 700,
  error: 700,
};

const lastPlayedAt: Partial<Record<Exclude<HapticTone, "none">, number>> = {};

async function play(tone: HapticTone) {
  if (tone === "none" || Platform.OS === "web") {
    return;
  }

  const now = Date.now();
  const key = tone;
  if (lastPlayedAt[key] && now - lastPlayedAt[key]! < throttleMs[key]) {
    return;
  }
  lastPlayedAt[key] = now;

  try {
    if (tone === "selection") {
      await ExpoHaptics.selectionAsync();
      return;
    }
    if (tone === "success") {
      await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success);
      return;
    }
    if (tone === "warning") {
      await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning);
      return;
    }
    if (tone === "error") {
      await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error);
      return;
    }
    await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics are best-effort and should never block app interaction.
  }
}

export const haptics = {
  light: () => void play("light"),
  selection: () => void play("selection"),
  success: () => void play("success"),
  warning: () => void play("warning"),
  error: () => void play("error"),
  play,
};
