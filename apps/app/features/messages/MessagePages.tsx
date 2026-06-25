import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronLeft, MessageCircle, Send, Trash2 } from "lucide-react-native";

import { AppTextInput, Card, EmptyState, MessageCard, PrimaryButton, TopBar } from "@/components/app-ui/AppUI";
import { useToast } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { styles } from "@/features/home/homeStyles";
import { petAnchorProps } from "@/features/home/petDomProps";
import { deleteCoupleMessage, sendCoupleMessageWithNotification } from "@/features/messages/messageService";
import { emptyCopy } from "@/lib/constants/appContent";
import type { Message } from "@/lib/supabase/database.types";
import { BouncyPressable } from "@/motion/BouncyPressable";
import { colors } from "@/styles/theme";

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onPress} style={styles.backButton}>
      <ChevronLeft color={colors.accentDark} size={20} strokeWidth={2.6} />
    </Pressable>
  );
}

export function MessagesPage({
  coupleId,
  messages,
  onChanged,
  onBack,
}: {
  coupleId: string;
  messages: Message[];
  onChanged: () => void;
  onBack: () => void;
}) {
  const { session, user } = useAuth();
  const { showToast } = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function send() {
    if (!user || !body.trim()) {
      return;
    }
    const trimmedBody = body.trim();
    setBusy(true);
    const result = await sendCoupleMessageWithNotification({ accessToken: session?.access_token, coupleId, senderId: user.id, body: trimmedBody }).catch((error: unknown) => ({
      messageError: error instanceof Error ? error : new Error("留言发送失败"),
      notificationError: null,
      notificationSkipped: true,
    })).finally(() => {
      setBusy(false);
    });
    if (result.messageError) {
      showToast({ title: "留言失败", message: result.messageError.message, tone: "error" });
      return;
    }
    setBody("");
    if (result.notificationError) {
      showToast({ title: "留言已发送", message: "但提醒同步失败，对方刷新后仍能看到留言。", tone: "info" });
    } else {
      showToast({ title: "留言已发送", tone: "success" });
    }
    onChanged();
  }

  async function remove(message: Message) {
    setDeletingId(message.id);
    const { error } = await deleteCoupleMessage(message.id, session?.access_token).catch((caughtError: unknown) => ({
      error: caughtError instanceof Error ? caughtError : new Error("留言删除失败"),
    })).finally(() => {
      setDeletingId(null);
    });
    if (error) {
      showToast({ title: "删除失败", message: error.message, tone: "error" });
      return;
    }
    showToast({ title: "留言已删除", tone: "success" });
    onChanged();
  }

  return (
    <View style={styles.stack}>
      <TopBar title="留言" subtitle="把聊天里容易被冲走的话，留在这里。" left={<BackButton onPress={onBack} />} />
      <Card>
        <AppTextInput value={body} onChangeText={setBody} placeholder="新增一条留言" multiline style={styles.messageInput} />
        <PrimaryButton label={busy ? "发送中" : "发送留言"} onPress={send} disabled={!body.trim()} loading={busy} />
      </Card>
      <Card>
        <View {...petAnchorProps("home-message-board", "message-board")} style={styles.messageBoardAnchorWrap}>
          <Text style={styles.sectionTitle}>留言列表</Text>
          {messages.length === 0 ? (
            <EmptyState title={emptyCopy.messages.title} description={emptyCopy.messages.description} />
          ) : (
            messages.map((message) => (
              <MessageCard
                key={message.id}
                author={message.sender?.display_name || "匿名用户"}
                body={message.body}
                time={new Date(message.created_at).toLocaleString("zh-CN")}
                canDelete={message.sender_id === user?.id && deletingId !== message.id}
                onDelete={() => remove(message)}
              />
            ))
          )}
        </View>
      </Card>
    </View>
  );
}

