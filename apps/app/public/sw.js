self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "同频跳动",
      body: event.data ? event.data.text() : "你有一条新提醒。",
    };
  }

  const title = payload.title || "同频跳动";
  const expiresAt = Date.parse(payload.expiresAt || "");

  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    return;
  }

  const sentAt = Date.parse(payload.sentAt || "");
  const options = {
    body: payload.body || "你有一条新提醒。",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.notificationId || undefined,
    renotify: true,
    timestamp: Number.isFinite(sentAt) ? sentAt : Date.now(),
    data: {
      url: payload.url || "/",
      notificationId: payload.notificationId || null,
      type: payload.type || null,
      relatedTable: payload.relatedTable || null,
      relatedId: payload.relatedId || null,
      sentAt: payload.sentAt || null,
      expiresAt: payload.expiresAt || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && new URL(client.url).origin === self.location.origin) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
