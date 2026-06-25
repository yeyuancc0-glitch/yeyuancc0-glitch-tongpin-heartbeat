import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { useToast } from "@/components/ui";
import { SelfHostApiError } from "@/lib/selfHost/apiClient";
import {
  confirmSelfHostPasswordReset,
  loadSelfHostMe,
  loginSelfHost,
  logoutSelfHost,
  refreshSelfHostSession,
  registerSelfHost,
  requestSelfHostPasswordReset,
} from "@/lib/selfHost/authApi";
import { loadSelfHostSession, saveSelfHostSession } from "@/lib/selfHost/authSession";
import type { AppAuthSession, AppAuthUser } from "@/lib/selfHost/types";

type AuthFeedback = {
  status?: string;
  debugToken?: string;
};

type AuthContextValue = {
  session: AppAuthSession | null;
  user: AppAuthUser | null;
  loading: boolean;
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signInWithPassword: (input: { email: string; password: string }) => Promise<AuthFeedback>;
  signUpWithPassword: (input: { email: string; password: string; displayName?: string }) => Promise<AuthFeedback>;
  sendPasswordResetEmail: (email: string) => Promise<AuthFeedback>;
  updateRecoveryPassword: (input: { password: string; resetToken?: string }) => Promise<AuthFeedback>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isAuthInvalidError(error: unknown) {
  return error instanceof SelfHostApiError && (error.status === 401 || error.status === 403);
}

function readAuthHashError() {
  if (Platform.OS !== "web" || !window.location.hash.includes("error=")) {
    return null;
  }

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const errorCode = params.get("error_code");
  const errorDescription = params.get("error_description");

  window.history.replaceState(null, document.title, window.location.pathname + window.location.search);

  return {
    title: errorCode === "otp_expired" ? "邮箱链接已过期" : "登录链接无效",
    message: errorDescription ? errorDescription.replace(/\+/g, " ") : "请重新登录或重新发送验证链接。",
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const { showToast } = useToast();
  const [session, setSession] = useState<AppAuthSession | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const pendingHashError = readAuthHashError();
    const restoreTimeoutId = setTimeout(() => {
      if (!mounted) {
        return;
      }
      console.warn("Auth session restore timed out.");
      setLoading(false);
      if (pendingHashError) {
        showToast({ ...pendingHashError, tone: "error" });
      }
    }, 8000);

    void loadSelfHostSession()
      .then(async (storedSession) => {
        if (!mounted) {
          return;
        }
        if (!storedSession) {
          setSession(null);
          return;
        }
        try {
          const user = await loadSelfHostMe(storedSession.access_token);
          if (!mounted) {
            return;
          }
          setSession({ ...storedSession, user });
        } catch (error) {
          if (storedSession.refresh_token && isAuthInvalidError(error)) {
            try {
              const refreshed = await refreshSelfHostSession(storedSession.refresh_token);
              if (refreshed.session) {
                await saveSelfHostSession(refreshed.session);
                if (mounted) {
                  setSession(refreshed.session);
                }
                return;
              }
            } catch (refreshError) {
              console.warn("Self-host auth refresh failed:", refreshError);
              if (!isAuthInvalidError(refreshError)) {
                if (mounted) {
                  setSession(storedSession);
                }
                return;
              }
            }
          }
          if (!isAuthInvalidError(error)) {
            if (mounted) {
              console.warn("Self-host auth session restore deferred:", error);
              setSession(storedSession);
            }
            return;
          }
          await saveSelfHostSession(null);
          if (mounted) {
            console.warn("Self-host auth session restore failed:", error);
            setSession(null);
          }
        }
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        clearTimeout(restoreTimeoutId);
        console.warn("Auth session restore failed:", error);
        setSession(null);
        setLoading(false);
        if (pendingHashError) {
          showToast({ ...pendingHashError, tone: "error" });
        }
      })
      .finally(() => {
        if (!mounted) {
          return;
        }
        clearTimeout(restoreTimeoutId);
        setLoading(false);
        if (pendingHashError) {
          showToast({ ...pendingHashError, tone: "error" });
        }
      });

    return () => {
      mounted = false;
      clearTimeout(restoreTimeoutId);
    };
  }, [showToast]);

  useEffect(() => {
    if (!session?.user || Platform.OS === "web") {
      return undefined;
    }

    let subscription: { remove: () => void } | null = null;
    void import("@/lib/notifications/push").then(({ registerForPushNotifications, subscribePushTokenRefresh }) => {
      const pushOptions = { accessToken: session.access_token };
      subscription = subscribePushTokenRefresh(pushOptions);
      void registerForPushNotifications(pushOptions).then((result) => {
        if (result.status === "error") {
          console.warn("Push registration failed:", result.message);
        }
      });
    });

    return () => {
      subscription?.remove();
    };
  }, [session?.access_token, session?.user]);

  useEffect(() => {
    if (!session?.user) {
      return undefined;
    }

    let subscription: { remove: () => void } | null = null;
    void import("@/lib/notifications/openEvents").then(({ registerNotificationOpenBridge }) => {
      subscription = registerNotificationOpenBridge();
    });

    return () => {
      subscription?.remove();
    };
  }, [session?.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      passwordRecovery,
      clearPasswordRecovery: () => setPasswordRecovery(false),
      signInWithPassword: async ({ email, password }) => {
        const result = await loginSelfHost({ email, password });
        if (result.session) {
          await saveSelfHostSession(result.session);
          setSession(result.session);
        }
        return {};
      },
      signUpWithPassword: async ({ displayName, email, password }) => {
        const result = await registerSelfHost({ email, password, displayName });
        if (result.session) {
          await saveSelfHostSession(result.session);
          setSession(result.session);
        }
        return result.response.emailVerification ?? {};
      },
      sendPasswordResetEmail: async (email) => {
        const result = await requestSelfHostPasswordReset(email);
        const passwordReset = result.passwordReset ?? { status: result.status, debugToken: result.debugToken };
        if (!passwordReset.debugToken && passwordReset.status && passwordReset.status !== "sent") {
          throw new Error(passwordReset.status === "delivery_failed" ? "重置邮件发送失败，请稍后重试。" : "无法发送重置邮件，请稍后重试。");
        }
        setPasswordRecovery(true);
        return passwordReset;
      },
      updateRecoveryPassword: async ({ password, resetToken }) => {
        if (!resetToken) {
          throw new Error("请输入重置邮件里的验证码。");
        }
        const result = await confirmSelfHostPasswordReset({ token: resetToken, password });
        if (result.session) {
          await saveSelfHostSession(result.session);
          setSession(result.session);
        } else {
          await saveSelfHostSession(null);
          setSession(null);
        }
        setPasswordRecovery(false);
        return { status: result.response.status };
      },
      signOut: async () => {
        try {
          if (Platform.OS === "web") {
            const { disableCurrentWebPushSubscription } = await import("@/lib/notifications/webPush");
            await disableCurrentWebPushSubscription();
          } else {
            const { disableCurrentPushToken } = await import("@/lib/notifications/push");
            await disableCurrentPushToken({ accessToken: session?.access_token });
          }
          await logoutSelfHost(session?.refresh_token);
        } catch (error) {
          console.warn("Self-host logout cleanup failed:", error);
        }
        await saveSelfHostSession(null);
        setPasswordRecovery(false);
        setSession(null);
      },
    }),
    [loading, passwordRecovery, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
