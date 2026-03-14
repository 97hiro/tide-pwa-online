const CACHE_VERSION = 'tidegraph-theory-v52';

// 静的ファイル（Cache First）
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/ports-data.js',
  './js/tide-calc.js',
  './js/data-fetch.js',
  './js/theory-score.js',
  './js/fish-profiles.js',
  './js/fish-score.js',
  './js/chart.js',
  './js/ui.js',
  './js/ranking.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './img/fish/aji.png',
  './img/fish/saba.png',
  './img/fish/aori.png',
  './img/fish/hirame.png',
  './img/fish/hata.png',
  './img/fish/gasira.png',
  './img/fish/aomono.png',
  './img/fish/tako.png',
  './img/fish/chinu.png',
  './img/fish/madai.png'
];

// 気象データURL（Network First）
const API_PATTERNS = [
  'open-meteo.com'
];

function isApiRequest(url) {
  return API_PATTERNS.some(p => url.includes(p));
}

// Install: 静的ファイルをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: Cache First (static) / Network First (API)
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (isApiRequest(url)) {
    // Network First: APIデータ
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else if (event.request.mode === 'navigate') {
    // Network First: HTML navigation
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match('./index.html'))
    );
  } else {
    // Cache First: 静的アセット
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response && response.status === 200 && response.type === 'basic') {
              const clone = response.clone();
              caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
            }
            return response;
          });
        })
        .catch(() => {})
    );
  }
});
