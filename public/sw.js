// xLOT Service Worker — PWA 오프라인 지원
const CACHE_NAME = 'xlot-v1';
const STATIC_ASSETS = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network first — 금융앱 특성상 항상 최신 데이터 우선
self.addEventListener('fetch', e => {
  // API, Supabase 요청은 캐시 안 함
  if (e.request.url.includes('supabase') ||
      e.request.url.includes('api.') ||
      e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});