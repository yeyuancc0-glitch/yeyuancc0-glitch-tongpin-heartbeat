import { Platform } from "react-native";

import type { SelfHostAuthMode } from "./types";

const configuredApiUrl = process.env.EXPO_PUBLIC_SELF_HOST_API_URL?.trim();

export const selfHostApiUrl = configuredApiUrl?.replace(/\/+$/, "") ?? "";

export const authProviderMode: SelfHostAuthMode = "self-host";

export const isSelfHostConfigured = Boolean(selfHostApiUrl && /^https?:\/\//i.test(selfHostApiUrl));

export const isSelfHostAuthEnabled = isSelfHostConfigured;

export const selfHostRedirectOrigin =
  Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : undefined;
