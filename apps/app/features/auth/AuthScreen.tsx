import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";

import {
  AppLogo,
  AppTextInput,
  Card,
  PrimaryButton,
  SecondaryButton,
} from "@/components/app-ui/AppUI";
import { useToast } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { colors } from "@/styles/theme";

type AuthView = "splash" | "signIn" | "signUp";

const authHero = require("@/assets/auth-hero.png") as ImageSourcePropType;

export function AuthScreen() {
  const { showToast } = useToast();
  const [view, setView] = useState<AuthView>("splash");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(mode: Exclude<AuthView, "splash">) {
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

  if (view === "splash") {
    return (
      <View style={styles.screen}>
        <View style={styles.backdropWash} />
        <View style={styles.splashHero}>
          <View style={styles.brandMark}>
            <AppLogo size={56} />
            <View style={styles.brandTextBlock}>
              <Text style={styles.brandName}>同频跳动</Text>
              <Text style={styles.brandSub}>只属于两个人</Text>
            </View>
          </View>
          <View style={styles.copyBlock}>
            <Text style={styles.heroTitle}>每一天都是一颗</Text>
            <Text style={styles.appName}>情绪胶囊</Text>
            <Text style={styles.slogan}>奶茶、拥抱、晚安和想念，都可以被两个人慢慢存起来。</Text>
          </View>
          <View style={styles.illustration}>
            <Image source={authHero} style={styles.heroImage} />
            <View style={styles.imageCaption}>
              <Text style={styles.imageCaptionText}>今天也存进记忆</Text>
            </View>
          </View>
        </View>
        <View style={styles.actionStack}>
          <PrimaryButton label="登录" onPress={() => setView("signIn")} />
          <SecondaryButton label="注册新账号" onPress={() => setView("signUp")} />
          <View style={styles.legalRow}>
            <Text style={styles.legalText}>用户协议</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.legalText}>隐私政策</Text>
          </View>
        </View>
      </View>
    );
  }

  const isSignUp = view === "signUp";

  return (
    <View style={styles.screen}>
      <View style={styles.backdropWash} />
      <View style={styles.formHeader}>
        <View style={styles.formTitleBlock}>
          <Text style={styles.title}>{isSignUp ? "创建账号" : "欢迎回来"}</Text>
          <Text style={styles.subtitle}>{isSignUp ? "开启你们的情绪胶囊日记。" : "回来看看你们存下的今天。"}</Text>
        </View>
        <AppLogo size={52} />
      </View>

      <Card style={styles.authCard}>
        {isSignUp ? (
          <AppTextInput value={displayName} onChangeText={setDisplayName} placeholder="昵称（可选）" autoCapitalize="none" />
        ) : null}
        <AppTextInput
          value={email}
          onChangeText={setEmail}
          placeholder="邮箱或手机号"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <AppTextInput value={password} onChangeText={setPassword} placeholder="密码或验证码" secureTextEntry />
        {!isSignUp ? <Text style={styles.forgotText}>忘记密码？</Text> : null}
        <Pressable onPress={() => setAcceptedTerms(!acceptedTerms)} style={styles.termsRow}>
          <View style={[styles.checkbox, acceptedTerms ? styles.checkboxActive : null]} />
          <Text style={styles.termsText}>我已阅读并同意用户协议与隐私政策</Text>
        </Pressable>
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
        <PrimaryButton
          label={busy ? (isSignUp ? "注册中" : "登录中") : isSignUp ? "注册" : "登录"}
          onPress={() => submit(view)}
          disabled={busy || !email.trim() || !password}
          loading={busy}
        />
        <SecondaryButton label={isSignUp ? "已有账号，去登录" : "没有账号，去注册"} onPress={() => setView(isSignUp ? "signIn" : "signUp")} />
        <Pressable onPress={() => setView("splash")} style={styles.backHomeButton}>
          <Text style={styles.backHomeText}>回到首页</Text>
        </Pressable>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    minHeight: 680,
    justifyContent: "center",
    gap: 14,
    paddingVertical: 22,
  },
  backdropWash: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 36,
    bottom: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.34)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.56)",
  },
  splashHero: {
    gap: 15,
    paddingHorizontal: 6,
  },
  brandMark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(243,95,137,0.12)",
  },
  brandTextBlock: {
    gap: 2,
  },
  brandName: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  brandSub: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  copyBlock: {
    alignItems: "center",
    gap: 5,
  },
  heroTitle: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    textAlign: "center",
  },
  appName: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    textAlign: "center",
  },
  slogan: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 320,
    fontWeight: "700",
  },
  authCard: {
    gap: 12,
  },
  actionStack: {
    gap: 12,
    paddingTop: 2,
  },
  illustration: {
    width: "100%",
    aspectRatio: 0.82,
    maxHeight: 350,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.74)",
    borderWidth: 1,
    borderColor: "rgba(243,95,137,0.12)",
    overflow: "hidden",
    shadowColor: "#e58ca4",
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
  },
  heroImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  imageCaption: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    minHeight: 42,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.78)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.74)",
  },
  imageCaptionText: {
    color: colors.accentDark,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  legalText: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "800",
  },
  dot: {
    color: colors.faint,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    padding: 16,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.62)",
    borderWidth: 1,
    borderColor: "rgba(243,95,137,0.1)",
  },
  formTitleBlock: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 270,
  },
  forgotText: {
    color: colors.accentDark,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    textAlign: "right",
  },
  backHomeButton: {
    alignItems: "center",
    paddingTop: 2,
  },
  backHomeText: {
    color: colors.accentDark,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  checkboxActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  termsText: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: colors.accentDark,
    backgroundColor: "#fff2f0",
    borderColor: "#eed2cc",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    lineHeight: 18,
  },
});
