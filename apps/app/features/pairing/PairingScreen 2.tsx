import { Copy, Link as LinkIcon, Plus } from "lucide-react-native";
import { useState } from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";

import { Body, Button, EmptyState, Field, H2, Label, Panel } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import type { PairInvite } from "@/lib/supabase/database.types";
import { colors } from "@/styles/theme";

function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function PairingScreen({
  pendingInvites,
  onChanged,
}: {
  pendingInvites: PairInvite[];
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function createInvite() {
    if (!user) {
      return;
    }

    setBusy(true);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error } = await supabase.from("pair_invites").insert({
      created_by: user.id,
      code: makeCode(),
      expires_at: expiresAt.toISOString(),
    });

    setBusy(false);
    if (error) {
      notify("创建邀请码失败", error.message);
      return;
    }
    onChanged();
  }

  async function acceptInvite() {
    setBusy(true);
    const { error } = await supabase.rpc("accept_pair_invite", {
      invite_code: inviteCode.trim().toUpperCase(),
    });
    setBusy(false);

    if (error) {
      notify("绑定失败", error.message);
      return;
    }
    setInviteCode("");
    onChanged();
  }

  async function copyInvite(code: string) {
    const inviteLink = Platform.OS === "web" ? `${window.location.origin}/?invite=${code}` : code;
    if (Platform.OS === "web" && navigator.clipboard) {
      await navigator.clipboard.writeText(inviteLink);
      notify("已复制", "邀请码或邀请链接已经复制。");
      return;
    }
    notify("邀请码", inviteLink);
  }

  return (
    <View style={styles.wrap}>
      <Panel style={styles.panel}>
        <EmptyState title="还没有绑定另一半" description="创建邀请码发给对方，或输入对方的邀请码完成绑定。" />
        <Button
          label="创建邀请码"
          onPress={createInvite}
          disabled={busy}
          icon={<Plus color="#fff" size={18} strokeWidth={2.4} />}
        />
      </Panel>

      <Panel style={styles.panel}>
        <H2>输入邀请码</H2>
        <Body>邀请码接受成功后，系统会用事务创建情侣关系和双方成员记录。</Body>
        <View style={styles.inlineForm}>
          <Field
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder="例如：ABCD2345"
            autoCapitalize="characters"
            style={styles.codeInput}
          />
          <Button label="绑定" onPress={acceptInvite} disabled={busy || inviteCode.trim().length < 6} />
        </View>
      </Panel>

      <Panel style={styles.panel}>
        <H2>我的待接受邀请码</H2>
        {pendingInvites.length === 0 ? (
          <Body>暂无 pending 邀请。邀请码默认 7 天有效。</Body>
        ) : (
          <View style={styles.inviteList}>
            {pendingInvites.map((invite) => (
              <View key={invite.id} style={styles.inviteRow}>
                <View style={styles.codeBadge}>
                  <LinkIcon color={colors.accentDark} size={16} />
                  <Text style={styles.code}>{invite.code}</Text>
                </View>
                <View style={styles.inviteMeta}>
                  <Label>有效期至</Label>
                  <Body>{new Date(invite.expires_at).toLocaleString("zh-CN")}</Body>
                </View>
                <Button
                  label="复制"
                  variant="secondary"
                  onPress={() => copyInvite(invite.code)}
                  icon={<Copy color={colors.accentDark} size={16} />}
                />
              </View>
            ))}
          </View>
        )}
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
  },
  panel: {
    gap: 14,
  },
  inlineForm: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  codeInput: {
    flex: 1,
    minWidth: 220,
  },
  inviteList: {
    gap: 10,
  },
  inviteRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  codeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  code: {
    color: colors.accentDark,
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 1,
  },
  inviteMeta: {
    flex: 1,
    minWidth: 180,
  },
});
