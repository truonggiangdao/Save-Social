"use strict";

var BUILD = "0";
try {
  BUILD = new URL(self.location.href).searchParams.get("v") || "0";
} catch (e) {}

var CACHE = "save-social-" + BUILD;

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (name) {
            return name.indexOf("save-social-") === 0 && name !== CACHE;
          })
          .map(function (name) {
            return caches.delete(name);
          })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isAppShellPath(pathname) {
  if (!pathname) return false;
  if (pathname === "/" || pathname.endsWith("/")) return true;
  return /\.(html|js|css|webmanifest)$/i.test(pathname);
}

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  var url;
  try {
    url = new URL(event.request.url);
  } catch (err) {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (!isAppShellPath(url.pathname)) return;

  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(event.request, copy);
          });
        }
        return response;
      })
      .catch(function () {
        return caches.match(event.request).then(function (cached) {
          if (cached) return cached;
          return caches.match("./index.html");
        });
      })
  );
});
