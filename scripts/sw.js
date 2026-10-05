const shellFiles = __SHELL_FILES__;
const scope = self.registration.scope;
const cachePrefix = `yourweek-shell:${scope}:`;
const cacheName = `${cachePrefix}__SHELL_VERSION__`;
const shellURLs = new Set(shellFiles.map((file) => new URL(file, scope).href));
const indexURL = new URL("index.html", scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(cacheName);
        await cache.addAll(
          [...shellURLs].map((url) => new Request(url, { cache: "reload" })),
        );
      } catch (error) {
        await caches.delete(cacheName);
        throw error;
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(cachePrefix) && name !== cacheName)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!url.href.startsWith(scope)) return;
  const key = request.mode === "navigate" ? indexURL : url.href;
  if (!shellURLs.has(key)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheName);
      return (await cache.match(key)) ?? fetch(request);
    })(),
  );
});
