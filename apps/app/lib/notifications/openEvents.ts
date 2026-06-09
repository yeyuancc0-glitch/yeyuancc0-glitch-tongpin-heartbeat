import * as Notifications from "expo-notifications";

import {
  notifyNotificationOpen,
  subscribeNotificationOpen,
  toNotificationOpenEvent,
  type NotificationOpenEvent,
} from "./openEventsShared";

export { subscribeNotificationOpen };
export type { NotificationOpenEvent };

export function registerNotificationOpenBridge() {
  let removed = false;
  let subscription: { remove: () => void } | null = null;

  subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    notifyNotificationOpen(toNotificationOpenEvent(response.notification.request.content.data));
  });
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (!removed && response) {
        notifyNotificationOpen(toNotificationOpenEvent(response.notification.request.content.data));
      }
    })
    .catch((error) => {
      console.warn("Last notification response read failed:", error);
    });

  return {
    remove: () => {
      removed = true;
      subscription?.remove();
    },
  };
}
