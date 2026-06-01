import { Send, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Body, Button, EmptyState, Field, H2, Panel, ResponsiveRow, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import type { Message } from "@/lib/supabase/database.types";
import { colors } from "@/styles/theme";

export function MessageBoard({
  coupleId,
  messages,
  onChanged,
}: {
  coupleId: string;
  messages: Message[];
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function send() {
    if (!user || !body.trim()) {
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("messages").insert({
      couple_id: coupleId,
      sender_id: user.id,
      body: body.trim(),
    });
    setBusy(false);
    if (error) {
      showToast({ title: "留言失败", message: error.message, tone: "error" });
      return;
    }
    setBody("");
    showToast({ title: "留言已发送", message: "对方进入空间后就能看到。", tone: "success" });
    onChanged();
  }

  async function remove(message: Message) {
    setDeletingId(message.id);
    const { error } = await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", message.id);
    setDeletingId(null);
    if (error) {
      showToast({ title: "删除失败", message: error.message, tone: "error" });
      return;
    }
    showToast({ title: "留言已删除", tone: "success" });
    onChanged();
  }

  return (
    <Panel style={styles.panel}>
      <H2>留言板</H2>
      <Body>基础版留言只在当前情侣关系内可见，作者可以删除自己的留言。</Body>
      <ResponsiveRow style={styles.composer}>
        <Field value={body} onChangeText={setBody} placeholder="写给对方的一句话" style={styles.input} />
        <Button
          label={busy ? "发送中" : "发送"}
          onPress={send}
          disabled={busy || !body.trim()}
          loading={busy}
          icon={<Send color="#fff" size={16} />}
        />
      </ResponsiveRow>
      <View style={styles.list}>
        {messages.length === 0 ? (
          <EmptyState title="还没有留言" description="写下第一句话，留言板会按时间保存你们的片段。" />
        ) : null}
        {messages.map((message) => (
          <View key={message.id} style={styles.message}>
            <View style={styles.messageTop}>
              <Text style={styles.sender}>{message.sender?.display_name || "匿名用户"}</Text>
              <Text style={styles.time}>{new Date(message.created_at).toLocaleString("zh-CN")}</Text>
              {message.sender_id === user?.id ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={deletingId === message.id}
                  onPress={() => remove(message)}
                  style={[styles.deleteButton, deletingId === message.id ? styles.deleteButtonDisabled : null]}
                >
                  <Trash2 color={deletingId === message.id ? colors.border : colors.faint} size={15} />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.messageBody}>{message.body}</Text>
          </View>
        ))}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 14,
  },
  composer: {
    gap: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
  list: {
    gap: 10,
  },
  message: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 6,
  },
  messageTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  sender: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  time: {
    color: colors.faint,
    fontSize: 12,
    flex: 1,
  },
  deleteButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonDisabled: {
    opacity: 0.55,
  },
  messageBody: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
});
