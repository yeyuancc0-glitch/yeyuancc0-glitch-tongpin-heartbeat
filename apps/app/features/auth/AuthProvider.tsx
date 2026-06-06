import type { Session, User } from "@supabase/supabase-js";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { useToast } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
  const [session, setSession] = useState<Session | null>(null);
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

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) {
          return;
        }
        clearTimeout(restoreTimeoutId);
        setSession(data.session);
        setLoading(false);
        if (pendingHashError) {
          showToast({ ...pendingHashError, tone: "error" });
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
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const hashError = readAuthHashError();
      if (hashError) {
        showToast({ ...hashError, tone: "error" });
      }
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(restoreTimeoutId);
      data.subscription.unsubscribe();
    };
  }, [showToast]);

  useEffect(() => {
    if (!session?.user || Platform.OS === "web") {
      return undefined;
    }

    let subscription: { remove: () => void } | null = null;
    void import("@/lib/notifications/push").then(({ registerForPushNotifications, subscribePushTokenRefresh }) => {
      subscription = subscribePushTokenRefresh();
      void registerForPushNotifications().then((result) => {
        if (result.status === "error") {
          console.warn("Push registration failed:", result.message);
        }
      });
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
      signOut: async () => {
        if (Platform.OS === "web") {
          const { disableCurrentWebPushSubscription } = await import("@/lib/notifications/webPush");
          await disableCurrentWebPushSubscription();
        } else {
          const { disableCurrentPushToken } = await import("@/lib/notifications/push");
          await disableCurrentPushToken();
        }
        await supabase.auth.signOut();
      },
    }),
    [loading, session]
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
