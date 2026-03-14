// ==================== nearby.js ====================
// 周辺施設表示（Overpass API / オンデマンド方式）
// =====================================================

const Nearby = (() => {
  const spotCache = {};    // portIndex -> { data, time }
  const SPOT_CACHE_TTL = 10 * 60 * 1000;
  let loading = false;

  // カテゴリ定義: { key, icon, label, maxRadius }
  const CATEGORIES = [
    { key: 'convenience', icon: '\uD83C\uDFEA', label: '\u30B3\u30F3\u30D3\u30CB', maxRadius: 3000 },
    { key: 'supermarket', icon: '\uD83D\uDED2', label: '\u30B9\u30FC\u30D1\u30FC', maxRadius: 3000 },
    { key: 'fishing',     icon: '\uD83C\uDFA3', label: '\u91E3\u5177\u5C4B',       maxRadius: 3000 },
    { key: 'restaurant',  icon: '\uD83C\uDF7D\uFE0F', label: '\u98F2\u98DF\u5E97', maxRadius: 3000 },
    { key: 'fuel',        icon: '\u26FD', label: '\u30AC\u30BD\u30EA\u30F3\u30B9\u30BF\u30F3\u30C9', maxRadius: 5000 }
  ];
  const MAX_PER_CATEGORY = 3;

  // ==================== Overpass API ====================
  const MAX_RETRIES = 3;

  async function fetchNearbyFacilities(lat, lon) {
    const query = `[out:json][timeout:30];(
      nwr["amenity"="convenience_store"](around:3000,${lat},${lon});
      nwr["shop"="convenience"](around:3000,${lat},${lon});
      nwr["shop"="supermarket"](around:3000,${lat},${lon});
      nwr["shop"="fishing"](around:3000,${lat},${lon});
      nwr["amenity"="restaurant"](around:3000,${lat},${lon});
      nwr["amenity"="fuel"](around:5000,${lat},${lon});
    );out center body;`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[Nearby] Overpass API request attempt ${attempt}/${MAX_RETRIES} (${lat}, ${lon})`);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        const res = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query),
          signal: controller.signal
        });
        clearTimeout(timer);

        console.log(`[Nearby] Response status: ${res.status}`);
        if (!res.ok) {
          const text = await res.text();
          console.warn(`[Nearby] HTTP error ${res.status}:`, text);
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log(`[Nearby] Got ${(data.elements || []).length} elements`);
        return data.elements || [];
      } catch (e) {
        console.warn(`[Nearby] Attempt ${attempt}/${MAX_RETRIES} failed:`, e.message);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        } else {
          throw e;
        }
      }
    }
  }

  // ==================== チェーン店フィルタ ====================
  const CONVENIENCE_CHAINS = [
    'セブンイレブン', 'ローソン', 'ファミリーマート',
    'ミニストップ', 'デイリーヤマザキ', 'ポプラ', 'セイコーマート'
  ];
  const SUPERMARKET_CHAINS = [
    'イオン', 'イオンモール', 'マックスバリュ', 'ライフ', '阪急オアシス',
    'フレスコ', 'コープ', '業務スーパー', '万代', '西友', 'ダイエー',
    '平和堂', 'フードワン', 'ロピア', 'オークワ', 'トライアル', 'ラムー',
    'ウェルシア', 'ドラッグストア', 'ドラッグ'
  ];
  const RESTAURANT_CHAINS = [
    'マクドナルド', 'モスバーガー', 'ケンタッキー',
    '吉野家', 'すき家', '松屋', 'なか卯',
    '天丼てんや', 'かつや', '餃子の王将',
    '丸亀製麺', 'はなまるうどん', 'リンガーハット',
    'サイゼリヤ', 'ガスト', 'デニーズ', 'ジョイフル', 'バーミヤン', 'ジョナサン',
    'ラーメン山岡家', '幸楽苑', '日高屋', 'ラーメン来来亭',
    'スシロー', 'くら寿司', 'はま寿司', 'かっぱ寿司',
    'コメダ珈琲', 'ドトール', 'スターバックス', 'タリーズ'
  ];

  function matchesChain(name, chains) {
    if (!name) return false;
    return chains.some(c => name.includes(c));
  }

  // ==================== ユーティリティ ====================
  function getCategoryKey(el) {
    if (el.tags.amenity === 'convenience_store' || el.tags.shop === 'convenience') return 'convenience';
    if (el.tags.shop === 'supermarket') return 'supermarket';
    if (el.tags.shop === 'fishing') return 'fishing';
    if (el.tags.amenity === 'restaurant') return 'restaurant';
    if (el.tags.amenity === 'fuel') return 'fuel';
    return null;
  }

  function getCoords(el) {
    if (el.center) return { lat: el.center.lat, lon: el.center.lon };
    return { lat: el.lat, lon: el.lon };
  }

  function calcDist(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ==================== 描画 ====================
  function render(elements, spotLat, spotLon) {
    const list = document.getElementById('nearbyList');
    const status = document.getElementById('nearbyStatus');

    // カテゴリごとに分類・距離計算・フィルタ
    const grouped = {};
    for (const cat of CATEGORIES) grouped[cat.key] = [];

    for (const el of elements) {
      const key = getCategoryKey(el);
      if (!key) continue;
      const coords = getCoords(el);
      if (!coords.lat || !coords.lon) continue;
      const dist = calcDist(spotLat, spotLon, coords.lat, coords.lon);
      const maxR = CATEGORIES.find(c => c.key === key).maxRadius;
      if (dist > maxR) continue;
      const rawName = el.tags.name || el.tags['name:ja'] || el.tags.brand || null;
      // チェーン店フィルタ
      if (key === 'convenience' && !matchesChain(rawName, CONVENIENCE_CHAINS)) continue;
      if (key === 'supermarket' && !matchesChain(rawName, SUPERMARKET_CHAINS)) continue;
      if (key === 'restaurant' && !matchesChain(rawName, RESTAURANT_CHAINS)) continue;
      // 店舗フルネーム: name:ja > name > brand+branch、住所で補完
      const nameJa = el.tags['name:ja'] || '';
      const nameTag = el.tags.name || '';
      const brandTag = el.tags.brand || '';
      const branchTag = el.tags.branch || '';
      let displayName = nameJa || nameTag || (brandTag + (branchTag ? ' ' + branchTag : '')) || null;
      // nameがチェーン名のみでname:jaにフル名がある場合はname:jaを優先
      if (displayName && brandTag && displayName === brandTag && nameJa && nameJa !== brandTag) {
        displayName = nameJa;
      }
      if (displayName && !displayName.match(/店$|店舗$|支店$/)) {
        const addr = el.tags['addr:full'] || el.tags['addr:suburb'] || el.tags['addr:city'] || '';
        if (addr) displayName = displayName + ' ' + addr;
      }
      grouped[key].push({ name: displayName, dist, lat: coords.lat, lon: coords.lon });
    }

    // 各カテゴリを距離順ソート、重複除去、上位3件に絞る
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => a.dist - b.dist);
      const seen = new Set();
      grouped[key] = grouped[key].filter(item => {
        const normalized = (item.name || '').replace(/[（(][^）)]*[）)]/g, '').trim();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
      grouped[key] = grouped[key].slice(0, MAX_PER_CATEGORY);
    }

    // 表示するカテゴリがあるか
    const hasAny = CATEGORIES.some(c => grouped[c.key].length > 0);
    if (!hasAny) {
      status.textContent = '\u5468\u8FBA\u306B\u65BD\u8A2D\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093';
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
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName + '+' + item.lat + ',' + item.lon)}`;
        html += `<a href="${mapUrl}" target="_blank" rel="noopener" class="nearby-item">
          <span class="nearby-name">${displayName}</span>
          <span class="nearby-dist">${distKm}km</span>
        </a>`;
      }
      html += `</div>`;
    }

    list.innerHTML = html;
  }

  // ==================== トグル（オンデマンド） ====================
  async function toggle(portIndex) {
    const section = document.getElementById('nearbySection');
    if (!section) return;

    // 表示中ならトグルで閉じる
    if (section.style.display !== 'none') {
      section.style.display = 'none';
      return;
    }

    const port = PORTS[portIndex];
    const lat = port[3];
    const lon = port[4];

    // キャッシュがあればそのまま表示
    const cached = spotCache[portIndex];
    if (cached && (Date.now() - cached.time < SPOT_CACHE_TTL)) {
      section.style.display = '';
      render(cached.data, lat, lon);
      return;
    }

    // ローディング表示
    if (loading) return;
    loading = true;
    section.style.display = '';
    document.getElementById('nearbyStatus').textContent = '\u5468\u8FBA\u65BD\u8A2D\u3092\u691C\u7D22\u4E2D...';
    document.getElementById('nearbyList').innerHTML = '';

    try {
      const elements = await fetchNearbyFacilities(lat, lon);
      spotCache[portIndex] = { data: elements, time: Date.now() };
      render(elements, lat, lon);
    } catch (e) {
      console.warn('[Nearby] All retries failed:', e);
      section.style.display = 'none';
    } finally {
      loading = false;
    }
  }

  // スポット変更時にパネルを閉じる
  function hide() {
    const section = document.getElementById('nearbySection');
    if (section) section.style.display = 'none';
  }

  return { toggle, hide };
})();
