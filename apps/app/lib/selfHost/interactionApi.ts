import { selfHostRequest } from "./apiClient";

type SelfHostQuickInteractionResponse = {
  notificationId?: string;
  notification_id?: string;
  notification?: {
    id: string;
  };
};

export async function sendSelfHostQuickInteraction(input: {
  accessToken: string;
  coupleId: string;
  label: string;
}) {
  const response = await selfHostRequest<SelfHostQuickInteractionResponse>("/api/interactions/quick", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      coupleId: input.coupleId,
      label: input.label,
    },
  });
  const notificationId = response.notificationId ?? response.notification_id ?? response.notification?.id ?? null;
  return { notification_id: notificationId };
}
