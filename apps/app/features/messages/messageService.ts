import { createSelfHostMessage, deleteSelfHostMessage } from "@/lib/selfHost/messageApi";

type MessageServiceError = { message: string };

type SendCoupleMessageParams = {
  coupleId: string;
  senderId: string;
  body: string;
  accessToken?: string | null;
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
  accessToken,
  coupleId,
  body,
}: SendCoupleMessageParams): Promise<{ error: MessageServiceError | null }> {
  const trimmedBody = body.trim();
  if (!trimmedBody) {
    return { error: new Error("留言内容不能为空") };
  }

  try {
    if (!accessToken) {
      return { error: new Error("登录状态已过期，请重新登录") };
    }
    await createSelfHostMessage({ accessToken, coupleId, body: trimmedBody });
    return { error: null };
  } catch (error) {
    return { error: toServiceError(error, "留言发送失败") };
  }
}

export async function notifyCoupleMessagePartner({
}: NotifyCoupleMessagePartnerParams): Promise<NotifyCoupleMessagePartnerResult> {
  return {
    notificationError: null,
    notificationSkipped: true,
  };
}

export async function sendCoupleMessageWithNotification({
  accessToken,
  coupleId,
  senderId,
  body,
}: SendCoupleMessageWithNotificationParams): Promise<SendCoupleMessageWithNotificationResult> {
  const { error: messageError } = await createCoupleMessage({ accessToken, coupleId, senderId, body });
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

export async function deleteCoupleMessage(messageId: string, accessToken?: string | null): Promise<{ error: MessageServiceError | null }> {
  try {
    if (!accessToken) {
      return { error: new Error("登录状态已过期，请重新登录") };
    }
    await deleteSelfHostMessage({ accessToken, messageId });
    return { error: null };
  } catch (error) {
    return { error: toServiceError(error, "留言删除失败") };
  }
}

function toServiceError(error: unknown, fallbackMessage: string): MessageServiceError {
  return error instanceof Error ? error : new Error(fallbackMessage);
}
