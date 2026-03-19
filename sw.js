// CACHE_VERSIONはタイムスタンプベース（SW更新を自動検出）
const CACHE_VERSION = 'tide-' + Date.now();

// プリキャッシュ対象（オフライン用）
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
  './js/spot-info.js',
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
  './img/fish/madai.png',
  './img/fish/gure.png',
  './img/fish/kisu.png',
  './img/fish/karei.png',
  './img/fish/mebaru.png',
  './img/fish/kamasu.png',
  './img/fish/tachiuo.png',
  './img/fish/sagoshi.png',
  './img/fish/buri.png',
  './img/fish/seabass.png',
  './img/fish/kawahagi.png'
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
  // クエリ文字列を除去してキャッシュキーを統一
  const url = new URL(event.request.url);
  url.search = '';
  const cacheKey = url.toString();

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(cacheKey, clone));
        }
        return response;
      })
      .catch(() => caches.match(cacheKey))
  );
});
