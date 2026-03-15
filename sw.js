const CACHE_VERSION = 'tidegraph-theory-v74';

// プリキャッシュ対象（オフライン用）
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/ports-data.js?v=74',
  './js/tide-calc.js?v=74',
  './js/data-fetch.js?v=74',
  './js/theory-score.js?v=74',
  './js/fish-profiles.js?v=74',
  './js/fish-score.js?v=74',
  './js/chart.js?v=74',
  './js/ui.js?v=74',
  './js/nearby.js?v=74',
  './js/regulation-data.js?v=74',
  './js/ranking.js?v=74',
  './js/app.js?v=74',
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

// Install: 静的ファイルをプリキャッシュ
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

// Fetch: 全てNetwork First
self.addEventListener('fetch', (event) => {
  // Overpass API (POST): キャッシュせずネットワーク直接
  if (event.request.url.includes('overpass-api.de')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 全リクエスト: Network First（失敗時のみキャッシュ）
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
});
