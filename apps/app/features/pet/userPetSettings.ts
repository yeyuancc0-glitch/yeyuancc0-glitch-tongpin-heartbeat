import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

export type PetUserSize = "small" | "medium" | "large";

export type PetUserSettings = {
  visible: boolean;
  soundEnabled: boolean;
  autonomousRoamingEnabled: boolean;
  size: PetUserSize;
  reducedMotion: boolean;
  positionResetAt: number;
};

export const defaultPetUserSettings: PetUserSettings = {
  visible: true,
  soundEnabled: true,
  autonomousRoamingEnabled: true,
  size: "medium",
  reducedMotion: false,
  positionResetAt: 0,
};

const storagePrefix = "pet-user-settings";
const changeEventName = "tongpin-pet-user-settings-change";

export function petSizeScale(size: PetUserSize) {
  if (size === "small") return 0.86;
  if (size === "large") return 1.16;
  return 1;
}

export function usePetUserSettings(userId?: string | null) {
  const [settings, setSettingsState] = useState<PetUserSettings>(() => loadPetUserSettings(userId));

  useEffect(() => {
    setSettingsState(loadPetUserSettings(userId));
  }, [userId]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return undefined;
    }
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string | null }>).detail;
      if ((detail?.userId ?? null) !== (userId ?? null)) {
        return;
      }
      setSettingsState(loadPetUserSettings(userId));
    };
    window.addEventListener(changeEventName, handleChange);
    return () => window.removeEventListener(changeEventName, handleChange);
  }, [userId]);

  const setSettings = useCallback((next: Partial<PetUserSettings> | ((current: PetUserSettings) => PetUserSettings)) => {
    const current = loadPetUserSettings(userId);
    const value = typeof next === "function" ? next(current) : { ...current, ...next };
    const normalized = normalizePetUserSettings(value);
    savePetUserSettings(userId, normalized);
    setSettingsState(normalized);
    notifyPetUserSettingsChanged(userId);
  }, [userId]);

  return useMemo(() => ({ settings, setSettings }), [settings, setSettings]);
}

function loadPetUserSettings(userId?: string | null): PetUserSettings {
  if (Platform.OS !== "web" || typeof window === "undefined" || !window.localStorage) {
    return defaultPetUserSettings;
  }
  const raw = window.localStorage.getItem(storageKey(userId));
  if (!raw) {
    return defaultPetUserSettings;
  }
  try {
    return normalizePetUserSettings(JSON.parse(raw));
  } catch {
    return defaultPetUserSettings;
  }
}

function savePetUserSettings(userId: string | null | undefined, settings: PetUserSettings) {
  if (Platform.OS !== "web" || typeof window === "undefined" || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(storageKey(userId), JSON.stringify(settings));
}

function normalizePetUserSettings(value: unknown): PetUserSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultPetUserSettings;
  }
  const raw = value as Partial<Record<keyof PetUserSettings, unknown>>;
  return {
    visible: typeof raw.visible === "boolean" ? raw.visible : defaultPetUserSettings.visible,
    soundEnabled: typeof raw.soundEnabled === "boolean" ? raw.soundEnabled : defaultPetUserSettings.soundEnabled,
    autonomousRoamingEnabled: typeof raw.autonomousRoamingEnabled === "boolean" ? raw.autonomousRoamingEnabled : defaultPetUserSettings.autonomousRoamingEnabled,
    size: raw.size === "small" || raw.size === "medium" || raw.size === "large" ? raw.size : defaultPetUserSettings.size,
    reducedMotion: typeof raw.reducedMotion === "boolean" ? raw.reducedMotion : defaultPetUserSettings.reducedMotion,
    positionResetAt: Number.isFinite(Number(raw.positionResetAt)) ? Number(raw.positionResetAt) : defaultPetUserSettings.positionResetAt,
  };
}

function storageKey(userId?: string | null) {
  return `${storagePrefix}:${userId || "anonymous"}`;
}

function notifyPetUserSettingsChanged(userId?: string | null) {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(changeEventName, { detail: { userId: userId ?? null } }));
}
