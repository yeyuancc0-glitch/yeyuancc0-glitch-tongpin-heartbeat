import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";

import { AppTextInput, Card, PrimaryButton, TopBar } from "@/components/app-ui/AppUI";
import { DateField, InlineNotice, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { styles } from "@/features/home/homeStyles";
import { createSelfHostCalendarEvent } from "@/lib/selfHost/calendarApi";
import { colors } from "@/styles/theme";

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onPress} style={styles.backButton}>
      <ChevronLeft color={colors.accentDark} size={20} strokeWidth={2.6} />
    </Pressable>
  );
}

export function AddEventPage({
  coupleId,
  onSaved,
  onBack,
  onMovePetForMemoryEvent,
}: {
  coupleId: string;
  onSaved: () => void;
  onBack: () => void;
  onMovePetForMemoryEvent: (coupleId: string, kind: "photo" | "memory" | "anniversary" | "today_capsule") => Promise<void>;
}) {
  const { session, user } = useAuth();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<"anniversary" | "date" | "birthday" | "other">("anniversary");
  const [remind, setRemind] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!session?.access_token) {
      showToast({ title: "请先登录并绑定另一半", message: "添加事件属于双人功能。", tone: "info" });
      return;
    }
    if (!user || !title.trim() || !date) {
      return;
    }
    setBusy(true);
    try {
      await createSelfHostCalendarEvent({
        accessToken: session.access_token,
        coupleId,
        title: title.trim(),
        eventDate: date,
        type: type === "birthday" ? "other" : type,
        note: note.trim() || null,
        remind,
      });
      void onMovePetForMemoryEvent(coupleId, type === "anniversary" ? "anniversary" : "memory").catch((moveError) => {
        console.warn("Pet memory event sync failed:", moveError instanceof Error ? moveError.message : moveError);
      });
      showToast({ title: "事件已保存", message: remind ? "已加入站内提醒。" : undefined, tone: "success" });
      onSaved();
      onBack();
    } catch (error) {
      showToast({ title: "保存失败", message: error instanceof Error ? error.message : "请稍后重试。", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.stack}>
      <TopBar title="添加事件" subtitle="纪念日、约会和普通小事都可以记录。" left={<BackButton onPress={onBack} />} />
      <Card>
        <AppTextInput value={title} onChangeText={setTitle} placeholder="事件名称" />
        <DateField value={date} onChangeText={setDate} placeholder="选择日期" />
        <View style={styles.typeGrid}>
          {[
            ["anniversary", "纪念日"],
            ["date", "约会"],
            ["birthday", "生日"],
            ["other", "普通"],
          ].map(([key, label]) => (
            <Pressable key={key} onPress={() => setType(key as typeof type)} style={[styles.typeChip, type === key ? styles.typeChipActive : null]}>
              <Text style={[styles.typeText, type === key ? styles.typeTextActive : null]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => setRemind(!remind)} style={styles.remindRow}>
          <View style={[styles.checkbox, remind ? styles.checkboxActive : null]} />
          <Text style={styles.bodyText}>提醒我这个事件</Text>
        </Pressable>
        <InlineNotice tone="info">勾选后会生成站内提醒；系统推送默认关闭，避免普通记录打扰对方。</InlineNotice>
        <AppTextInput value={note} onChangeText={setNote} placeholder="备注（可选）" multiline style={styles.messageInput} />
        <PrimaryButton label={busy ? "保存中" : "保存"} onPress={save} disabled={!title.trim() || !date} loading={busy} />
      </Card>
    </View>
  );
}
