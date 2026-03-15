// ==================== nearby.js ====================
// 周辺施設表示（カテゴリ別Overpass API検索）
// =====================================================

const Nearby = (() => {
  const CATEGORIES = [
    { key: 'convenience', icon: '🏪', label: 'コンビニ', maxRadius: 3000,
      queries: ['"amenity"="convenience_store"', '"shop"="convenience"'],
      match: el => el.tags.amenity === 'convenience_store' || el.tags.shop === 'convenience' },
    { key: 'supermarket', icon: '🛒', label: 'スーパー', maxRadius: 3000,
      queries: ['"shop"="supermarket"'],
      match: el => el.tags.shop === 'supermarket' },
    { key: 'fishing', icon: '🎣', label: '釣具屋', maxRadius: 3000,
      queries: ['"shop"="fishing"'],
      match: el => el.tags.shop === 'fishing' },
    { key: 'restaurant', icon: '🍜', label: '飲食店', maxRadius: 3000,
      queries: ['"amenity"="restaurant"'],
      match: el => el.tags.amenity === 'restaurant' },
    { key: 'fuel', icon: '⛽', label: 'ガソリンスタンド', maxRadius: 5000,
      queries: ['"amenity"="fuel"'],
      match: el => el.tags.amenity === 'fuel' }
  ];
  const MAX_PER_CATEGORY = 3;

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

  // const OVERPASS_ENDPOINT = 'https://overpass-proxy.YOUR_ACCOUNT.workers.dev';
  const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

  // カテゴリ別キャッシュ { portIndex: { convenience: [...], supermarket: [...], ... } }
  let cache = { portIndex: -1, data: {} };
  let loadingKey = null;
  let activeKey = null;
  let currentPortIndex = -1;

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

  // ==================== カテゴリ別Overpass API取得 ====================
  async function fetchCategory(cat, spotLat, spotLon) {
    const parts = cat.queries.map(q =>
      `nwr[${q}](around:${cat.maxRadius},${spotLat},${spotLon});`
    ).join('\n      ');
    const query = `[out:json][timeout:60];(\n      ${parts}\n    );out center body;`;

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      try {
        const res = await fetch(OVERPASS_ENDPOINT, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query),
          signal: controller.signal,
          cache: 'no-store'
        });
        clearTimeout(timer);
        if (res.status === 504 && attempt < maxRetries) continue;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.elements || [];
      } catch (e) {
        clearTimeout(timer);
        if (attempt < maxRetries && (e.name === 'AbortError' || (e.message && e.message.includes('504')))) continue;
        throw e;
      }
    }
    throw new Error('リトライ上限');
  }

  // ==================== 店舗名生成 ====================
  function buildName(tags) {
    if (tags['name:ja']) return tags['name:ja'] + (tags.branch ? ' ' + tags.branch : '');
    if (tags.name) return tags.name + (tags.branch ? ' ' + tags.branch : '');
    if (tags.brand) return tags.brand + (tags.branch ? ' ' + tags.branch : '');
    return null;
  }

  // ==================== カテゴリ結果を処理 ====================
  // ==================== 逆ジオコーディングで町名取得 ====================
  async function reverseGeocode(lat, lon) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
        { cache: 'force-cache' }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const addr = data.address || {};
      return addr.neighbourhood || addr.quarter || addr.suburb || addr.town || null;
    } catch (e) {
      return null;
    }
  }

  async function processCategory(cat, elements, spotLat, spotLon) {
    const items = [];
    for (const el of elements) {
      if (!el.tags) continue;
      if (!cat.match(el)) continue;
      const coords = el.center || el;
      if (!coords.lat || !coords.lon) continue;
      const dist = haversine(spotLat, spotLon, coords.lat, coords.lon);
      if (dist > cat.maxRadius) continue;
      const rawName = el.tags.name || el.tags['name:ja'] || el.tags.brand || null;
      const chains = CHAIN_FILTERS[cat.key];
      if (chains && !chains.some(c => rawName && rawName.includes(c))) continue;
      items.push({ name: buildName(el.tags), dist, lat: coords.lat, lon: coords.lon, hasBranch: !!el.tags.branch });
    }
    items.sort((a, b) => a.dist - b.dist);
    const kept = [];
    for (const item of items) {
      if (!kept.some(k => haversine(k.lat, k.lon, item.lat, item.lon) < 50)) kept.push(item);
    }
    const result = kept.slice(0, MAX_PER_CATEGORY);

    // branchなしの店舗に逆ジオコーディングで町名を付加
    for (const item of result) {
      if (!item.hasBranch && item.name) {
        const area = await reverseGeocode(item.lat, item.lon);
        if (area) item.name = item.name + '（' + area + '）';
      }
    }
    return result;
  }

  // ==================== カテゴリ選択ボタン描画 ====================
  function renderCategoryButtons() {
    const container = document.getElementById('nearbyCategoryButtons');
    if (!container) return;
    let html = '';
    for (const cat of CATEGORIES) {
      const isActive = activeKey === cat.key;
      const isLoading = loadingKey === cat.key;
      const cls = isLoading ? 'nearby-cat-btn loading' : isActive ? 'nearby-cat-btn active' : 'nearby-cat-btn';
      html += `<button class="${cls}" data-cat="${cat.key}">${cat.icon} ${cat.label}</button>`;
    }
    container.innerHTML = html;
    container.querySelectorAll('.nearby-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => onCategoryClick(btn.dataset.cat));
    });
  }

  // ==================== 結果リスト描画 ====================
  function renderResults() {
    const list = document.getElementById('nearbyList');
    const status = document.getElementById('nearbyStatus');
    if (!list || !status) return;

    if (!activeKey || cache.portIndex !== currentPortIndex || !cache.data[activeKey]) {
      list.innerHTML = '';
      status.textContent = '';
      return;
    }

    let html = '';
    for (const cat of CATEGORIES) {
      if (cat.key !== activeKey) continue;
      const items = cache.data[cat.key];
      if (!items || items.length === 0) continue;
      html += `<div class="nearby-category">`;
      html += `<div class="nearby-cat-header">${cat.icon} ${cat.label}</div>`;
      for (const item of items) {
        const displayName = item.name || cat.label;
        const distKm = item.dist < 1000 ? Math.round(item.dist) + 'm' : (item.dist / 1000).toFixed(1) + 'km';
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName)}&center=${item.lat},${item.lon}&zoom=17`;
        html += `<a href="${mapUrl}" target="_blank" rel="noopener" class="nearby-item">
          <span class="nearby-name">${displayName}</span>
          <span class="nearby-dist">${distKm}</span>
        </a>`;
      }
      html += `</div>`;
    }

    status.textContent = '';
    list.innerHTML = html;
  }

  // ==================== カテゴリクリック ====================
  async function onCategoryClick(catKey) {
    if (loadingKey) return;
    const cat = CATEGORIES.find(c => c.key === catKey);
    if (!cat) return;

    activeKey = catKey;
    renderCategoryButtons();

    // キャッシュがあればそれを表示
    if (cache.portIndex === currentPortIndex && cache.data[catKey]) {
      renderResults();
      return;
    }

    const spotLat = Number(PORTS[currentPortIndex][3]);
    const spotLon = Number(PORTS[currentPortIndex][4]);
    if (!spotLat || !spotLon) return;

    loadingKey = catKey;
    document.getElementById('nearbyStatus').textContent = cat.icon + ' ' + cat.label + 'を検索中...';
    document.getElementById('nearbyList').innerHTML = '';
    renderCategoryButtons();

    try {
      const elements = await fetchCategory(cat, spotLat, spotLon);
      if (cache.portIndex !== currentPortIndex) {
        cache = { portIndex: currentPortIndex, data: {} };
      }
      cache.data[catKey] = await processCategory(cat, elements, spotLat, spotLon);
      if (cache.data[catKey].length === 0) {
        document.getElementById('nearbyStatus').textContent = cat.label + 'は見つかりませんでした';
      }
      renderResults();
    } catch (e) {
      console.error('[Nearby] エラー:', e);
      document.getElementById('nearbyStatus').textContent = 'エラー: ' + e.message;
    } finally {
      loadingKey = null;
      renderCategoryButtons();
    }
  }

  // ==================== トグル ====================
  function toggle(portIndex) {
    const section = document.getElementById('nearbySection');
    if (!section) return;

    if (section.style.display !== 'none') {
      section.style.display = 'none';
      return;
    }

    currentPortIndex = portIndex;
    // スポット変更時はキャッシュクリア
    if (cache.portIndex !== portIndex) {
      cache = { portIndex: portIndex, data: {} };
      activeKey = null;
    }

    section.style.display = '';
    document.getElementById('nearbyStatus').textContent = '';
    document.getElementById('nearbyList').innerHTML = '';
    renderCategoryButtons();
  }

  function hide() {
    const section = document.getElementById('nearbySection');
    if (section) section.style.display = 'none';
  }

  return { toggle, hide };
})();
