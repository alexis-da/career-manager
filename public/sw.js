// Late Winner's service worker. No offline game: it needs its server. It keeps one page, offline.html, and shows it when
// a page of the game cannot be loaded for want of a connection; every other request goes to the network as it would
// without it. Its fetch handler is what lets a browser offer to install the game. Registered by app/_components/app-shell.tsx.

const CACHE = "late-winner-offline-v1";
const OFFLINE_PAGE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_PAGE, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      // The page's request leaves while the worker starts: no wait on a navigation.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") {
    return;
  }
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) || (await fetch(event.request));
      } catch {
        return (await caches.match(OFFLINE_PAGE)) || Response.error();
      }
    })(),
  );
});
