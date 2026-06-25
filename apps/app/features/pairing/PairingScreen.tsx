import { Copy, Link as LinkIcon, Send } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Reanimated from "react-native-reanimated";

import {
  AppTextInput,
  Card,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  TopBar,
} from "@/components/app-ui/AppUI";
import { DateField, InlineNotice, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { localIsoDate } from "@/lib/dates/date";
import { acceptSelfHostPairInvite, createSelfHostPairInvite, type SelfHostInvite } from "@/lib/selfHost/relationshipApi";
import type { PairInvite } from "@/lib/supabase/database.types";
import { useErrorShake } from "@/motion/useErrorShake";
import { colors } from "@/styles/theme";

export function PairingScreen({
  pendingInvites,
  onChanged,
}: {
  pendingInvites: PairInvite[];
  onChanged: () => void;
}) {
  const { session, user } = useAuth();
  const { showToast } = useToast();
  const [inviteCode, setInviteCode] = useState("");
  const [mode, setMode] = useState<"invite" | "accept">("invite");
  const [relationshipStartDate, setRelationshipStartDate] = useState(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem("temp_love_start_date") || "";
    }
    return "";
  });
  const [creating, setCreating] = useState(false);
  const [binding, setBinding] = useState(false);
  const [bound, setBound] = useState(false);
  const [createdSelfHostInvite, setCreatedSelfHostInvite] = useState<SelfHostInvite | null>(null);
  const { triggerShake, shakeStyle } = useErrorShake();
  const latestInvite = createdSelfHostInvite
    ? {
        id: createdSelfHostInvite.id,
        code: createdSelfHostInvite.inviteCode,
        created_by: createdSelfHostInvite.inviterUserId,
        accepted_by: createdSelfHostInvite.acceptedByUserId,
        status: createdSelfHostInvite.status,
        expires_at: createdSelfHostInvite.expiresAt,
        created_at: createdSelfHostInvite.createdAt,
        accepted_at: createdSelfHostInvite.acceptedAt,
      } satisfies PairInvite
    : pendingInvites[0];

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const inviteParam = params.get("invite")?.trim().toUpperCase();
    if (!inviteParam) {
      return;
    }
    setInviteCode(inviteParam);
    setMode("accept");
  }, []);

  async function createInvite() {
    if (!user) {
      return;
    }

    setCreating(true);
    try {
      if (!session?.access_token) {
        throw new Error("登录状态已过期，请重新登录。");
      }
      const result = await createSelfHostPairInvite(session.access_token);
      setCreatedSelfHostInvite(result.invite);
      showToast({ title: "邀请码已创建", message: "复制给 TA，对方输入后即可绑定。", tone: "success" });
    } catch (error) {
      triggerShake();
      showToast({ title: "创建邀请码失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setCreating(false);
    }
  }

  async function acceptInvite() {
    setBinding(true);
    try {
      if (!session?.access_token) {
        throw new Error("登录状态已过期，请重新登录。");
      }
      await acceptSelfHostPairInvite({
        accessToken: session.access_token,
        inviteCode: inviteCode.trim().toUpperCase(),
        relationshipStartedAt: relationshipStartDate || localIsoDate(),
      });
      setInviteCode("");
      showToast({ title: "绑定成功", message: "你们的情侣空间已经创建。", tone: "success" });
      setBound(true);
      setTimeout(onChanged, 900);
    } catch (error) {
      triggerShake();
      showToast({ title: "绑定失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setBinding(false);
    }
  }

  async function copyInvite(code: string) {
    const inviteLink = Platform.OS === "web" ? `${window.location.origin}/?invite=${code}` : code;
    if (Platform.OS === "web" && navigator.clipboard) {
      await navigator.clipboard.writeText(inviteLink);
      showToast({ title: "已复制", message: "邀请码或邀请链接已经复制。", tone: "success" });
      return;
    }
    showToast({ title: "邀请码", message: inviteLink, tone: "info" });
  }

  return (
    <View style={styles.wrap}>
      {bound ? (
        <Card soft style={styles.successCard}>
          <View style={styles.successAvatarRow}>
            <View style={styles.successAvatar} />
            <Text style={styles.successHeart}>♡</Text>
            <View style={styles.successAvatarAlt} />
          </View>
          <Text style={styles.successMark}>✓</Text>
          <Text style={styles.cardTitle}>绑定成功</Text>
          <Text style={styles.cardText}>你们的情侣空间已经准备好，正在进入首页。</Text>
          <PrimaryButton label="进入首页" onPress={onChanged} />
        </Card>
      ) : null}
      <TopBar title="绑定另一半" subtitle="选择一个方式建立只属于你们的空间。" />
      <View style={styles.modeRow}>
        <SecondaryButton label="我来邀请 TA" active={mode === "invite"} onPress={() => setMode("invite")} />
        <SecondaryButton label="我已有邀请码" active={mode === "accept"} onPress={() => setMode("accept")} />
      </View>

      {mode === "invite" ? (
        <Reanimated.View style={shakeStyle}>
        <Card>
          <View style={styles.envelopeArt}>
            <Text style={styles.envelopeText}>✉</Text>
          </View>
          <Text style={styles.cardTitle}>我来邀请 TA</Text>
          <Text style={styles.cardText}>生成邀请码后，发给对方输入即可完成绑定。邀请码默认 7 天有效。</Text>
          {latestInvite ? (
            <View style={styles.inviteBox}>
              <Text style={styles.inviteCode}>{latestInvite.code}</Text>
              <Text style={styles.cardText}>有效期至 {new Date(latestInvite.expires_at).toLocaleString("zh-CN")}</Text>
              <InlineNotice tone="info">等待对方加入中...</InlineNotice>
              <SecondaryButton label="复制邀请码" onPress={() => copyInvite(latestInvite.code)} icon={<Copy color={colors.accentDark} size={16} />} />
              <SecondaryButton label="分享邀请链接" onPress={() => copyInvite(latestInvite.code)} icon={<Send color={colors.accentDark} size={16} />} />
            </View>
          ) : (
            <EmptyState title="还没有邀请码" description="点击下方按钮生成一组新的情侣邀请码。" />
          )}
          <PrimaryButton
            label={creating ? "生成中" : latestInvite ? "重新生成邀请码" : "生成邀请码"}
            onPress={createInvite}
            loading={creating}
          />
        </Card>
        </Reanimated.View>
      ) : (
        <Reanimated.View style={shakeStyle}>
        <Card>
          <View style={styles.codeArt}>
            <Text style={styles.codeArtText}>A7K92Q</Text>
          </View>
          <Text style={styles.cardTitle}>我已有邀请码</Text>
          <Text style={styles.cardText}>输入 TA 发来的邀请码，系统会用事务创建情侣关系。</Text>
          <AppTextInput value={inviteCode} onChangeText={setInviteCode} placeholder="例如 ABCD2345" autoCapitalize="characters" />
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>你们的恋爱开始日期</Text>
            <DateField value={relationshipStartDate} onChangeText={setRelationshipStartDate} placeholder="选择日期" />
          </View>
          {binding ? <InlineNotice tone="info">正在校验邀请码并创建情侣关系...</InlineNotice> : null}
          <PrimaryButton
            label={binding ? "绑定中" : "绑定并继续"}
            onPress={acceptInvite}
            disabled={inviteCode.trim().length < 6 || !relationshipStartDate}
            loading={binding}
            icon={<LinkIcon color="#fff" size={16} />}
          />
        </Card>
        </Reanimated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 18,
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
  },
  envelopeArt: {
    alignSelf: "center",
    width: 120,
    height: 88,
    borderRadius: 26,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: "rgba(243,95,137,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  envelopeText: {
    fontSize: 42,
    color: colors.accentDark,
  },
  codeArt: {
    borderRadius: 22,
    backgroundColor: "#f7f0ff",
    borderWidth: 1,
    borderColor: "#eadfff",
    paddingVertical: 18,
    alignItems: "center",
  },
  codeArtText: {
    color: "#8f80de",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: 3,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
  },
  cardText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  inviteBox: {
    gap: 12,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  inviteCode: {
    color: colors.accentDark,
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: 4,
    fontWeight: "900",
    textAlign: "center",
    backgroundColor: colors.cream,
    borderRadius: 24,
    paddingVertical: 16,
    overflow: "hidden",
  },
  successCard: {
    alignItems: "center",
  },
  successAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  successAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accentSoft,
    borderWidth: 3,
    borderColor: "#fff",
  },
  successAvatarAlt: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.cream,
    borderWidth: 3,
    borderColor: "#fff",
  },
  successHeart: {
    color: colors.accentDark,
    fontSize: 28,
    fontWeight: "900",
  },
  successMark: {
    width: 58,
    height: 58,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#eef8f2",
    color: colors.green,
    textAlign: "center",
    fontSize: 34,
    lineHeight: 58,
    fontWeight: "900",
  },
});
