import type { ReactNode } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import {
  Apple,
  HeartHandshake,
  LockKeyhole,
  Mail,
  MessageCircleMore,
  UserRound,
} from "lucide-react-native";

import { useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { BouncyPressable } from "@/motion/BouncyPressable";

type AuthView = "signIn" | "signUp";
type AuthField = "displayName" | "email" | "password" | "confirmPassword";

export function AuthScreen() {
  const { showToast } = useToast();
  const { passwordRecovery, clearPasswordRecovery, signOut } = useAuth();
  const [view, setView] = useState<AuthView>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [focusedField, setFocusedField] = useState<AuthField | null>(null);
  const [errorText, setErrorText] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  function goTo(nextView: AuthView) {
    setErrorText("");
    setView(nextView);
  }

  async function submit(mode: AuthView) {
    setErrorText("");
    if (!acceptedTerms) {
      setErrorText("请先勾选用户协议与隐私政策。");
      return;
    }

    setBusy(true);
    const normalizedEmail = email.trim();
    const normalizedName = displayName.trim();

    try {
      if (mode === "signUp") {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              display_name: normalizedName || normalizedEmail.split("@")[0],
            },
          },
        });
        if (error) {
          throw error;
        }
        showToast({
          title: "注册已提交",
          message: "如果当前项目开启了邮箱确认，请先完成邮箱验证后再登录。",
          tone: "success",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) {
          throw error;
        }
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function updateRecoveryPassword() {
    setErrorText("");
    if (password.length < 6) {
      setErrorText("新密码至少需要 6 位。");
      return;
    }
    if (password !== confirmPassword) {
      setErrorText("两次输入的新密码不一致。");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        throw error;
      }
      clearPasswordRecovery();
      setPassword("");
      setConfirmPassword("");
      showToast({ title: "密码已更新", message: "你可以继续使用同频跳动。", tone: "success" });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordReset() {
    const normalizedEmail = email.trim();
    setErrorText("");

    if (!normalizedEmail) {
      setErrorText("请先输入邮箱，再发送重置邮件。");
      return;
    }

    setResetBusy(true);
    try {
      const redirectTo = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        redirectTo ? { redirectTo } : undefined,
      );
      if (error) {
        throw error;
      }
      showToast({
        title: "重置邮件已发送",
        message: "请查看邮箱，并按邮件里的链接设置新密码。",
        tone: "success",
      });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setResetBusy(false);
    }
  }

  const isSignUp = view === "signUp";
  const primaryLabel = passwordRecovery
    ? busy ? "保存中" : "保存新密码"
    : busy ? (isSignUp ? "注册中" : "登录中") : isSignUp ? "注册" : "登录";

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.backgroundClip}>
        <View style={styles.meshBackground}>
          <View style={[styles.ambientWash, styles.ambientWashTop]} />
          <View style={[styles.ambientWash, styles.ambientWashBottom]} />
          <View style={[styles.orbitLine, styles.orbitLineTop]} />
          <View style={[styles.orbitLine, styles.orbitLineBottom]} />
        </View>
      </View>

      <View style={styles.authSurface}>
        <View style={[styles.brandHeader, isSignUp ? styles.brandHeaderCompact : null]}>
          <View style={styles.logoMark}>
            <HeartHandshake color="rgba(210,116,148,0.64)" size={30} strokeWidth={2.25} />
          </View>
          <Text style={styles.brandName}>同频跳动</Text>
        </View>

        <Text style={[styles.title, isSignUp || passwordRecovery ? styles.titleCompact : null]}>
          {passwordRecovery ? "设置新密码" : isSignUp ? "创建账号" : "欢迎回来"}
        </Text>

        <View style={styles.authPanelShell}>
          <View pointerEvents="none" style={[styles.panelShadow, isSignUp ? styles.panelShadowCompact : null]} />
          <View style={[styles.authPanel, isSignUp ? styles.authPanelCompact : null]}>
            <View pointerEvents="none" style={styles.panelShine} />
            {passwordRecovery ? (
              <>
                <AuthFieldRow
                  field="password"
                  focusedField={focusedField}
                  label="新密码"
                  value={password}
                  placeholder="请输入新密码"
                  onChangeText={setPassword}
                  onFieldFocus={setFocusedField}
                  onFieldBlur={setFocusedField}
                  secureTextEntry
                  icon={<LockKeyhole color="rgba(116,105,111,0.42)" size={19} strokeWidth={1.9} />}
                />
                <AuthFieldRow
                  field="confirmPassword"
                  focusedField={focusedField}
                  label="确认新密码"
                  value={confirmPassword}
                  placeholder="请再次输入新密码"
                  onChangeText={setConfirmPassword}
                  onFieldFocus={setFocusedField}
                  onFieldBlur={setFocusedField}
                  secureTextEntry
                  icon={<LockKeyhole color="rgba(116,105,111,0.42)" size={19} strokeWidth={1.9} />}
                />
              </>
            ) : isSignUp ? (
              <AuthFieldRow
                field="displayName"
                focusedField={focusedField}
                label="昵称"
                value={displayName}
                placeholder="请输入昵称"
                onChangeText={setDisplayName}
                onFieldFocus={setFocusedField}
                onFieldBlur={setFocusedField}
                icon={<UserRound color="rgba(116,105,111,0.42)" size={19} strokeWidth={1.9} />}
                compact={isSignUp}
              />
            ) : null}
            {passwordRecovery ? null : (
              <>
                <AuthFieldRow
                  field="email"
                  focusedField={focusedField}
                  label="邮箱/账号"
                  value={email}
                  placeholder="请输入邮箱/账号"
                  onChangeText={setEmail}
                  onFieldFocus={setFocusedField}
                  onFieldBlur={setFocusedField}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  icon={<Mail color="rgba(116,105,111,0.42)" size={19} strokeWidth={1.9} />}
                  compact={isSignUp}
                />
                <AuthFieldRow
                  field="password"
                  focusedField={focusedField}
                  label="密码"
                  value={password}
                  placeholder="请输入密码"
                  onChangeText={setPassword}
                  onFieldFocus={setFocusedField}
                  onFieldBlur={setFocusedField}
                  secureTextEntry
                  icon={<LockKeyhole color="rgba(116,105,111,0.42)" size={19} strokeWidth={1.9} />}
                  compact={isSignUp}
                />
              </>
            )}

            {passwordRecovery ? null : <View style={styles.formMetaRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acceptedTerms }}
                onPress={() => setAcceptedTerms(!acceptedTerms)}
                style={styles.termsRow}
              >
                <View style={[styles.checkbox, acceptedTerms ? styles.checkboxActive : null]}>
                  {acceptedTerms ? <View style={styles.checkboxDot} /> : null}
                </View>
                <Text style={styles.termsText}>同意协议</Text>
              </Pressable>
              {!isSignUp ? (
                <Pressable accessibilityRole="button" disabled={resetBusy} onPress={sendPasswordReset} style={styles.forgotButton}>
                  <Text style={styles.forgotText}>{resetBusy ? "发送中" : "忘记密码?"}</Text>
                </Pressable>
              ) : null}
            </View>}

            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

            <BouncyPressable
              accessibilityRole="button"
              disabled={busy || (passwordRecovery ? !password || !confirmPassword : !email.trim() || !password)}
              disabledStyle={styles.primaryButtonDisabled}
              haptic="light"
              onPress={() => {
                if (passwordRecovery) {
                  void updateRecoveryPassword();
                  return;
                }
                void submit(view);
              }}
              style={styles.primaryButton}
            >
              <View pointerEvents="none" style={styles.primaryButtonGlow} />
              {busy ? <ActivityIndicator color="#fff" size="small" /> : null}
              <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
            </BouncyPressable>

            {passwordRecovery ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  clearPasswordRecovery();
                  void signOut();
                }}
                style={styles.switchModeButton}
              >
                <Text style={styles.switchModeText}>返回登录</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => goTo(isSignUp ? "signIn" : "signUp")} style={styles.switchModeButton}>
                <Text style={styles.switchModeText}>{isSignUp ? "已有账号登录" : "新用户注册"}</Text>
              </Pressable>
            )}

            {passwordRecovery ? null : <View style={styles.socialRow}>
              <SocialButton
                label="微信登录暂未开放"
                onPress={() => showToast({ title: "暂未开放", message: "当前版本先使用邮箱密码登录。", tone: "info" })}
                icon={<MessageCircleMore color="rgba(44,39,42,0.62)" size={20} fill="rgba(44,39,42,0.12)" />}
              />
              <SocialButton
                label="Apple 登录暂未开放"
                onPress={() => showToast({ title: "暂未开放", message: "当前版本先使用邮箱密码登录。", tone: "info" })}
                icon={<Apple color="rgba(44,39,42,0.66)" size={21} fill="rgba(44,39,42,0.66)" />}
              />
              <SocialButton
                label="更多登录暂未开放"
                onPress={() => showToast({ title: "暂未开放", message: "当前版本先使用邮箱密码登录。", tone: "info" })}
                icon={<UserRound color="rgba(44,39,42,0.62)" size={20} />}
              />
            </View>}
          </View>
        </View>
      </View>
    </View>
  );
}

