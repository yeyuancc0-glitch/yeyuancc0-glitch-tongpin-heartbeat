import { CircleCheck } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Body, Button, EmptyState, Field, H2, Panel, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { todayIsoDate } from "@/lib/dates/date";
import { supabase } from "@/lib/supabase/client";
import type { Checkin } from "@/lib/supabase/database.types";
import { colors } from "@/styles/theme";

export function CheckinCard({
  coupleId,
  checkins,
  onChanged,
}: {
  coupleId: string;
  checkins: Checkin[];
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const today = todayIsoDate();
  const mineToday = checkins.find((item) => item.user_id === user?.id && item.checkin_date === today);

  async function save() {
    if (!user) {
      return;
    }

    setBusy(true);
    try {
      const insertPayload = {
        couple_id: coupleId,
        user_id: user.id,
        checkin_date: today,
        content: content.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const result = mineToday
        ? await supabase
            .from("checkins")
            .update({
              checkin_date: today,
              content: content.trim() || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", mineToday.id)
        : await supabase.from("checkins").insert(insertPayload);

      if (result.error) {
        showToast({ title: "分享失败", message: result.error.message, tone: "error" });
        return;
      }
      setContent("");
      showToast({
        title: mineToday ? "今日分享已更新" : "今日已分享",
        message: "页面会在后台同步最新记录。",
        tone: "success",
      });
      onChanged();
    } catch (error) {
      showToast({ title: "分享失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel style={styles.panel}>
      <View style={styles.header}>
        <View>
          <H2>今日分享</H2>
          <Body>{mineToday ? "你今天已经分享，可以继续更新内容。" : "写一句今天想留下的话。"}</Body>
        </View>
        <View style={[styles.status, mineToday ? styles.statusDone : null]}>
          <CircleCheck color={mineToday ? colors.green : colors.faint} size={18} />
          <Text style={[styles.statusText, mineToday ? styles.statusTextDone : null]}>
            {mineToday ? "已分享" : "未分享"}
          </Text>
        </View>
      </View>
      <Field
        value={content}
        onChangeText={setContent}
        placeholder={mineToday?.content || "今天一起记下什么？"}
        multiline
        style={styles.textarea}
      />
      <Button
        label={busy ? "保存中" : mineToday ? "更新分享" : "完成今日分享"}
        onPress={save}
        disabled={busy}
        loading={busy}
      />
      <View style={styles.history}>
        {checkins.length === 0 ? (
          <EmptyState title="还没有分享记录" description="完成今天的第一次分享后，这里会保留最近记录。" />
        ) : (
          checkins.slice(0, 4).map((item) => (
            <View key={item.id} style={styles.historyRow}>
              <Text style={styles.historyDate}>{item.checkin_date}</Text>
              <Text style={styles.historyText}>{item.content || "完成了分享"}</Text>
            </View>
          ))
        )}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  status: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#f7f1ef",
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 34,
  },
  statusDone: {
    backgroundColor: "#eaf4ef",
  },
  statusText: {
    color: colors.faint,
    fontSize: 13,
    fontWeight: "800",
  },
  statusTextDone: {
    color: colors.green,
  },
  textarea: {
    height: 92,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  history: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  historyRow: {
    paddingVertical: 10,
    gap: 3,
  },
  historyDate: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: "700",
  },
  historyText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
});
