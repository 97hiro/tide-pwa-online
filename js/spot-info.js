// ==================== spot-info.js ====================
// クローラさん連携: spot_info.json を読み込み、
// 禁止スポットのランキング除外 + 詳細情報表示
// =====================================================

const SpotInfo = (() => {
  let _data = null;       // { exported_at, spots[] }
  let _spotMap = {};      // name -> spot object
  let _bannedIndices = new Set();  // PORTS index set

  async function init() {
    try {
      const resp = await fetch('data/spot_info.json?t=' + Date.now());
      if (!resp.ok) return;
      _data = await resp.json();
      _buildIndex();
      console.log('[SpotInfo] Loaded:', _data.spots.length, 'spots');
    } catch (e) {
      // spot_info.jsonが存在しない場合は既存動作をそのまま維持
      console.log('[SpotInfo] spot_info.json not found, skipping');
    }
  }

  function _buildIndex() {
    if (!_data || !_data.spots) return;
    _spotMap = {};
    _bannedIndices = new Set();

    // スポット名 -> データ のマップを構築
    for (const spot of _data.spots) {
      _spotMap[spot.name] = spot;
    }

    // PORTS配列のインデックスと照合してbanned setを構築
    if (typeof PORTS !== 'undefined') {
      for (let i = 0; i < PORTS.length; i++) {
        const portName = PORTS[i][0];
        const spot = _spotMap[portName];
        if (spot && spot.is_banned) {
          _bannedIndices.add(i);
        }
      }
      if (_bannedIndices.size > 0) {
        console.log('[SpotInfo] Banned indices from crawler:', [..._bannedIndices]);
      }
    }
  }

  /** ポートインデックスがクローラデータで禁止判定されているか */
  function isBanned(portIndex) {
    return _bannedIndices.has(portIndex);
  }

  /** スポット名で詳細情報を取得 */
  function getSpotInfo(portName) {
    return _spotMap[portName] || null;
  }

  /** ポートインデックスで詳細情報を取得 */
  function getByIndex(portIndex) {
    if (typeof PORTS === 'undefined' || !PORTS[portIndex]) return null;
    return _spotMap[PORTS[portIndex][0]] || null;
  }

  /** 施設情報セクションにクローラ情報を追記するHTML */
  function renderDetail(portIndex) {
    const info = getByIndex(portIndex);
    if (!info) return '';

    const parts = [];

    if (info.is_banned && info.ban_reason) {
      parts.push('<div style="color:#e74c5e;margin:4px 0">⛔ ' + _esc(info.ban_reason) + '</div>');
    }
    if (info.parking) {
      parts.push('<div style="margin:2px 0">🅿️ ' + _esc(info.parking) + '</div>');
    }
    if (info.toilet) {
      parts.push('<div style="margin:2px 0">🚻 ' + _esc(info.toilet) + '</div>');
    }
    if (info.access) {
      parts.push('<div style="margin:2px 0">🚗 ' + _esc(info.access) + '</div>');
    }
    if (info.sources && info.sources.length > 0) {
      parts.push('<div style="margin:2px 0;font-size:11px;color:#888">情報元: ' + _esc(info.sources.join(', ')) + '</div>');
    }
    if (info.last_updated) {
      parts.push('<div style="font-size:10px;color:#666">最終更新: ' + _esc(info.last_updated) + '</div>');
    }

    if (parts.length === 0) return '';
    return '<div class="spot-info-detail" style="background:#1a1d27;border:1px solid #2a2d3a;border-radius:6px;padding:8px 10px;margin-top:6px;font-size:12px;line-height:1.6">'
      + parts.join('')
      + '</div>';
  }

  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /** ポートインデックスから施設アイコンHTMLを生成 */
  function getIcons(portIndex) {
    const info = getByIndex(portIndex);
    if (!info) return '';
    const parts = [];
    if (info.is_banned) parts.push('<span style="color:#e74c5e">⛔</span>');
    if (info.parking) parts.push('🅿');
    if (info.toilet && info.toilet !== 'なし') parts.push('🚻');
    return parts.join('');
  }

  /** データがロード済みか */
  function isLoaded() { return _data !== null; }

  return { init, isBanned, getSpotInfo, getByIndex, renderDetail, isLoaded, getIcons };
})();