export function HomeMessageBoard({
  coupleId,
  messages,
  currentUserId,
  latestMessage,
  onChanged,
}: {
  coupleId: string;
  messages: Message[];
  currentUserId: string;
  latestMessage: string;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const { session } = useAuth();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function send() {
    if (!currentUserId || !body.trim()) {
      return;
    }
    const trimmedBody = body.trim();
    setBusy(true);
    const result = await sendCoupleMessageWithNotification({ accessToken: session?.access_token, coupleId, senderId: currentUserId, body: trimmedBody }).catch((error: unknown) => ({
      messageError: error instanceof Error ? error : new Error("留言发送失败"),
      notificationError: null,
      notificationSkipped: true,
    })).finally(() => {
      setBusy(false);
    });
    if (result.messageError) {
      showToast({ title: "留言失败", message: result.messageError.message, tone: "error" });
      return;
    }
    setBody("");
    if (result.notificationError) {
      showToast({ title: "留言已发送", message: "但提醒同步失败，对方刷新后仍能看到留言。", tone: "info" });
    } else {
      showToast({ title: "留言已发送", tone: "success" });
    }
    onChanged();
  }

  async function remove(message: Message) {
    setDeletingId(message.id);
    const { error } = await deleteCoupleMessage(message.id, session?.access_token).catch((caughtError: unknown) => ({
      error: caughtError instanceof Error ? caughtError : new Error("留言删除失败"),
    })).finally(() => {
      setDeletingId(null);
    });
    if (error) {
      showToast({ title: "删除失败", message: error.message, tone: "error" });
      return;
    }
    showToast({ title: "留言已删除", tone: "success" });
    onChanged();
  }

  return (
    <Card style={styles.homeMessageBoardCard}>
      <View {...petAnchorProps("home-message-board", "message-board")} style={styles.messageBoardAnchorWrap}>
      <View pointerEvents="none" style={styles.messagePaperFold} />
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>留言板</Text>
        <MessageCircle color={colors.accentDark} size={18} strokeWidth={2.4} />
      </View>
      {messages.length === 0 ? <Text style={styles.bodyText}>{latestMessage}</Text> : null}
      <View style={styles.homeMessageComposer}>
        <View style={styles.homeMessagePaperInput}>
          <View pointerEvents="none" style={styles.messagePaperLines} />
          <AppTextInput value={body} onChangeText={setBody} placeholder="把今天想说的话写在这里" multiline maxLength={200} style={styles.homeMessageInput} />
        </View>
        <View style={styles.homeMessageActionRow}>
          <BouncyPressable accessibilityRole="button" accessibilityLabel="发送留言" onPress={send} disabled={!body.trim() || busy} haptic="success" style={[styles.homeMessageSendButton, !body.trim() || busy ? styles.homeMessageSendButtonDisabled : null]}>
            <Send color="#fff" size={15} strokeWidth={2.4} />
            <Text style={styles.homeMessageSendText}>{busy ? "发送中" : "发送"}</Text>
          </BouncyPressable>
        </View>
      </View>
      {messages.length > 0 ? (
        <View style={styles.homeMessageList}>
          {messages.slice(0, 4).map((message) => (
            <StickyMemoCard
              key={message.id}
              author={message.sender?.display_name || "匿名用户"}
              body={message.body}
              time={new Date(message.created_at).toLocaleString("zh-CN")}
              canDelete={message.sender_id === currentUserId && deletingId !== message.id}
              onDelete={() => remove(message)}
            />
          ))}
        </View>
      ) : null}
      </View>
    </Card>
  );
}

function StickyMemoCard({
  author,
  body,
  time,
  canDelete,
  onDelete,
}: {
  author: string;
  body: string;
  time: string;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  return (
    <View style={styles.stickyMemoCard}>
      <View pointerEvents="none" style={styles.stickyMemoTape} />
      <View style={styles.stickyMemoTop}>
        <Text style={styles.stickyMemoAuthor}>{author}</Text>
        <Text style={styles.stickyMemoMeta}>{time}</Text>
      </View>
      <Text style={styles.stickyMemoBody}>{body}</Text>
      {canDelete ? (
        <BouncyPressable accessibilityRole="button" onPress={onDelete} haptic="selection" style={styles.stickyMemoDelete}>
          <Trash2 color={colors.accentDark} size={12} strokeWidth={2.8} />
          <Text style={styles.stickyMemoDeleteText}>删除</Text>
        </BouncyPressable>
      ) : null}
    </View>
  );
}
