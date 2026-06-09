import { supabase } from "@/lib/supabase/client";

type MessageServiceError = { message: string };

type SendCoupleMessageParams = {
  coupleId: string;
  senderId: string;
  body: string;
};

type NotifyCoupleMessagePartnerParams = SendCoupleMessageParams;

type SendCoupleMessageWithNotificationParams = SendCoupleMessageParams;

export type NotifyCoupleMessagePartnerResult = {
  notificationError: MessageServiceError | null;
  notificationSkipped: boolean;
};

export type SendCoupleMessageWithNotificationResult = NotifyCoupleMessagePartnerResult & {
  messageError: MessageServiceError | null;
};

export async function createCoupleMessage({
  coupleId,
  senderId,
  body,
}: SendCoupleMessageParams): Promise<{ error: MessageServiceError | null }> {
  const trimmedBody = body.trim();
  if (!trimmedBody) {
    return { error: new Error("留言内容不能为空") };
  }

  try {
    const { error } = await supabase.from("messages").insert({
      couple_id: coupleId,
      sender_id: senderId,
      body: trimmedBody,
    });

    return { error };
  } catch (error) {
    return { error: toServiceError(error, "留言发送失败") };
  }
}

export async function notifyCoupleMessagePartner({
  coupleId,
}: NotifyCoupleMessagePartnerParams): Promise<NotifyCoupleMessagePartnerResult> {
  try {
    const { error: notificationError } = await supabase.rpc("create_partner_notification", {
      target_couple_id: coupleId,
      notification_type: "message",
      notification_title: "你收到了一条留言",
      notification_body: "TA 给你留了一句话，打开看看吧。",
      related_table: "messages",
      related_id: null,
    });

    return {
      notificationError,
      notificationSkipped: Boolean(notificationError),
    };
  } catch (error) {
    return {
      notificationError: toServiceError(error, "留言提醒同步失败"),
      notificationSkipped: true,
    };
  }
}

export async function sendCoupleMessageWithNotification({
  coupleId,
  senderId,
  body,
}: SendCoupleMessageWithNotificationParams): Promise<SendCoupleMessageWithNotificationResult> {
  const { error: messageError } = await createCoupleMessage({ coupleId, senderId, body });
  if (messageError) {
    return {
      messageError,
      notificationError: null,
      notificationSkipped: true,
    };
  }

  const notificationResult = await notifyCoupleMessagePartner({ coupleId, senderId, body });
  return {
    messageError: null,
    ...notificationResult,
  };
}

export async function deleteCoupleMessage(messageId: string): Promise<{ error: MessageServiceError | null }> {
  try {
    const { error } = await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId);

    return { error };
  } catch (error) {
    return { error: toServiceError(error, "留言删除失败") };
  }
}

function toServiceError(error: unknown, fallbackMessage: string): MessageServiceError {
  return error instanceof Error ? error : new Error(fallbackMessage);
}
