import { CalendarPlus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Body, Button, DateField, EmptyState, Field, H2, Label, Panel, ResponsiveRow, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { formatShortDate } from "@/lib/dates/date";
import { supabase } from "@/lib/supabase/client";
import type { CalendarEvent } from "@/lib/supabase/database.types";
import { colors } from "@/styles/theme";

export function CalendarCard({
  coupleId,
  events,
  onChanged,
}: {
  coupleId: string;
  events: CalendarEvent[];
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function addEvent() {
    if (!user || !title.trim() || !eventDate.trim()) {
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("calendar_events").insert({
      couple_id: coupleId,
      created_by: user.id,
      title: title.trim(),
      event_date: eventDate.trim(),
      type: "other",
    });
    setBusy(false);
    if (error) {
      showToast({ title: "添加失败", message: error.message, tone: "error" });
      return;
    }
    setTitle("");
    setEventDate("");
    showToast({ title: "日历事件已添加", message: "页面会在后台同步最新事件。", tone: "success" });
    onChanged();
  }

  return (
    <Panel style={styles.panel}>
      <H2>情侣日历</H2>
      <Body>V0.1A 先支持基础事件，用于纪念日、约会和待办。</Body>
      <ResponsiveRow style={styles.form}>
        <View style={styles.field}>
          <Label>事件</Label>
          <Field value={title} onChangeText={setTitle} placeholder="例如：第一次见面" />
        </View>
        <View style={styles.field}>
          <Label>日期</Label>
          <DateField value={eventDate} onChangeText={setEventDate} placeholder="选择日期" />
        </View>
        <Button
          label={busy ? "添加中" : "添加"}
          onPress={addEvent}
          disabled={busy || !title.trim() || !eventDate.trim()}
          loading={busy}
          icon={<CalendarPlus color="#fff" size={16} />}
        />
      </ResponsiveRow>
      <View style={styles.events}>
        {events.length === 0 ? <EmptyState title="暂无日历事件" description="添加纪念日、约会或待办后会显示在这里。" /> : null}
        {events.map((event) => (
          <View key={event.id} style={styles.eventRow}>
            <Text style={styles.eventDate}>{formatShortDate(event.event_date)}</Text>
            <Text style={styles.eventTitle}>{event.title}</Text>
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
  form: {
    gap: 10,
    alignItems: "stretch",
  },
  field: {
    minWidth: 0,
    flex: 1,
    gap: 7,
  },
  events: {
    gap: 8,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  eventDate: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "900",
    width: 64,
  },
  eventTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
});
