import {
  notifyNotificationOpen,
  subscribeNotificationOpen,
  toNotificationOpenEvent,
  type NotificationOpenEvent,
} from "./openEventsShared";

export { subscribeNotificationOpen };
export type { NotificationOpenEvent };

const notificationOpenEventName = "tongpin:notification-open";

export function registerNotificationOpenBridge() {
  if (typeof window === "undefined") {
    return { remove: () => {} };
  }

  const handleWindowEvent = (event: Event) => {
    notifyNotificationOpen(toNotificationOpenEvent((event as CustomEvent).detail));
  };
  const handleServiceWorkerMessage = (event: MessageEvent) => {
    const message = event.data;
    if (!message || typeof message !== "object" || message.type !== notificationOpenEventName) {
      return;
    }
    notifyNotificationOpen(toNotificationOpenEvent(message.payload));
  };

  window.addEventListener(notificationOpenEventName, handleWindowEvent);
  navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

  return {
    remove: () => {
      window.removeEventListener(notificationOpenEventName, handleWindowEvent);
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
    },
  };
}
