import { HeartHandshake } from "lucide-react-native";
import { useState } from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";

import { Button, Field, H1, Label, Panel, Body } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { colors } from "@/styles/theme";

function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export function AuthScreen() {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
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
        notify("注册已提交", "如果当前 Supabase 项目开启了邮箱确认，请先完成邮箱验证后再登录。");
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
      notify("操作失败", error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <View style={styles.mark}>
          <HeartHandshake color={colors.accent} size={30} strokeWidth={2.4} />
        </View>
        <H1>同频跳动</H1>
        <Body style={styles.lead}>一个只属于两个人的日常记录空间。先绑定，再把分享、留言和纪念日放在同一个地方。</Body>
      </View>

      <Panel style={styles.card}>
        <Text style={styles.cardTitle}>{mode === "signIn" ? "登录" : "创建账号"}</Text>
        <View style={styles.form}>
          {mode === "signUp" ? (
            <View style={styles.fieldGroup}>
              <Label>昵称</Label>
              <Field value={displayName} onChangeText={setDisplayName} placeholder="例如：小满" autoCapitalize="none" />
            </View>
          ) : null}
          <View style={styles.fieldGroup}>
            <Label>邮箱</Label>
            <Field
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Label>密码</Label>
            <Field value={password} onChangeText={setPassword} placeholder="至少 6 位" secureTextEntry />
          </View>
          <Button label={mode === "signIn" ? "登录" : "注册"} onPress={submit} disabled={busy || !email || !password} />
        </View>
        <Button
          label={mode === "signIn" ? "没有账号，去注册" : "已有账号，去登录"}
          variant="ghost"
          onPress={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
        />
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 640,
    justifyContent: "center",
    gap: 24,
    paddingVertical: 32,
  },
  hero: {
    gap: 14,
    maxWidth: 620,
  },
  mark: {
    width: 58,
    height: 58,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  lead: {
    maxWidth: 560,
    fontSize: 17,
    lineHeight: 26,
  },
  card: {
    maxWidth: 460,
    width: "100%",
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    marginBottom: 16,
  },
  form: {
    gap: 14,
  },
  fieldGroup: {
    gap: 7,
  },
});
