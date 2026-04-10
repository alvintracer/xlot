// xLOT Service Worker — PWA 오프라인 지원
const CACHE_NAME = 'xlot-v2';
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
  const url = e.request.url;

  // API, Supabase, 중계서버, 외부 거래소 요청은 캐시 안 함 — SW 완전 스킵
  if (url.includes('supabase') ||
      url.includes('api.') ||
      url.includes('49.247.139.241') ||
      url.includes('pro.edgex.exchange') ||
      url.includes('okx.com') ||
      url.includes('bitget.com') ||
      url.includes('zklighter') ||
      url.includes('coingecko') ||
      url.includes('trongrid') ||
      url.includes('hyperliquid') ||
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