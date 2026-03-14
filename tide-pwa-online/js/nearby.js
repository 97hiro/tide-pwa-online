// VERSION: 2026-03-14-FINAL
// ==================== nearby.js ====================
// 周辺施設表示（Overpass API / オンデマンド方式）
// =====================================================

const Nearby = (() => {
  const CATEGORIES = [
    { key: 'convenience', icon: '🏪', label: 'コンビニ', maxRadius: 3000,
      match: el => el.tags.amenity === 'convenience_store' || el.tags.shop === 'convenience' },
    { key: 'supermarket', icon: '🛒', label: 'スーパー', maxRadius: 3000,
      match: el => el.tags.shop === 'supermarket' },
    { key: 'fishing', icon: '🎣', label: '釣具屋', maxRadius: 3000,
      match: el => el.tags.shop === 'fishing' },
    { key: 'restaurant', icon: '🍽️', label: '飲食店', maxRadius: 3000,
      match: el => el.tags.amenity === 'restaurant' },
    { key: 'fuel', icon: '⛽', label: 'ガソリンスタンド', maxRadius: 5000,
      match: el => el.tags.amenity === 'fuel' }
  ];
  const MAX_PER_CATEGORY = 3;

  // チェーン店フィルタ（コンビニ・スーパー・飲食店のみ。釣具屋・ガソスタはフィルタなし）
  const CHAIN_FILTERS = {
    convenience: [
      'セブンイレブン', 'セブン-イレブン', 'ローソン', 'ファミリーマート',
      'ミニストップ', 'デイリーヤマザキ', 'ポプラ', 'セイコーマート'
    ],
    supermarket: [
      'イオン', 'マックスバリュ', 'ライフ', '阪急オアシス',
      'フレスコ', 'コープ', '業務スーパー', '万代', '西友', 'ダイエー',
      '平和堂', 'ロピア', 'オークワ', 'トライアル', 'ラムー',
      'ウェルシア', 'ドラッグストア', 'ドラッグ'
    ],
    restaurant: [
      'マクドナルド', 'モスバーガー', 'ケンタッキー',
      '吉野家', 'すき家', '松屋', 'なか卯',
      '天丼てんや', 'かつや', '餃子の王将',
      '丸亀製麺', 'はなまるうどん', 'リンガーハット',
      'サイゼリヤ', 'ガスト', 'デニーズ', 'ジョイフル', 'バーミヤン', 'ジョナサン',
      'スシロー', 'くら寿司', 'はま寿司', 'かっぱ寿司',
      'コメダ珈琲', 'ドトール', 'スターバックス', 'タリーズ'
    ]
  };

  let loading = false;

  // ==================== Haversine距離計算 ====================
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ==================== Overpass API取得 ====================
  // Cloudflare Workerプロキシ経由（IPアドレス秘匿）
  // デプロイ後、以下のURLを自分のWorkerドメインに変更すること：
  // const OVERPASS_ENDPOINT = 'https://overpass-proxy.YOUR_ACCOUNT.workers.dev';
  const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

  async function fetchFacilities(spotLat, spotLon) {
    const query = `[out:json][timeout:30];(
      nwr["amenity"="convenience_store"](around:3000,${spotLat},${spotLon});
      nwr["shop"="convenience"](around:3000,${spotLat},${spotLon});
      nwr["shop"="supermarket"](around:3000,${spotLat},${spotLon});
      nwr["shop"="fishing"](around:3000,${spotLat},${spotLon});
      nwr["amenity"="restaurant"](around:3000,${spotLat},${spotLon});
      nwr["amenity"="fuel"](around:5000,${spotLat},${spotLon});
    );out center body;`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.elements || [];
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  // ==================== 店舗名生成 ====================
  function buildName(tags) {
    const base = tags.name || tags['name:ja'] || tags.brand || null;
    if (base && tags.branch) return base + ' ' + tags.branch;
    return base;
  }

  // ==================== 描画 ====================
  function render(elements, spotLat, spotLon) {
    const list = document.getElementById('nearbyList');
    const status = document.getElementById('nearbyStatus');

    const grouped = {};
    for (const cat of CATEGORIES) grouped[cat.key] = [];

    for (const el of elements) {
      if (!el.tags) continue;
      const cat = CATEGORIES.find(c => c.match(el));
      if (!cat) continue;

      const coords = el.center || el;
      if (!coords.lat || !coords.lon) continue;

      const dist = haversine(spotLat, spotLon, coords.lat, coords.lon);
      if (dist > cat.maxRadius) continue;

      const rawName = el.tags.name || el.tags['name:ja'] || el.tags.brand || null;
      const chains = CHAIN_FILTERS[cat.key];
      if (chains && !chains.some(c => rawName && rawName.includes(c))) continue;

      grouped[cat.key].push({
        name: buildName(el.tags),
        dist,
        lat: coords.lat,
        lon: coords.lon
      });
    }

    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => a.dist - b.dist);
      const kept = [];
      for (const item of grouped[key]) {
        const isDup = kept.some(k => haversine(k.lat, k.lon, item.lat, item.lon) < 50);
        if (!isDup) kept.push(item);
      }
      grouped[key] = kept.slice(0, MAX_PER_CATEGORY);
    }

    const hasAny = CATEGORIES.some(c => grouped[c.key].length > 0);
    if (!hasAny) {
      status.textContent = '周辺に施設が見つかりません';
      list.innerHTML = '';
      return;
    }

    status.textContent = '';
    let html = '';
    for (const cat of CATEGORIES) {
      const items = grouped[cat.key];
      if (items.length === 0) continue;
      html += `<div class="nearby-category">`;
      html += `<div class="nearby-cat-header">${cat.icon} ${cat.label}</div>`;
      for (const item of items) {
        const displayName = item.name || cat.label;
        const distKm = Math.max(1, Math.round(item.dist / 1000));
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName)}&center=${item.lat},${item.lon}&zoom=17`;
        html += `<a href="${mapUrl}" target="_blank" rel="noopener" class="nearby-item">
          <span class="nearby-name">${displayName}</span>
          <span class="nearby-dist">${distKm}km</span>
        </a>`;
      }
      html += `</div>`;
    }
    list.innerHTML = html;
  }

  // ==================== トグル ====================
  async function toggle(portIndex) {
    const section = document.getElementById('nearbySection');
    if (!section) return;

    if (section.style.display !== 'none') {
      section.style.display = 'none';
      return;
    }

    if (loading) return;

    const spotLat = Number(PORTS[portIndex][3]);
    const spotLon = Number(PORTS[portIndex][4]);
    if (!spotLat || !spotLon) return;

    loading = true;
    section.style.display = '';
    document.getElementById('nearbyStatus').textContent = '周辺施設を検索中...';
    document.getElementById('nearbyList').innerHTML = '';

    try {
      const elements = await fetchFacilities(spotLat, spotLon);
      render(elements, spotLat, spotLon);
    } catch (e) {
      console.error('[Nearby] エラー:', e);
      document.getElementById('nearbyStatus').textContent = 'エラー: ' + e.message;
    } finally {
      loading = false;
    }
  }

  function hide() {
    const section = document.getElementById('nearbySection');
    if (section) section.style.display = 'none';
  }

  return { toggle, hide };
})();
