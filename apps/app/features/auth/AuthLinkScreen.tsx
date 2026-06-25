import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CheckCircle2, HeartHandshake, LockKeyhole, Mail, XCircle } from "lucide-react-native";

import { useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { confirmSelfHostEmailVerification } from "@/lib/selfHost/authApi";
import { isSelfHostAuthEnabled } from "@/lib/selfHost/config";
import { BouncyPressable } from "@/motion/BouncyPressable";

type AuthLinkMode = "verifyEmail" | "resetPassword";
type LinkState = "idle" | "loading" | "success" | "error";

export function AuthLinkScreen({ mode, token }: { mode: AuthLinkMode; token?: string | string[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { updateRecoveryPassword } = useAuth();
  const normalizedToken = useMemo(() => normalizeToken(token), [token]);
  const [state, setState] = useState<LinkState>(mode === "verifyEmail" && normalizedToken ? "loading" : "idle");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (mode !== "verifyEmail") {
      return;
    }
    if (!normalizedToken) {
      setState("error");
      setMessage("验证链接缺少 token，请重新发送验证邮件。");
      return;
    }
    if (!isSelfHostAuthEnabled) {
      setState("error");
      setMessage("当前登录方式不使用自建邮箱验证链接。");
      return;
    }

    let cancelled = false;
    setState("loading");
    void confirmSelfHostEmailVerification(normalizedToken)
      .then(() => {
        if (cancelled) {
          return;
        }
        setState("success");
        setMessage("邮箱已验证，可以继续登录同频跳动。");
        showToast({ title: "邮箱已验证", message: "现在可以登录账号了。", tone: "success" });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setState("error");
        setMessage(error instanceof Error ? error.message : "邮箱验证失败，请重新发送验证邮件。");
      });

    return () => {
      cancelled = true;
    };
  }, [mode, normalizedToken, showToast]);

  async function submitResetPassword() {
    if (!normalizedToken) {
      setState("error");
      setMessage("重置链接缺少 token，请重新发送重置邮件。");
      return;
    }
    if (password.length < 6) {
      setState("error");
      setMessage("新密码至少需要 6 位。");
      return;
    }
    if (password !== confirmPassword) {
      setState("error");
      setMessage("两次输入的新密码不一致。");
      return;
    }

    setState("loading");
    setMessage("");
    try {
      await updateRecoveryPassword({ password, resetToken: normalizedToken });
      setState("success");
      setPassword("");
      setConfirmPassword("");
      setMessage("密码已更新，请使用新密码重新登录。");
      showToast({ title: "密码已更新", message: "请使用新密码重新登录。", tone: "success" });
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "密码重置失败，请重新发送重置邮件。");
    }
  }

  const isReset = mode === "resetPassword";
  const title = isReset ? "设置新密码" : "邮箱验证";
  const subtitle = isReset ? "输入新密码后，这个重置链接会立即失效。" : message || "正在确认你的邮箱。";
  const showResetForm = isReset && state !== "success";
  const iconColor = state === "success" ? "#6ca987" : state === "error" ? "#c97989" : "rgba(210,116,148,0.64)";

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.logoMark}>
          {state === "success" ? (
            <CheckCircle2 color={iconColor} size={30} strokeWidth={2.2} />
          ) : state === "error" ? (
            <XCircle color={iconColor} size={30} strokeWidth={2.2} />
          ) : isReset ? (
            <LockKeyhole color={iconColor} size={29} strokeWidth={2.1} />
          ) : (
            <Mail color={iconColor} size={29} strokeWidth={2.1} />
          )}
        </View>
        <View style={styles.brandRow}>
          <HeartHandshake color="rgba(210,116,148,0.55)" size={20} strokeWidth={2.1} />
          <Text style={styles.brandText}>同频跳动</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {showResetForm ? (
          <View style={styles.form}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="请输入新密码"
              placeholderTextColor="rgba(121,111,116,0.38)"
              secureTextEntry
              style={styles.input}
            />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="请再次输入新密码"
              placeholderTextColor="rgba(121,111,116,0.38)"
              secureTextEntry
              style={styles.input}
            />
          </View>
        ) : null}

        {message && (isReset || state === "error") ? <Text style={[styles.message, state === "error" ? styles.errorText : null]}>{message}</Text> : null}

        <BouncyPressable
          accessibilityRole="button"
          disabled={state === "loading" || (showResetForm && (!password || !confirmPassword))}
          disabledStyle={styles.primaryButtonDisabled}
          haptic="light"
          onPress={() => {
            if (showResetForm) {
              void submitResetPassword();
              return;
            }
            router.replace("/");
          }}
          style={styles.primaryButton}
        >
          {state === "loading" ? <ActivityIndicator color="#fff" size="small" /> : null}
          <Text style={styles.primaryButtonText}>
            {state === "loading" ? "处理中" : showResetForm ? "保存新密码" : "返回登录"}
          </Text>
        </BouncyPressable>

        {showResetForm ? (
          <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>返回登录</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function normalizeToken(token?: string | string[]) {
  const value = Array.isArray(token) ? token[0] : token;
  const normalized = String(value ?? "").trim();
  return normalized || "";
}

const styles = StyleSheet.create({
  screen: {
    minHeight: 620,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 42,
  },
  card: {
    width: "100%",
    maxWidth: 388,
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.68)",
    backgroundColor: "rgba(255,255,255,0.42)",
    padding: 24,
    boxShadow: "0 18px 42px rgba(191, 127, 151, 0.14), inset 0 1px 1px rgba(255,255,255,0.78)" as never,
    backdropFilter: "blur(24px) saturate(1.12)" as never,
  },
  logoMark: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.46)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandText: {
    color: "rgba(67,59,64,0.68)",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800" as never,
  },
  title: {
    color: "rgba(48,43,46,0.9)",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: "rgba(92,79,86,0.72)",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  form: {
    width: "100%",
    gap: 10,
    marginTop: 4,
  },
  input: {
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.68)",
    backgroundColor: "rgba(255,255,255,0.34)",
    color: "rgba(46,40,44,0.88)",
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 18,
    outlineStyle: "none" as never,
  },
  message: {
    alignSelf: "stretch",
    color: "rgba(92,79,86,0.74)",
    backgroundColor: "rgba(255,250,252,0.58)",
    borderColor: "rgba(238,180,193,0.44)",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    overflow: "hidden",
  },
  errorText: {
    color: "#a45f75",
  },
  primaryButton: {
    width: "100%",
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: "#f0a3b7",
    backgroundImage: "linear-gradient(100deg, #f5b2c2 0%, #ee91aa 52%, #ffc8c7 100%)" as never,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    outlineStyle: "none" as never,
  },
  primaryButtonDisabled: {
    opacity: 0.62,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "850" as never,
  },
  secondaryButton: {
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    outlineStyle: "none" as never,
  },
  secondaryButtonText: {
    color: "rgba(92,79,86,0.7)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
});
