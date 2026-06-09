import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronLeft, Heart, Mail, Send, Trash2 } from "lucide-react-native";

import { AppTextInput, Card, CoupleAvatarGroup, EmptyState, PrimaryButton, SecondaryButton, TopBar } from "@/components/app-ui/AppUI";
import { DateField, useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { styles } from "@/features/home/homeStyles";
import { todayIsoDate } from "@/lib/dates/date";
import { supabase } from "@/lib/supabase/client";
import type { LetterPreview } from "@/lib/supabase/database.types";
import { colors } from "@/styles/theme";

type PersonSummary = { name: string; initial: string; avatarUrl?: string | null };

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onPress} style={styles.backButton}>
      <ChevronLeft color={colors.accentDark} size={20} strokeWidth={2.6} />
    </Pressable>
  );
}

function formatMemoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replaceAll("-", ".");
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

export function WriteLetterPage({
  coupleId,
  partner,
  onSaved,
  onBack,
  onMovePetForLetterDelivery,
}: {
  coupleId: string;
  partner: PersonSummary;
  onSaved: () => void;
  onBack: () => void;
  onMovePetForLetterDelivery: (coupleId: string, mode: "now" | "later") => Promise<void>;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"now" | "later">("now");
  const [deliverDate, setDeliverDate] = useState(todayIsoDate());
  const [busy, setBusy] = useState(false);

  async function sendLetter() {
    if (!user || !body.trim()) {
      return;
    }
    setBusy(true);
    try {
      const { data: members, error: membersError } = await supabase.from("couple_members").select("user_id").eq("couple_id", coupleId).is("left_at", null);
      if (membersError) {
        throw membersError;
      }
      const recipient = members?.find((member) => member.user_id !== user.id);
      if (!recipient) {
        showToast({ title: "发送失败", message: "没有找到当前关系里的收信人。", tone: "error" });
        return;
      }
      const deliverAt = mode === "now" ? new Date().toISOString() : new Date(`${deliverDate}T08:00:00`).toISOString();
      const { error } = await supabase.rpc("create_future_letter", {
        target_couple_id: coupleId,
        recipient_id: recipient.user_id,
        letter_title: title.trim() || "一封写给你的信",
        letter_body: body.trim(),
        unlock_at: deliverAt,
      });
      if (error) {
        throw error;
      }
      void onMovePetForLetterDelivery(coupleId, mode).catch((moveError) => {
        console.warn("Pet letter delivery sync failed:", moveError instanceof Error ? moveError.message : moveError);
      });
      showToast({ title: mode === "now" ? "信已送达" : "信已寄出", message: "TA 会在来信提醒和记忆里看到它。", tone: "success" });
      onSaved();
      onBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : "请稍后重试。";
      showToast({ title: "发送失败", message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.stack}>
      <TopBar title="写一封信" subtitle={`写给 ${partner.name}，可以现在送达，也可以寄到未来。`} left={<BackButton onPress={onBack} />} />
      <Card soft style={styles.letterComposeHero}>
        <CoupleAvatarGroup me={{ name: "我", initial: "我" }} partner={partner} size={54} />
        <View style={styles.letterEnvelopePreview}>
          <Mail color={colors.accentDark} size={32} strokeWidth={2.4} />
        </View>
      </Card>
      <Card>
        <AppTextInput value={title} onChangeText={setTitle} placeholder="信的标题（可选）" />
        <AppTextInput value={body} onChangeText={setBody} placeholder="写下想让 TA 收到的话" multiline style={styles.letterInput} />
        <View style={styles.modeRow}>
          <SecondaryButton label="立即送达" active={mode === "now"} onPress={() => setMode("now")} icon={<Send color={mode === "now" ? "#fff" : colors.accentDark} size={16} />} />
          <SecondaryButton label="寄到未来" active={mode === "later"} onPress={() => setMode("later")} icon={<Mail color={mode === "later" ? "#fff" : colors.accentDark} size={16} />} />
        </View>
        {mode === "later" ? <DateField value={deliverDate} onChangeText={setDeliverDate} placeholder="选择送达日期" /> : null}
        <PrimaryButton label={busy ? "投递中" : mode === "now" ? "送达这封信" : "寄出这封信"} onPress={sendLetter} disabled={!body.trim()} loading={busy} />
      </Card>
    </View>
  );
}

export function LetterInboxPage({
  letters,
  me,
  partner,
  onBack,
  onReply,
  onChanged,
}: {
  letters: LetterPreview[];
  me: PersonSummary;
  partner: PersonSummary;
  onBack: () => void;
  onReply: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState(letters[0]?.id ?? "");
  const selected = letters.find((letter) => letter.id === selectedId) ?? letters[0];
  const isMine = selected?.author_id === user?.id;
  const canRead = Boolean(selected && (!selected.is_locked || isMine));
  const from = isMine ? me : partner;

  useEffect(() => {
    if (!selectedId || !letters.some((letter) => letter.id === selectedId)) {
      setSelectedId(letters[0]?.id ?? "");
    }
  }, [letters, selectedId]);

  async function dismiss(letter: LetterPreview) {
    const { error } = await supabase.rpc("dismiss_letter", { letter_id: letter.id });
    if (error) {
      showToast({ title: "关闭失败", message: error.message, tone: "error" });
      return;
    }
    showToast({ title: "已收下这封信", message: "它仍会留在记忆里的小信封中。", tone: "success" });
    onChanged();
  }

  async function markRead(letter: LetterPreview) {
    if (!letter.is_locked && !isMine) {
      await supabase.rpc("mark_letter_read", { letter_id: letter.id });
    }
    onChanged();
  }

  async function deleteLetter(letter: LetterPreview) {
    const { error } = await supabase.rpc("delete_letter", { letter_id: letter.id });
    if (error) {
      showToast({ title: "删除失败", message: error.message, tone: "error" });
      return;
    }
    const nextLetter = letters.find((item) => item.id !== letter.id);
    setSelectedId(nextLetter?.id ?? "");
    showToast({
      title: "信件已删除",
      message: isMine ? "这封信已从双方的来信和记忆中移除。" : "这封信已从你的来信和记忆中移除。",
      tone: "success",
    });
    onChanged();
  }

  return (
    <View style={styles.stack}>
      <TopBar title="来信" subtitle="那些没有被聊天冲走的话，都放在这里。" left={<BackButton onPress={onBack} />} />
      {letters.length === 0 ? (
        <Card>
          <EmptyState title="还没有信" description="写一封信给 TA，它会成为记忆里的小信封。" />
          <PrimaryButton label="写一封情书" onPress={onReply} icon={<Send color="#fff" size={16} />} />
        </Card>
      ) : null}
      {letters.length > 1 ? (
        <View style={styles.memoryFilterRow}>
          {letters.slice(0, 6).map((letter) => (
            <Pressable key={letter.id} onPress={() => setSelectedId(letter.id)} style={[styles.memoryFilterChip, selected?.id === letter.id ? styles.memoryFilterChipActive : null]}>
              <Text style={[styles.memoryFilterText, selected?.id === letter.id ? styles.memoryFilterTextActive : null]}>{letter.is_locked ? "待开启" : "可阅读"}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {selected ? (
        <Card soft style={styles.letterReminderCard}>
          <View style={styles.letterGlow} />
          <View style={styles.letterSenderRow}>
            <CoupleAvatarGroup me={from} partner={isMine ? partner : me} size={46} />
          </View>
          <View style={[styles.letterEnvelope, canRead ? styles.letterEnvelopeOpen : null]}>
            <Mail color={colors.accentDark} size={44} strokeWidth={2.3} />
          </View>
          <Text style={styles.letterReminderTitle}>{canRead ? selected.title : "有一封信正在等你"}</Text>
          <Text style={styles.letterReminderMeta}>
            {isMine ? "你写出的信" : `${selected.author_display_name || partner.name} 写给你的信`} · {formatMemoryDate(selected.deliver_at)}
          </Text>
          <Text style={styles.letterReminderBody}>
            {canRead ? selected.body || "这封信安静地留在这里。" : `还没到打开时间。等到 ${new Date(selected.deliver_at).toLocaleDateString("zh-CN")}，它会完整展开。`}
          </Text>
          <View style={styles.letterActionRow}>
            {canRead ? <SecondaryButton label="存入记忆" onPress={() => void markRead(selected)} icon={<Heart color={colors.accentDark} size={16} />} /> : null}
            {canRead && !isMine ? <SecondaryButton label="回复一封" onPress={onReply} icon={<Send color={colors.accentDark} size={16} />} /> : null}
            {!isMine ? <SecondaryButton label={canRead ? "关闭" : "先收下"} onPress={() => void dismiss(selected)} icon={<Mail color={colors.accentDark} size={16} />} /> : null}
            <SecondaryButton label="删除" danger onPress={() => void deleteLetter(selected)} icon={<Trash2 color={colors.accentDark} size={16} />} />
            <SecondaryButton label={canRead ? "关闭" : "稍后再看"} onPress={onBack} />
          </View>
        </Card>
      ) : null}
    </View>
  );
}
