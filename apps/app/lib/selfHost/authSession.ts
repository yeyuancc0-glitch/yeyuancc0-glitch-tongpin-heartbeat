import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import type { AppAuthSession, AppAuthUser, SelfHostAuthResponse, SelfHostSession, SelfHostUser } from "./types";

const storageKey = "tongpin.selfHost.authSession.v1";

function expiresAtSeconds(value?: string | null) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

export function toAppAuthUser(user: SelfHostUser): AppAuthUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    disabled: user.disabled,
    user_metadata: {
      display_name: user.profile?.displayName ?? null,
    },
    app_metadata: {},
  };
}

export function toAppAuthSession(user: SelfHostUser, session: SelfHostSession): AppAuthSession {
  return {
    provider: "self-host",
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_at: expiresAtSeconds(session.accessTokenExpiresAt),
    token_type: session.tokenType,
    user: toAppAuthUser(user),
  };
}

export function authResponseToSession(response: SelfHostAuthResponse): AppAuthSession | null {
  if (!response.session) {
    return null;
  }
  return toAppAuthSession(response.user, response.session);
}

async function readRawItem() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.sessionStorage.getItem(storageKey);
  }
  return AsyncStorage.getItem(storageKey);
}

async function writeRawItem(value: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.sessionStorage.setItem(storageKey, value);
    return;
  }
  await AsyncStorage.setItem(storageKey, value);
}

async function removeRawItem() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.sessionStorage.removeItem(storageKey);
    return;
  }
  await AsyncStorage.removeItem(storageKey);
}

export async function loadSelfHostSession() {
  const raw = await readRawItem();
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as AppAuthSession;
    if (parsed.provider !== "self-host" || !parsed.access_token || !parsed.user?.id) {
      await removeRawItem();
      return null;
    }
    return parsed;
  } catch {
    await removeRawItem();
    return null;
  }
}

export async function saveSelfHostSession(session: AppAuthSession | null) {
  if (!session) {
    await removeRawItem();
    return;
  }
  await writeRawItem(JSON.stringify(session));
}