function AuthFieldRow({
  field,
  compact,
  focusedField,
  icon,
  label,
  onFieldBlur,
  onChangeText,
  onFieldFocus,
  placeholder,
  value,
  ...props
}: {
  field: AuthField;
  compact?: boolean;
  focusedField: AuthField | null;
  icon: ReactNode;
  label: string;
  onFieldBlur: (field: AuthField | null) => void;
  onChangeText: (value: string) => void;
  onFieldFocus: (field: AuthField) => void;
  placeholder: string;
  value: string;
} & TextInputProps) {
  const isFocused = focusedField === field;
  return (
    <View style={[styles.fieldGroup, compact ? styles.fieldGroupCompact : null]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputShell, compact ? styles.inputShellCompact : null, isFocused ? styles.inputShellFocused : null]}>
        <View style={styles.inputIcon}>{icon}</View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(121,111,116,0.38)"
          onFocus={() => onFieldFocus(field)}
          onBlur={() => onFieldBlur(null)}
          style={styles.input}
          {...props}
        />
      </View>
    </View>
  );
}

function SocialButton({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <BouncyPressable accessibilityLabel={label} accessibilityRole="button" haptic="selection" onPress={onPress} style={styles.socialButton}>
      {icon}
    </BouncyPressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    minHeight: 720,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 72,
    paddingBottom: 26,
    overflow: "visible",
  },
  backgroundClip: {
    position: "absolute",
    left: -10,
    right: -10,
    top: -72,
    bottom: -26,
    overflow: Platform.OS === "web" ? ("clip" as never) : "hidden",
  },
  meshBackground: {
    position: "absolute",
    left: -24,
    right: -24,
    top: -48,
    bottom: -48,
    backgroundColor: "#fffaf7",
    backgroundImage:
      "linear-gradient(145deg, rgba(255,250,247,0.98) 0%, rgba(255,246,250,0.92) 42%, rgba(250,251,255,0.96) 100%), radial-gradient(70% 56% at 76% 13%, rgba(255,238,211,0.64), rgba(255,238,211,0) 62%), radial-gradient(74% 58% at 22% 82%, rgba(255,216,229,0.38), rgba(255,216,229,0) 66%), radial-gradient(62% 48% at 57% 48%, rgba(230,238,246,0.5), rgba(230,238,246,0) 64%)" as never,
  },
  ambientWash: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.7,
    filter: "blur(32px)" as never,
  },
  ambientWashTop: {
    width: 380,
    height: 300,
    right: -120,
    top: -40,
    backgroundColor: "rgba(255,236,214,0.42)",
  },
  ambientWashBottom: {
    width: 360,
    height: 340,
    left: -110,
    bottom: 18,
    backgroundColor: "rgba(255,215,229,0.26)",
  },
  orbitLine: {
    position: "absolute",
    width: 620,
    height: 620,
    borderRadius: 310,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
  },
  orbitLineTop: {
    right: -370,
    top: -248,
    transform: [{ rotate: "-16deg" }],
  },
  orbitLineBottom: {
    left: -376,
    bottom: -292,
    transform: [{ rotate: "19deg" }],
  },
  authSurface: {
    width: "100%",
    maxWidth: 388,
  },
  authPanelShell: {
    position: "relative",
    borderRadius: 20,
  },
  panelShadow: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 16,
    bottom: -24,
    borderRadius: 22,
    backgroundColor: "rgba(209, 139, 164, 0.14)",
    filter: "blur(24px)" as never,
    opacity: 0.72,
  },
  panelShadowCompact: {
    bottom: -20,
  },
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 42,
  },
  brandHeaderCompact: {
    marginBottom: 20,
  },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.34)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
    boxShadow: "0 8px 24px rgba(238,156,181,0.24), 0 0 18px rgba(255,255,255,0.52), inset 0 1px 1px rgba(255,255,255,0.78)" as never,
  },
  brandName: {
    color: "rgba(67,59,64,0.72)",
    fontSize: 23,
    lineHeight: 30,
    fontWeight: "850" as never,
  },
  title: {
    color: "rgba(48,43,46,0.88)",
    fontSize: 35,
    lineHeight: 43,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 34,
  },
  titleCompact: {
    fontSize: 32,
    lineHeight: 38,
    marginBottom: 18,
  },
  authPanel: {
    position: "relative",
    gap: 13,
    padding: 24,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.34)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    overflow: "hidden",
    boxShadow:
      "0 10px 28px rgba(191, 127, 151, 0.06), inset 0 1px 1px rgba(255,255,255,0.78), inset 0 -1px 1px rgba(159,118,133,0.06)" as never,
    backdropFilter: "blur(24px) saturate(1.15)",
    WebkitBackdropFilter: "blur(24px) saturate(1.15)",
  } as never,
  authPanelCompact: {
    gap: 10,
    paddingVertical: 20,
  },
  panelShine: {
    position: "absolute",
    left: -40,
    right: -40,
    top: -80,
    height: 170,
    backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0))" as never,
    transform: [{ rotate: "-8deg" }],
  },
  fieldGroup: {
    gap: 8,
  },
  fieldGroupCompact: {
    gap: 6,
  },
  fieldLabel: {
    color: "rgba(49,43,47,0.78)",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  inputShell: {
    minHeight: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.66)",
    backgroundColor: "rgba(255,255,255,0.22)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 17,
    boxShadow: "inset 0 1px 1px rgba(255,255,255,0.66), 0 8px 20px rgba(181,128,145,0.06)" as never,
  },
  inputShellCompact: {
    minHeight: 49,
  },
  inputShellFocused: {
    borderColor: "rgba(216,125,153,0.5)",
    backgroundColor: "rgba(255,255,255,0.34)",
    boxShadow:
      "0 0 0 3px rgba(216,125,153,0.08), 0 12px 28px rgba(216,125,153,0.12), inset 0 1px 1px rgba(255,255,255,0.72)" as never,
  },
  inputIcon: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: "rgba(46,40,44,0.88)",
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 0,
    outlineStyle: "none" as never,
    backgroundColor: "transparent",
  },
  formMetaRow: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: -1,
  },
  forgotButton: {
    alignSelf: "flex-end",
    paddingHorizontal: 4,
    paddingVertical: 2,
    outlineStyle: "none" as never,
  },
  forgotText: {
    color: "rgba(146,116,127,0.78)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "right",
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 0,
    outlineStyle: "none" as never,
  },
  checkbox: {
    width: 17,
    height: 17,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(216,125,153,0.28)",
    backgroundColor: "rgba(255,255,255,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: "rgba(222,133,162,0.86)",
    borderColor: "rgba(222,133,162,0.86)",
  },
  checkboxDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
  termsText: {
    color: "rgba(129,112,120,0.72)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#f0a3b7",
    backgroundImage: "linear-gradient(100deg, #f5b2c2 0%, #ee91aa 52%, #ffc8c7 100%)" as never,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
    boxShadow:
      "0 13px 28px rgba(222, 121, 151, 0.34), 0 0 26px rgba(247, 188, 204, 0.44), inset 0 1px 1px rgba(255,255,255,0.55)" as never,
    outlineStyle: "none" as never,
  },
  primaryButtonGlow: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 4,
    height: 22,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  primaryButtonDisabled: {
    opacity: 0.62,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "850" as never,
  },
  switchModeButton: {
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    outlineStyle: "none" as never,
  },
  switchModeText: {
    color: "rgba(92,79,86,0.7)",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  socialRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
    paddingTop: 2,
  },
  socialButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.54)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    boxShadow:
      "0 10px 22px rgba(141, 112, 123, 0.12), inset 0 1px 1px rgba(255,255,255,0.84)" as never,
    outlineStyle: "none" as never,
  },
  errorText: {
    color: "#a45f75",
    backgroundColor: "rgba(255,242,244,0.62)",
    borderColor: "rgba(238,180,193,0.5)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    lineHeight: 18,
    overflow: "hidden",
  },
});
