const CACHE_VERSION = 'tidegraph-theory-v70';

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
  './js/nearby.js',
  './js/regulation-data.js',
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

// Network First対象: 外部API + nearby.js（常に最新版を取得）
function isNetworkFirst(url) {
  return url.includes('open-meteo.com') ||
         url.includes('overpass-api.de') ||
         url.includes('nearby.js');
}

// Overpass APIはPOSTなのでキャッシュしない
function isOverpass(url) {
  return url.includes('overpass-api.de');
}

// Install: 静的ファイルをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: 古いキャッシュを全て削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Overpass API: 常にネットワーク直接、キャッシュしない
  if (isOverpass(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network First: API + nearby.js
  if (isNetworkFirst(url)) {
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
    return;
  }

  // Navigation: Network First
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache First: その他の静的アセット
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
});
