// Service Worker — แคชไฟล์แอปทั้งหมดเพื่อให้เปิดได้แบบ offline
const CACHE_NAME = "ccv2-v2";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./fallback-rates.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// ===== Install: pre-cache ไฟล์ shell ทั้งหมด =====
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

// ===== Activate: ลบแคชเวอร์ชันเก่า =====
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ===== Fetch strategy =====
// - ไฟล์แอป (shell): Cache-First — ใช้ของในแคชก่อน ถ้าไม่มีค่อยไปเน็ต
// - API calls: Network-First — ลองดึงจากเน็ตก่อน ถ้าไม่ได้ค่อยใช้แคช
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls (open.er-api.com)
  if (url.hostname.includes("open.er-api.com")) {
    event.respondWith(networkFirstThenCache(event.request));
    return;
  }

  // ไฟล์ shell อื่นๆ
  event.respondWith(cacheFirstThenNetwork(event.request));
});

async function cacheFirstThenNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // แคชไฟล์ใหม่ที่ดึงสำเร็จ (same-origin เท่านั้น)
    if (response.ok && new URL(request.url).origin === self.location.origin) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // offline + ไม่มีในแคช → ส่ง offline page ถ้ามี, ไม่งั้นให้ fail
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function networkFirstThenCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ result: "error", error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}
