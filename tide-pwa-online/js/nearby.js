// ==================== nearby.js ====================
// 周辺施設表示（Overpass API / オンデマンド方式）
// =====================================================

const Nearby = (() => {
  const CATEGORIES = [
    { key: 'convenience', icon: '\uD83C\uDFEA', label: '\u30B3\u30F3\u30D3\u30CB', maxRadius: 3000,
      match: el => el.tags.amenity === 'convenience_store' || el.tags.shop === 'convenience' },
    { key: 'supermarket', icon: '\uD83D\uDED2', label: '\u30B9\u30FC\u30D1\u30FC', maxRadius: 3000,
      match: el => el.tags.shop === 'supermarket' },
    { key: 'fishing', icon: '\uD83C\uDFA3', label: '\u91E3\u5177\u5C4B', maxRadius: 3000,
      match: el => el.tags.shop === 'fishing' },
    { key: 'restaurant', icon: '\uD83C\uDF7D\uFE0F', label: '\u98F2\u98DF\u5E97', maxRadius: 3000,
      match: el => el.tags.amenity === 'restaurant' },
    { key: 'fuel', icon: '\u26FD', label: '\u30AC\u30BD\u30EA\u30F3\u30B9\u30BF\u30F3\u30C9', maxRadius: 5000,
      match: el => el.tags.amenity === 'fuel' }
  ];
  const MAX_PER_CATEGORY = 3;

  const CHAIN_FILTERS = {
    convenience: [
      '\u30BB\u30D6\u30F3\u30A4\u30EC\u30D6\u30F3', '\u30ED\u30FC\u30BD\u30F3', '\u30D5\u30A1\u30DF\u30EA\u30FC\u30DE\u30FC\u30C8',
      '\u30DF\u30CB\u30B9\u30C8\u30C3\u30D7', '\u30C7\u30A4\u30EA\u30FC\u30E4\u30DE\u30B6\u30AD', '\u30DD\u30D7\u30E9', '\u30BB\u30A4\u30B3\u30FC\u30DE\u30FC\u30C8'
    ],
    supermarket: [
      '\u30A4\u30AA\u30F3', '\u30A4\u30AA\u30F3\u30E2\u30FC\u30EB', '\u30DE\u30C3\u30AF\u30B9\u30D0\u30EA\u30E5', '\u30E9\u30A4\u30D5', '\u962A\u6025\u30AA\u30A2\u30B7\u30B9',
      '\u30D5\u30EC\u30B9\u30B3', '\u30B3\u30FC\u30D7', '\u696D\u52D9\u30B9\u30FC\u30D1\u30FC', '\u4E07\u4EE3', '\u897F\u53CB', '\u30C0\u30A4\u30A8\u30FC',
      '\u5E73\u548C\u5802', '\u30D5\u30FC\u30C9\u30EF\u30F3', '\u30ED\u30D4\u30A2', '\u30AA\u30FC\u30AF\u30EF', '\u30C8\u30E9\u30A4\u30A2\u30EB', '\u30E9\u30E0\u30FC',
      '\u30A6\u30A7\u30EB\u30B7\u30A2', '\u30C9\u30E9\u30C3\u30B0\u30B9\u30C8\u30A2', '\u30C9\u30E9\u30C3\u30B0'
    ],
    restaurant: [
      '\u30DE\u30AF\u30C9\u30CA\u30EB\u30C9', '\u30E2\u30B9\u30D0\u30FC\u30AC\u30FC', '\u30B1\u30F3\u30BF\u30C3\u30AD\u30FC',
      '\u5409\u91CE\u5BB6', '\u3059\u304D\u5BB6', '\u677E\u5C4B', '\u306A\u304B\u536F',
      '\u5929\u4E3C\u3066\u3093\u3084', '\u304B\u3064\u3084', '\u9903\u5B50\u306E\u738B\u5C06',
      '\u4E38\u4E80\u88FD\u9EBA', '\u306F\u306A\u307E\u308B\u3046\u3069\u3093', '\u30EA\u30F3\u30AC\u30FC\u30CF\u30C3\u30C8',
      '\u30B5\u30A4\u30BC\u30EA\u30E4', '\u30AC\u30B9\u30C8', '\u30C7\u30CB\u30FC\u30BA', '\u30B8\u30E7\u30A4\u30D5\u30EB', '\u30D0\u30FC\u30DF\u30E4\u30F3', '\u30B8\u30E7\u30CA\u30B5\u30F3',
      '\u30E9\u30FC\u30E1\u30F3\u5C71\u5CA1\u5BB6', '\u5E78\u697D\u82D1', '\u65E5\u9AD8\u5C4B', '\u30E9\u30FC\u30E1\u30F3\u6765\u6765\u4EAD',
      '\u30B9\u30B7\u30ED\u30FC', '\u304F\u3089\u5BFF\u53F8', '\u306F\u307E\u5BFF\u53F8', '\u304B\u3063\u3071\u5BFF\u53F8',
      '\u30B3\u30E1\u30C0\u73C8\u7432', '\u30C9\u30C8\u30FC\u30EB', '\u30B9\u30BF\u30FC\u30D0\u30C3\u30AF\u30B9', '\u30BF\u30EA\u30FC\u30BA'
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
      const res = await fetch('https://overpass-api.de/api/interpreter', {
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
    const nameJa = tags['name:ja'] || '';
    const name = tags.name || '';
    const brand = tags.brand || '';
    const branch = tags.branch || '';
    let display = nameJa || name || (brand + (branch ? ' ' + branch : '')) || null;
    if (display && brand && display === brand && nameJa && nameJa !== brand) {
      display = nameJa;
    }
    if (display && !display.match(/店$|店舗$|支店$/)) {
      const addr = tags['addr:full'] || tags['addr:suburb'] || tags['addr:city'] || '';
      if (addr) display = display + ' ' + addr;
    }
    return display;
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
      const seen = new Set();
      grouped[key] = grouped[key].filter(item => {
        const normalized = (item.name || '').replace(/[（(][^）)]*[）)]/g, '').trim();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
      grouped[key] = grouped[key].slice(0, MAX_PER_CATEGORY);
    }

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
    document.getElementById('nearbyStatus').textContent = '\u5468\u8FBA\u65BD\u8A2D\u3092\u691C\u7D22\u4E2D...';
    document.getElementById('nearbyList').innerHTML = '';

    try {
      const elements = await fetchFacilities(spotLat, spotLon);
      render(elements, spotLat, spotLon);
    } catch (e) {
      section.style.display = 'none';
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
