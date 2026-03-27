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

    // 🎯 釣行判断
    html += `<button class="spot-bar-btn judgment" id="spotBarJudgment" title="釣行判断">🎯</button>`;

    // 📋 詳細
    html += `<button class="spot-bar-btn info" id="spotBarDetail" title="詳細情報">📋</button>`;

    // ❓ ヘルプ
    html += `<button class="spot-bar-btn info" id="spotBarHelp" title="ヘルプ">❓</button>`;

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

    const judgmentBtn = document.getElementById('spotBarJudgment');
    if (judgmentBtn) judgmentBtn.addEventListener('click', () => _showJudgment(portIndex));

    const detailBtn = document.getElementById('spotBarDetail');
    if (detailBtn) detailBtn.addEventListener('click', () => _showPopup(port[0] + ' 詳細情報', _renderFullDetail(portIndex)));

    const helpBtn = document.getElementById('spotBarHelp');
    if (helpBtn) helpBtn.addEventListener('click', () => {
      const overlay = document.getElementById('helpOverlay');
      if (overlay) overlay.style.display = 'flex';
    });
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

  // ==================== 釣行判断 ====================
  async function _showJudgment(portIndex) {
    const port = PORTS[portIndex];
    const date = App.state.date;

    _showPopup(port[0] + ' 釣行判断', '<div class="judgment-loading"><div class="judgment-spinner"></div>ランキング計算中...</div>');

    try {
      // 3つの時間帯を並列計算
      const [dataBest, dataMorning, dataEvening] = await Promise.all([
        Ranking.calcForJudgment(date, portIndex, 'best'),
        Ranking.calcForJudgment(date, portIndex, 'morning'),
        Ranking.calcForJudgment(date, portIndex, 'evening')
      ]);

      const periodMap = {
        best: { data: dataBest, label: '終日ベスト' },
        morning: { data: dataMorning, label: '朝マズメ' },
        evening: { data: dataEvening, label: '夕マズメ' }
      };

      const bodyEl = document.getElementById('spotPopupBody');
      if (!bodyEl) return;

      // タブ + コンテンツ描画
      let tabsHtml = '<div class="judgment-tabs">';
      tabsHtml += '<button class="judgment-tab active" data-jperiod="best">終日ベスト</button>';
      tabsHtml += '<button class="judgment-tab" data-jperiod="morning">朝マズメ</button>';
      tabsHtml += '<button class="judgment-tab" data-jperiod="evening">夕マズメ</button>';
      tabsHtml += '</div>';

      let panelsHtml = '';
      for (const [key, entry] of Object.entries(periodMap)) {
        const display = key === 'best' ? 'block' : 'none';
        panelsHtml += `<div class="judgment-panel" data-jpanel="${key}" style="display:${display}">`;
        panelsHtml += _renderJudgment(entry.data, portIndex, date, entry.label);
        panelsHtml += '</div>';
      }

      bodyEl.innerHTML = tabsHtml + panelsHtml;

      // タブ切替イベント
      bodyEl.querySelectorAll('.judgment-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          bodyEl.querySelectorAll('.judgment-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const period = tab.dataset.jperiod;
          bodyEl.querySelectorAll('.judgment-panel').forEach(p => {
            p.style.display = p.dataset.jpanel === period ? 'block' : 'none';
          });
        });
      });

      // 代替スポットのクリックイベント
      bodyEl.querySelectorAll('.judgment-alt-item').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.portIndex);
          document.getElementById('spotPopupOverlay').style.display = 'none';
          App.selectPort(idx);
        });
      });
    } catch (e) {
      console.error('[釣行判断] エラー:', e);
      const bodyEl = document.getElementById('spotPopupBody');
      if (bodyEl) bodyEl.innerHTML = '<div style="color:var(--accent-red);text-align:center;padding:20px">計算中にエラーが発生しました</div>';
    }
  }

  function _renderJudgment(data, portIndex, date, periodLabel) {
    const percentile = data.totalSpots > 0 ? data.theoryRank / data.totalSpots : 1;
    const topPercent = Math.round(percentile * 100);

    // 魚種スコアの相対評価: エリア上位と比較して劣る場合はペナルティ
    const fishGap = (data.areaFishAvg || 0) - data.bestFishScore;
    let effectiveFishScore = fishGap > 5
      ? data.bestFishScore - Math.round(fishGap * 0.5)
      : data.bestFishScore;

    // shelter リスク補正: 遮蔽度が低く実際に風・波が悪い場合のみ減点
    // 天候データ未取得の場合はペナルティを与えない（データ不足で判定不能）
    const hasWeather = data.scoreDetail.scores.wind != null;
    if (hasWeather && data.shelter != null && data.shelter < 0.3) {
      if (data.scoreDetail.scores.wind < 60) {
        effectiveFishScore -= 5;
      }
    }

    // ランク判定
    let rank, rankLabel, rankColor, rankBg;
    if (percentile <= 0.25 && effectiveFishScore >= 75) {
      rank = 'A'; rankLabel = 'GO! 爆釣期待'; rankColor = '#4ecb71'; rankBg = 'rgba(78,203,113,0.15)';
    } else if (percentile <= 0.50 && effectiveFishScore >= 65) {
      rank = 'B'; rankLabel = '有望・期待できる'; rankColor = '#a0d840'; rankBg = 'rgba(160,216,64,0.15)';
    } else if (percentile > 0.50 || effectiveFishScore < 65) {
      if (percentile > 0.75 || effectiveFishScore < 55) {
        rank = 'D'; rankLabel = '見送り推奨'; rankColor = '#e74c5e'; rankBg = 'rgba(231,76,94,0.15)';
      } else {
        rank = 'C'; rankLabel = 'やや厳しい'; rankColor = '#f0943a'; rankBg = 'rgba(240,148,58,0.15)';
      }
    }

    const dow = ['日','月','火','水','木','金','土'];
    const dateStr = `${date.getMonth()+1}/${date.getDate()}(${dow[date.getDay()]})`;

    let html = '';

    // ランクヘッダー
    html += `<div class="judgment-rank-card" style="background:${rankBg};border-left:4px solid ${rankColor}">`;
    html += `<div class="judgment-rank-letter" style="color:${rankColor}">${rank}</div>`;
    html += `<div class="judgment-rank-body">`;
    html += `<div class="judgment-rank-label" style="color:${rankColor}">${rankLabel}</div>`;
    const periodTag = periodLabel ? `【${periodLabel}】` : '';
    html += `<div class="judgment-rank-sub">${periodTag}${dateStr} ${data.tideName} / ${data.totalSpots}スポット中 ${data.theoryRank}位 (上位${topPercent}%)</div>`;
    html += `</div></div>`;

    // 判断理由
    html += `<div class="judgment-section-title">判断理由</div>`;
    html += `<div class="judgment-reasons">`;

    const reasons = _buildReasons(data, percentile, rank);
    for (const r of reasons) {
      const icon = r.positive ? '&#x2714;' : '&#x26A0;';
      const cls = r.positive ? 'positive' : 'negative';
      html += `<div class="judgment-reason ${cls}"><span class="judgment-reason-icon">${icon}</span>${_esc(r.text)}</div>`;
    }
    html += `</div>`;

    // スコア内訳
    html += `<div class="judgment-section-title">スコア内訳 (ベスト${data.theoryBestTime ? data.theoryBestTime.hour + ':00' : '--'}時)</div>`;
    html += `<div class="judgment-scores">`;

    const scoreLabels = { tide: '潮汐', pressure: '気圧', wind: '風', wave: '波', timing: '時間帯', tideFlow: '潮流' };
    for (const [key, label] of Object.entries(scoreLabels)) {
      const val = data.scoreDetail.scores[key];
      if (val == null) continue;
      const pct = Math.min(100, val);
      const color = val >= 78 ? '#4ecb71' : val >= 65 ? '#a0d840' : val >= 46 ? '#f0c040' : val >= 31 ? '#f0943a' : '#e74c5e';
      html += `<div class="judgment-score-row">`;
      html += `<span class="judgment-score-label">${label}</span>`;
      html += `<div class="judgment-score-bar-bg"><div class="judgment-score-bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
      html += `<span class="judgment-score-val" style="color:${color}">${val}</span>`;
      html += `</div>`;
    }
    html += `</div>`;

    // 魚種スコア
    html += `<div class="judgment-section-title">魚種別スコア</div>`;
    html += `<div class="judgment-fish-grid">`;

    const sortedFish = Object.entries(data.fishScores)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 8);

    for (const [fid, fdata] of sortedFish) {
      const profile = FISH_PROFILES[fid];
      if (!profile) continue;
      const s = fdata.score;
      const color = s >= 75 ? '#4ecb71' : s >= 65 ? '#a0d840' : s >= 55 ? '#f0c040' : s >= 40 ? '#f0943a' : '#e74c5e';
      const inSeason = profile.season && profile.season.includes(date.getMonth() + 1);
      const seasonBadge = inSeason ? '' : '<span class="judgment-fish-offseason">季節外</span>';
      const iconHtml = profile.icon.endsWith('.png')
        ? `<img src="${profile.icon}" class="judgment-fish-icon">`
        : `<span class="judgment-fish-icon">${profile.icon}</span>`;
      html += `<div class="judgment-fish-item">`;
      html += `${iconHtml}<span class="judgment-fish-name">${profile.name}${seasonBadge}</span>`;
      html += `<span class="judgment-fish-score" style="color:${color}">${s}</span>`;
      html += `</div>`;
    }
    html += `</div>`;

    // 代替スポット
    if (data.alternatives.length > 0) {
      html += `<div class="judgment-section-title">代替スポット (同エリア上位)</div>`;
      html += `<div class="judgment-alts">`;

      for (let i = 0; i < Math.min(3, data.alternatives.length); i++) {
        const alt = data.alternatives[i];
        const altProfile = alt.bestFishId ? FISH_PROFILES[alt.bestFishId] : null;
        const fishName = altProfile ? altProfile.name : '';
        const altColor = alt.score >= 78 ? '#4ecb71' : alt.score >= 65 ? '#a0d840' : alt.score >= 46 ? '#f0c040' : '#f0943a';
        const altPortType = PORTS[alt.portIndex] ? PORTS[alt.portIndex][12] : '';
        const typeIcon = (typeof TYPE_ICONS !== 'undefined' && TYPE_ICONS[altPortType]) || '';

        html += `<div class="judgment-alt-item" data-port-index="${alt.portIndex}">`;
        html += `<div class="judgment-alt-info">`;
        html += `<div class="judgment-alt-name">${typeIcon} ${_esc(alt.portName)}</div>`;
        html += `<div class="judgment-alt-detail">${_esc(alt.city)} / ${fishName} ${alt.bestFishScore}点</div>`;
        html += `</div>`;
        html += `<div class="judgment-alt-score" style="color:${altColor}">${alt.score}</div>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    return html;
  }

  function _buildReasons(data, percentile, rank) {
    const reasons = [];
    const d = data.scoreDetail;
    const month = data.month || new Date().getMonth() + 1;
    const hasWeather = d.scores.wind != null;
    const windSpeed = data.weather ? data.weather.windSpeed : null;

    // ==================== 1. 潮回り ====================
    if (data.tideName === '大潮' || data.tideName === '中潮') {
      reasons.push({ positive: true, text: `${data.tideName}で潮がしっかり動く好条件` });
    } else if (data.tideName === '長潮' || data.tideName === '若潮') {
      reasons.push({ positive: false, text: `${data.tideName}で潮の動きが弱い` });
    } else {
      reasons.push({ positive: false, text: `${data.tideName} — 潮の動きはやや控えめ` });
    }

    // ==================== 2. 大潮×低shelter×風速 ====================
    if (data.shelter != null && data.shelter <= 0.3 && data.tideName === '大潮') {
      if (windSpeed != null && windSpeed <= 3) {
        // 風速データあり + べた凪 → 潮止まりリスクを警告
        reasons.push({ positive: false, text: `大潮×べた凪(風速${windSpeed.toFixed(1)}m/s)は潮止まり時に水が完全に止まりやすく、仕掛けが動かず魚にアピールできないリスクがあります` });
        reasons.push({ positive: false, text: `外海テトラは大潮で潮流が速い時間と完全に止まる時間が極端になります。湾奥の港と違い潮止まりで水が完全に死ぬリスクがあります` });
      }
      // 風速データなし → ランクには影響させない（注記は4.で出す）
      // 風速データあり + 風速>3 → 潮止まりリスクは低いので警告なし
    }

    // ==================== 4. shelter + 天気データ ====================
    if (data.shelter != null && data.shelter < 0.3) {
      if (!hasWeather) {
        // 天候データ未取得は情報として表示するがネガティブ扱いにしない
        reasons.push({ positive: true, text: `天気データ未取得 — 潮汐・魚種・順位のみで判定しています。当日の風・波は現地で確認してください` });
      } else if (d.scores.wind < 50) {
        reasons.push({ positive: false, text: `遮蔽度が低く(${data.shelter})、風の影響を受けやすい — 風スコア${d.scores.wind}点` });
      } else {
        reasons.push({ positive: false, text: `遮蔽度が低い(${data.shelter}) — 風が強まると厳しい` });
      }
    } else if (data.shelter != null && data.shelter >= 0.6) {
      reasons.push({ positive: true, text: `遮蔽度が高く(${data.shelter})、風・波に強い` });
    } else if (!hasWeather) {
      reasons.push({ positive: true, text: `天気データ未取得 — 潮汐・魚種・順位のみで判定しています` });
    }

    // ==================== 5. 風・波・気圧 ====================
    if (d.scores.wind != null) {
      if (d.scores.wind >= 78) {
        reasons.push({ positive: true, text: `風が穏やかで釣りやすい (風スコア${d.scores.wind}点)` });
      } else if (d.scores.wind < 40) {
        reasons.push({ positive: false, text: `風が強く釣りにくい (風スコア${d.scores.wind}点)` });
      }
    }
    if (d.scores.wave != null && d.scores.wave < 40) {
      reasons.push({ positive: false, text: `波が高い (波スコア${d.scores.wave}点)` });
    }
    if (d.scores.pressure != null && d.scores.pressure >= 70) {
      reasons.push({ positive: true, text: `気圧変化が釣りに好条件 (気圧スコア${d.scores.pressure}点)` });
    }

    // ==================== 6. 魚種スコアが低い具体的理由 ====================

    // 6a. 大潮でtidalBonusがマイナスの魚種を列挙
    if (data.tideName && data.fishScores) {
      const penalizedFish = [];
      for (const [fid, fdata] of Object.entries(data.fishScores)) {
        const profile = FISH_PROFILES[fid];
        if (!profile || !profile.tidalBonus) continue;
        const bonus = profile.tidalBonus[data.tideName];
        if (bonus != null && bonus < 0) {
          penalizedFish.push({ name: profile.name, bonus });
        }
      }
      if (penalizedFish.length > 0) {
        const names = penalizedFish.map(f => f.name).join('・');
        reasons.push({ positive: false, text: `${names}は${data.tideName}でスコアが下がります（潮回り相性マイナス）` });
      }
    }

    // 6b. shelterPref='high'なのにshelter低いスポット
    if (data.shelter != null && data.shelter < 0.4 && data.fishScores) {
      const mismatchFish = [];
      for (const [fid, fdata] of Object.entries(data.fishScores)) {
        const profile = FISH_PROFILES[fid];
        if (!profile) continue;
        if (profile.shelterPref === 'high') {
          mismatchFish.push(profile.name);
        }
      }
      if (mismatchFish.length > 0) {
        const names = mismatchFish.join('・');
        reasons.push({ positive: false, text: `${names}はshelter=${data.shelter}の外海では本来の力が出ません（湾奥向きの魚種）` });
      }
    }

    // 6c. シーズン外の魚種
    if (data.fishScores) {
      const offSeasonFish = [];
      for (const [fid, fdata] of Object.entries(data.fishScores)) {
        const profile = FISH_PROFILES[fid];
        if (!profile || !profile.season) continue;
        if (!profile.season.includes(month)) {
          offSeasonFish.push(profile.name);
        }
      }
      if (offSeasonFish.length > 0) {
        const names = offSeasonFish.slice(0, 5).join('・');
        const suffix = offSeasonFish.length > 5 ? `他${offSeasonFish.length - 5}種` : '';
        reasons.push({ positive: false, text: `${names}${suffix}は現在シーズン外です` });
      }
    }

    // ==================== 7. 魚種スコア総合 ====================
    if (data.bestFishScore >= 75) {
      const p = data.bestFishId ? FISH_PROFILES[data.bestFishId] : null;
      reasons.push({ positive: true, text: `${p ? p.name : ''}のスコアが高い (${data.bestFishScore}点)` });
    } else if (data.bestFishScore < 55) {
      reasons.push({ positive: false, text: `主要魚種の期待値が低い (最高${data.bestFishScore}点)` });
    } else if (data.areaFishAvg && data.areaFishAvg - data.bestFishScore > 3) {
      reasons.push({ positive: false, text: `同エリア上位(平均${data.areaFishAvg}点)より魚種スコアが低い (${data.bestFishScore}点)` });
    }

    // ==================== 8. ランキング順位 ====================
    if (percentile <= 0.25) {
      reasons.push({ positive: true, text: `エリア内上位${Math.round(percentile*100)}% — 同日の好スポット` });
    } else if (percentile > 0.75) {
      reasons.push({ positive: false, text: `エリア内下位${100 - Math.round(percentile*100)}% — 他にもっと良いスポットがある` });
    } else if (percentile > 0.50) {
      reasons.push({ positive: false, text: `エリア内${Math.round(percentile*100)}%位 — 中位以下` });
    }

    // ==================== 9. 総合判断文 ====================
    if (rank === 'D') {
      reasons.push({ positive: false, text: `潮・スポット特性・魚種条件が重なって厳しい状況です。代替スポットへの変更を強く推奨します` });
    } else if (rank === 'A') {
      reasons.push({ positive: true, text: `複数の好条件が揃っています。自信を持って釣行できます` });
    }

    return reasons;
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
