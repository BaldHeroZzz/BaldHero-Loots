
const CACHE_NAME = "dqr-drops-v1";

const APP_FILES = [
  "/",
  "/manifest.json",
  "/icons/dqr-icon-192.png",
  "/icons/dqr-icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith("dqr-drops-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Never cache live Discord drop data.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Network-first for website navigation.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache =>
            cache.put("/", copy)
          );
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Cache-first for app files and images.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache =>
            cache.put(request, copy)
          );
        }
        return response;
      });
    })
  );
});

self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = {
      body: event.data ? event.data.text() : "A new drop has arrived!"
    };
  }

  const title = data.title || "⚔️ DQR Drop Alert";

  const options = {
    body: data.body || "A new drop has arrived!",
    tag: data.tag || "dqr-drop",
    renotify: true,
    data: {
      url: data.url || "/"
    },
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clients => {
      for (const client of clients) {
        if (
          client.url.startsWith(self.location.origin) &&
          "focus" in client
        ) {
          client.navigate(target);
          return client.focus();
        }
      }

      return self.clients.openWindow(target);
    })
  );
});
