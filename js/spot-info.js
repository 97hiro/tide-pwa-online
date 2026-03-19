// ==================== spot-info.js ====================
// クローラさん連携: spot_info.json を読み込み、
// 禁止スポットのランキング除外 + 行2アイコンバー + 詳細ポップアップ
// =====================================================

const SpotInfo = (() => {
  let _data = null;
  let _spotMap = {};
  let _bannedIndices = new Set();

  async function init() {
    try {
      const resp = await fetch('data/spot_info.json?t=' + Date.now());
      if (!resp.ok) return;
      _data = await resp.json();
      _buildIndex();
      console.log('[SpotInfo] Loaded:', _data.spots.length, 'spots');
    } catch (e) {
      console.log('[SpotInfo] spot_info.json not found, skipping');
    }
  }

  function _buildIndex() {
    if (!_data || !_data.spots) return;
    _spotMap = {};
    _bannedIndices = new Set();
    for (const spot of _data.spots) {
      _spotMap[spot.name] = spot;
    }
    if (typeof PORTS !== 'undefined') {
      for (let i = 0; i < PORTS.length; i++) {
        const spot = _spotMap[PORTS[i][0]];
        if (spot && spot.is_banned) _bannedIndices.add(i);
      }
    }
  }

  function isBanned(portIndex) { return _bannedIndices.has(portIndex); }
  function getSpotInfo(portName) { return _spotMap[portName] || null; }
  function getByIndex(portIndex) {
    if (typeof PORTS === 'undefined' || !PORTS[portIndex]) return null;
    return _spotMap[PORTS[portIndex][0]] || null;
  }
  function isLoaded() { return _data !== null; }

  // ==================== 行2 アイコンバー ====================
  function renderSpotBar(portIndex) {
    const bar = document.getElementById('spotBar');
    if (!bar) return;

    const port = (typeof PORTS !== 'undefined') ? PORTS[portIndex] : null;
    if (!port) { bar.innerHTML = ''; return; }

    const info = getByIndex(portIndex);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(port[0])}`;

    let html = '';

    // 📍 マップ
    html += `<a href="${mapUrl}" target="_blank" rel="noopener" class="spot-bar-btn" title="地図で見る" onclick="event.stopPropagation()">📍</a>`;

    // 🏪 周辺
    html += `<button class="spot-bar-btn" id="spotBarNearby" title="周辺施設">🏪</button>`;

    // 🚻 トイレ
    const toilet = port[13];
    const siToilet = info && info.toilet;
    if (toilet === true || (siToilet && siToilet !== 'なし')) {
      html += `<span class="spot-bar-btn" title="トイレあり">🚻✅</span>`;
    } else if (toilet === false || (siToilet && siToilet === 'なし')) {
      html += `<span class="spot-bar-btn" title="トイレなし" style="opacity:0.5">🚻❌</span>`;
    } else {
      html += `<span class="spot-bar-btn" title="トイレ情報なし" style="opacity:0.4">🚻－</span>`;
    }

    // 🅿 駐車場
    const parking = port[14];
    const siParking = info && info.parking;
    if (parking === true || (siParking && siParking !== 'なし')) {
      html += `<span class="spot-bar-btn" title="駐車場あり">🅿️✅</span>`;
    } else if (parking === false || (siParking && siParking === 'なし')) {
      html += `<span class="spot-bar-btn" title="駐車場なし" style="opacity:0.5">🅿️❌</span>`;
    } else {
      html += `<span class="spot-bar-btn" title="駐車場情報なし" style="opacity:0.4">🅿️－</span>`;
    }

    html += '<span class="spot-bar-sep"></span>';

    // ▲ 注意
    if (info && info.has_restriction) {
      html += `<button class="spot-bar-btn warn" id="spotBarWarn" title="一部制限あり">▲</button>`;
    }

    // ⛔ 禁止
    if (info && info.is_banned) {
      html += `<button class="spot-bar-btn danger" id="spotBarBan" title="釣り禁止">⛔</button>`;
    } else if (port[15] === true && !(info && info.has_restriction)) {
      html += `<button class="spot-bar-btn danger" id="spotBarBan" title="釣り禁止情報あり">⛔</button>`;
    }

    // 📋 詳細
    html += `<button class="spot-bar-btn info" id="spotBarDetail" title="詳細情報">📋</button>`;

    bar.innerHTML = html;

    // イベント
    const nearbyBtn = document.getElementById('spotBarNearby');
    if (nearbyBtn) nearbyBtn.addEventListener('click', () => { if (typeof Nearby !== 'undefined') Nearby.toggle(portIndex); });

    const warnBtn = document.getElementById('spotBarWarn');
    if (warnBtn) warnBtn.addEventListener('click', () => _showPopup('一部制限', _renderRestriction(info)));

    const banBtn = document.getElementById('spotBarBan');
    if (banBtn) banBtn.addEventListener('click', () => {
      const reason = (info && info.ban_reason) || '釣り禁止情報があります。現地の標識に従ってください。';
      _showPopup('釣り禁止', '<div class="spot-popup-row sp-danger"><span class="sp-value">⛔ ' + _esc(reason) + '</span></div>');
    });

    const detailBtn = document.getElementById('spotBarDetail');
    if (detailBtn) detailBtn.addEventListener('click', () => _showPopup(port[0] + ' 詳細情報', _renderFullDetail(portIndex)));
  }

  // ==================== ポップアップ ====================
  function _showPopup(title, bodyHtml) {
    const overlay = document.getElementById('spotPopupOverlay');
    const titleEl = document.getElementById('spotPopupTitle');
    const bodyEl = document.getElementById('spotPopupBody');
    if (!overlay || !titleEl || !bodyEl) return;
    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    overlay.style.display = 'flex';
  }

  function _renderRestriction(info) {
    if (!info || !info.restriction_reason) return '<div style="color:var(--text-secondary)">制限情報なし</div>';
    return '<div class="spot-popup-row sp-warn"><span class="sp-label">注意事項</span><span class="sp-value">▲ ' + _esc(info.restriction_reason) + '</span></div>';
  }

  function _renderFullDetail(portIndex) {
    const port = PORTS[portIndex];
    const info = getByIndex(portIndex);
    let html = '';

    if (info && info.is_banned && info.ban_reason) {
      html += '<div class="spot-popup-row sp-danger"><span class="sp-label">⛔ 釣り禁止</span><span class="sp-value">' + _esc(info.ban_reason) + '</span></div>';
    }
    if (info && info.has_restriction && info.restriction_reason) {
      html += '<div class="spot-popup-row sp-warn"><span class="sp-label">▲ 注意事項</span><span class="sp-value">' + _esc(info.restriction_reason) + '</span></div>';
    }

    // 駐車場
    const parkingRaw = (info && info.parking) || (port[14] === true ? 'あり' : port[14] === false ? 'なし' : '');
    const parkingIcon = parkingRaw && parkingRaw !== 'なし' ? '🅿️✅' : parkingRaw === 'なし' ? '🅿️❌' : '🅿️－';
    html += '<div class="spot-popup-row"><span class="sp-label">' + parkingIcon + ' 駐車場</span><span class="sp-value">' + (parkingRaw ? _esc(parkingRaw) : '情報なし') + '</span></div>';

    // トイレ
    const toiletRaw = (info && info.toilet) || (port[13] === true ? 'あり' : port[13] === false ? 'なし' : '');
    const toiletIcon = toiletRaw && toiletRaw !== 'なし' ? '🚻✅' : toiletRaw === 'なし' ? '🚻❌' : '🚻－';
    html += '<div class="spot-popup-row"><span class="sp-label">' + toiletIcon + ' トイレ</span><span class="sp-value">' + (toiletRaw ? _esc(toiletRaw) : '情報なし') + '</span></div>';

    // アクセス
    if (info && info.access) {
      html += '<div class="spot-popup-row"><span class="sp-label">🚗 アクセス</span><span class="sp-value">' + _esc(info.access) + '</span></div>';
    }

    // 更新日
    if (info && info.last_updated) {
      html += '<div class="spot-popup-date">情報更新日: ' + _esc(info.last_updated) + '</div>';
    }

    if (!html) {
      html = '<div style="color:var(--text-secondary);text-align:center;padding:20px">詳細情報はまだありません</div>';
    }

    return html;
  }

  // ==================== スコアセクション施設表示 ====================
  function renderDetail(portIndex) {
    // 行2のバーに移行したため、scoreFacilityには最小限の表示のみ
    return '';
  }

  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /** ポートインデックスから施設アイコンHTMLを生成（ポートリスト用） */
  function getIcons(portIndex) {
    const info = getByIndex(portIndex);
    if (!info) return '';
    const parts = [];
    if (info.is_banned) parts.push('<span style="color:#e74c5e">⛔</span>');
    else if (info.has_restriction) parts.push('<span style="color:#f0a030" title="' + _esc((info.restriction_reason || '').substring(0, 80)) + '">▲</span>');
    if (info.parking && info.parking !== 'なし') parts.push('🅿️✅');
    else if (info.parking === 'なし') parts.push('🅿️❌');
    if (info.toilet && info.toilet !== 'なし') parts.push('🚻✅');
    else if (info.toilet === 'なし') parts.push('🚻❌');
    return parts.join('');
  }

  return { init, isBanned, getSpotInfo, getByIndex, renderDetail, renderSpotBar, isLoaded, getIcons };
})();
