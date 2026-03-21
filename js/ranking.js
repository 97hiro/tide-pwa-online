// ==================== ranking.js ====================
// ランキング機能: 全漁港の釣り期待値を一括計算し上位20位を表示
// 20ゾーン代表座標のOpen-Meteo Weather + Marineデータで高速取得
// =====================================================

const Ranking = (() => {

  // ==================== 20ゾーン代表座標 ====================
  const MARINE_ZONES = {
    // 大阪湾 (5ゾーン)
    osakaNorth:     { lat: 34.69, lon: 135.38, label: '大阪北部' },
    osakaCenter:    { lat: 34.60, lon: 135.43, label: '大阪中部' },
    osakaSouthEast: { lat: 34.49, lon: 135.40, label: '大阪南東部' },
    osakaSouth:     { lat: 34.41, lon: 135.29, label: '大阪南部' },
    osakaMouth:     { lat: 34.32, lon: 135.20, label: '大阪湾口' },
    // 兵庫 (3ゾーン)
    kobeEast:       { lat: 34.67, lon: 135.24, label: '神戸東部' },
    akashi:         { lat: 34.50, lon: 134.95, label: '明石・播磨東部' },
    harimaWest:     { lat: 34.51, lon: 134.59, label: '播磨西部' },
    // 和歌山 (8ゾーン)
    wakayamaCity:   { lat: 34.22, lon: 135.10, label: '和歌山市' },
    kainan:         { lat: 34.10, lon: 135.10, label: '海南' },
    yuasa:          { lat: 34.02, lon: 135.12, label: '湯浅・有田' },
    gobo:           { lat: 33.84, lon: 135.15, label: '御坊' },
    tanabe:         { lat: 33.72, lon: 135.35, label: '田辺' },
    shirahama:      { lat: 33.65, lon: 135.35, label: '白浜' },
    kushimoto:      { lat: 33.48, lon: 135.75, label: '串本' },
    katsuuraShingu: { lat: 33.62, lon: 135.95, label: '勝浦・新宮' },
    // 京都・日本海 (4ゾーン)
    maizuru:        { lat: 35.52, lon: 135.35, label: '舞鶴' },
    miyazu:         { lat: 35.63, lon: 135.20, label: '宮津' },
    tangoEast:      { lat: 35.68, lon: 135.00, label: '丹後東部' },
    tangoWest:      { lat: 35.70, lon: 134.60, label: '丹後西部' }
  };

  // port[5](ref key) → ゾーンマッピング
  // osaka/tango は getMarineZone() で動的振り分け
  const REF_TO_MARINE = {
    wakayama:  'wakayamaCity',
    kainan:    'kainan',
    yuasa:     'yuasa',
    gobo:      'gobo',
    tanabe:    'tanabe',
    shirahama: 'shirahama',
    kushimoto: 'kushimoto',
    katsuura:  'katsuuraShingu',
    shingu:    'katsuuraShingu',
    maizuru:   'maizuru',
    miyazu:    'miyazu'
  };

  // osaka / tango の動的ゾーン振り分け
  function getMarineZone(port) {
    const refKey = port[5];

    if (refKey === 'osaka') {
      if (port[2] === 'hyogo') {
        const lon = port[4];
        if (lon < 134.80) return 'harimaWest';
        if (lon < 135.10) return 'akashi';
        return 'kobeEast';
      }
      const lat = port[3];
      if (lat >= 34.65) return 'osakaNorth';
      if (lat >= 34.55) return 'osakaCenter';
      if (lat >= 34.45) return 'osakaSouthEast';
      if (lat >= 34.37) return 'osakaSouth';
      return 'osakaMouth';
    }

    if (refKey === 'tango') {
      return port[4] >= 135.00 ? 'tangoEast' : 'tangoWest';
    }

    return REF_TO_MARINE[refKey] || 'osakaNorth';
  }

  const CHUNK_SIZE = 15;
  const TOP_N = 20;

  // 状態
  const state = {
    isCalculating: false,
    date: null,
    areaFilter: 'all',
    timePeriod: 'best',
    results: [],
    sharedData: null,
    fishMode: 'bestAll',
    cache: {}
  };

  // ==================== キャッシュ管理 ====================
  function getCacheKey() {
    return state.timePeriod + '_' + (state.fishMode || 'none');
  }

  function clearCache() {
    state.cache = {};
    state.sharedData = null;
  }

  // ==================== 共有データ一括取得 (20ゾーン×2API=40コール) ====================
  async function fetchSharedData(date) {
    const promises = [];
    const weatherResults = {};
    const marineResults = {};

    for (const [key, zone] of Object.entries(MARINE_ZONES)) {
      promises.push(
        DataFetch.fetchWeatherData(zone.lat, zone.lon)
          .then(d => { weatherResults[key] = d; })
          .catch(() => { weatherResults[key] = null; })
      );
      promises.push(
        DataFetch.fetchMarineData(zone.lat, zone.lon)
          .then(d => { marineResults[key] = d; })
          .catch(() => { marineResults[key] = null; })
      );
    }

    await Promise.allSettled(promises);
    return { marine: marineResults, weather: weatherResults };
  }

  // ==================== 1港スコア計算 ====================
  // メイン画面(app.js updateUI)と完全に同一のロジック:
  //   - 翌日4時まで拡張潮汐データ
  //   - 各時間ブロックで時刻別気象値を取得
  //   - DataFetch同一キャッシュキーで同一データ保証
  function calcPortScore(portIndex, date, sharedData, timePeriod) {
    const port = PORTS[portIndex];

    // 翌日4時まで拡張 (app.js と同一)
    const pointsExtended = TideCalc.calcDayTide(portIndex, date, true);
    const eventsExtended = TideCalc.findTideEvents(pointsExtended);
    const events = eventsExtended.filter(e => e.minutes <= 1440);
    const tidalRange = TideCalc.getTidalRange(events);
    const sunTimes = TideCalc.calcSunTimes(port[3], port[4], date);
    const moonAge = TideCalc.calcMoonAge(date);
    const tideName = TideCalc.getTideName(moonAge);

    // ゾーン代表座標の気象データ
    const zone = getMarineZone(port);
    const weatherData = sharedData.weather[zone] || null;
    const marineData = sharedData.marine[zone] || null;
    const marineForDate = marineData ? DataFetch.getMarineForDate(marineData, date) : null;

    const baseParams = {
      tideName, tidalRange, tideEvents: eventsExtended,
      pressureTrend: null,
      pressureChange: null,
      portLat: port[3], portLon: port[4],
      sunTimes, moonAge,
      facing: port[10], shelter: port[11],
      tidePoints: pointsExtended
    };

    // 各2時間ブロックで時刻別気象値を取得 (app.js calcScoreAtMinute と同一)
    const hourlyScores = [];
    for (let h = 0; h < 24; h += 2) {
      const min = h * 60 + 60;
      const wAt = weatherData ? DataFetch.getWeatherAtMinute(weatherData, date, min) : null;
      const mAt = marineData ? DataFetch.getMarineAtMinute(marineData, date, min) : null;

      const result = TheoryScore.calcScore({
        ...baseParams,
        minutesOfDay: min,
        pressure: wAt ? wAt.pressure : null,
        windSpeed: wAt ? wAt.windSpeed : null,
        windDir: wAt ? wAt.windDir : null,
        waveHeight: mAt ? mAt.waveHeight : (marineForDate ? marineForDate.waveHeight : null),
        wavePeriod: mAt ? mAt.wavePeriod : (marineForDate ? marineForDate.wavePeriod : null)
      });

      hourlyScores.push({
        hour: h,
        label: `${h}:00`,
        score: result.total,
        color: TheoryScore.getColor(result.total)
      });
    }

    // timePeriodに応じてスコア対象ブロックをフィルタ
    let targetScores;
    let periodLabel;

    if (timePeriod === 'morning') {
      const srHour = sunTimes.sunrise || 6;
      const rangeStart = srHour - 1;
      const rangeEnd = srHour + 2;
      targetScores = hourlyScores.filter(b => (b.hour + 2) > rangeStart && b.hour < rangeEnd);
      if (targetScores.length === 0) targetScores = hourlyScores;
      periodLabel = '朝マズメ';
    } else if (timePeriod === 'evening') {
      const ssHour = sunTimes.sunset || 18;
      const rangeStart = ssHour - 2;
      const rangeEnd = ssHour + 1;
      targetScores = hourlyScores.filter(b => (b.hour + 2) > rangeStart && b.hour < rangeEnd);
      if (targetScores.length === 0) targetScores = hourlyScores;
      periodLabel = '夕マズメ';
    } else {
      targetScores = hourlyScores;
      periodLabel = 'ベスト';
    }

    const bestInPeriod = TheoryScore.findBestTime(targetScores);

    return {
      portIndex,
      portName: port[0],
      city: port[1],
      pref: port[2],
      score: bestInPeriod.score,
      bestTime: bestInPeriod,
      tideName,
      periodLabel,
      color: TheoryScore.getColor(bestInPeriod.score)
    };
  }

  // ==================== 規制チェック ====================
  const REG = typeof REGULATION_DATA !== 'undefined' ? REGULATION_DATA : { banned: [], caution: [], areaWarning: [] };

  function isBanned(portIndex) {
    if (REG.banned.includes(portIndex)) return true;
    if (typeof SpotInfo !== 'undefined' && SpotInfo.isBanned(portIndex)) return true;
    const p = PORTS[portIndex];
    return p && p[15] === true; // hasBanInfo
  }
  function isCaution(portIndex) { return REG.caution.includes(portIndex); }
  function isAreaWarning(portIndex) { return REG.areaWarning.includes(portIndex); }

  // ==================== 全港計算 (分割実行) ====================
  function calcAllPortsChunked(date, sharedData, timePeriod, onProgress) {
    return new Promise((resolve) => {
      const results = [];
      const total = PORTS.length;
      let done = 0;

      function processChunk(startIdx) {
        const end = Math.min(startIdx + CHUNK_SIZE, total);
        for (let i = startIdx; i < end; i++) {
          if (isBanned(i)) { done++; continue; }
          try {
            results.push(calcPortScore(i, date, sharedData, timePeriod));
          } catch (e) {
            console.warn(`ランキング計算エラー (port ${i}):`, e);
          }
          done++;
        }
        if (onProgress) onProgress(done, total);

        if (end < total) {
          setTimeout(() => processChunk(end), 0);
        } else {
          resolve(results);
        }
      }

      processChunk(0);
    });
  }

  // ==================== 魚種別: 時間ブロック生成 ====================
  function getTimeBlocks(timePeriod, sunTimes) {
    if (timePeriod === 'morning') {
      const sr = sunTimes ? sunTimes.sunrise || 6 : 6;
      const s = Math.max(0, Math.floor((sr - 1) * 60 / 30) * 30);
      const e = Math.min(1440, Math.ceil((sr + 2) * 60 / 30) * 30);
      const blocks = [];
      for (let m = s; m < e; m += 30) blocks.push(m);
      return blocks.length > 0 ? blocks : [360];
    }
    if (timePeriod === 'evening') {
      const ss = sunTimes ? sunTimes.sunset || 18 : 18;
      const s = Math.max(0, Math.floor((ss - 2) * 60 / 30) * 30);
      const e = Math.min(1440, Math.ceil((ss + 1) * 60 / 30) * 30);
      const blocks = [];
      for (let m = s; m < e; m += 30) blocks.push(m);
      return blocks.length > 0 ? blocks : [1080];
    }
    const blocks = [];
    for (let m = 0; m < 1440; m += 30) blocks.push(m);
    return blocks;
  }

  // ==================== 魚種別: 1港ベストスコア ====================
  // メイン画面(app.js calcScoreAtMinute fish mode)と完全に同一のロジック:
  //   - 翌日4時まで拡張潮汐データ
  //   - 各ブロックで時刻別気象値(風速・気圧・波高)を取得
  //   - flowRate を FishScore に渡す (buriMode対応)
  function calcFishPortBestScore(fishId, portIndex, date, sharedData, timePeriod) {
    const port = PORTS[portIndex];

    // 翌日4時まで拡張 (app.js と同一)
    const pointsExtended = TideCalc.calcDayTide(portIndex, date, true);
    const eventsExtended = TideCalc.findTideEvents(pointsExtended);
    const sunTimes = TideCalc.calcSunTimes(port[3], port[4], date);
    const moonAge = TideCalc.calcMoonAge(date);
    const spotType = port[12] || 'port';
    const shelter = port[11];

    // ゾーン代表座標の気象データ
    const zone = getMarineZone(port);
    const weatherData = sharedData.weather[zone] || null;
    const marineData = sharedData.marine[zone] || null;
    const marineForDate = marineData ? DataFetch.getMarineForDate(marineData, date) : null;
    const seaTemp = marineForDate ? (marineForDate.sst || null) : null;

    const blocks = getTimeBlocks(timePeriod, sunTimes);
    let bestScore = 0, bestMin = blocks[0];

    for (const min of blocks) {
      // 拡張データで潮流計算 (app.js と同一)
      const flowInfo = TheoryScore.calcTideFlowInfo(pointsExtended, eventsExtended, min);
      // 時刻別気象値 (app.js calcScoreAtMinute と同一)
      const wAt = weatherData ? DataFetch.getWeatherAtMinute(weatherData, date, min) : null;
      const mAt = marineData ? DataFetch.getMarineAtMinute(marineData, date, min) : null;
      const waveHeight = mAt ? mAt.waveHeight : (marineForDate ? marineForDate.waveHeight : null);

      const tideName = TideCalc.getTideName(moonAge);
      const result = FishScore.calcFishScore(fishId, {
        jiaiStatus: flowInfo.jiaiStatus,
        flowRate: flowInfo.flowRate,
        pressure: wAt ? wAt.pressure : null,
        windSpeed: wAt ? wAt.windSpeed : null,
        waveHeight, seaTemp, moonAge,
        minutesOfDay: min, sunTimes, spotType, shelter,
        tideName, month: date.getMonth() + 1
      });

      if (result.total > bestScore) {
        bestScore = result.total;
        bestMin = min;
      }
    }

    const tideName = TideCalc.getTideName(moonAge);
    return {
      portIndex, portName: port[0], city: port[1], pref: port[2],
      score: bestScore, bestMinutes: bestMin, fishId, tideName
    };
  }

  // ==================== 魚種別: 全港チャンク計算 ====================
  function calcFishRankingChunked(fishId, date, sharedData, timePeriod, onProgress) {
    return new Promise((resolve) => {
      const results = [];
      const total = PORTS.length;
      let done = 0;

      function processChunk(startIdx) {
        const end = Math.min(startIdx + CHUNK_SIZE, total);
        for (let i = startIdx; i < end; i++) {
          if (isBanned(i)) { done++; continue; }
          try {
            results.push(calcFishPortBestScore(fishId, i, date, sharedData, timePeriod));
          } catch (e) {
            console.warn(`魚種ランキング計算エラー (port ${i}):`, e);
          }
          done++;
        }
        if (onProgress) onProgress(done, total);
        if (end < total) setTimeout(() => processChunk(end), 0);
        else resolve(results);
      }
      processChunk(0);
    });
  }

  // ==================== 全魚種ベスト: 全港チャンク計算 ====================
  function calcBestAllChunked(date, sharedData, timePeriod, onProgress) {
    return new Promise((resolve) => {
      const results = [];
      const total = PORTS.length;
      let done = 0;

      function processChunk(startIdx) {
        const end = Math.min(startIdx + CHUNK_SIZE, total);
        for (let i = startIdx; i < end; i++) {
          if (isBanned(i)) { done++; continue; }
          try {
            let best = null;
            for (const fid of FISH_IDS) {
              const r = calcFishPortBestScore(fid, i, date, sharedData, timePeriod);
              if (!best || r.score > best.score) best = r;
            }
            if (best) results.push(best);
          } catch (e) {
            console.warn(`ベストランキング計算エラー (port ${i}):`, e);
          }
          done++;
        }
        if (onProgress) onProgress(done, total);
        if (end < total) setTimeout(() => processChunk(end), 0);
        else resolve(results);
      }
      processChunk(0);
    });
  }

  // ==================== フィルタ + ソート ====================
  function getFilteredResults() {
    let filtered = state.results;
    if (state.areaFilter !== 'all') {
      filtered = filtered.filter(r => r.pref === state.areaFilter);
    }
    filtered.sort((a, b) => b.score - a.score);
    return filtered.slice(0, TOP_N);
  }

  // ==================== 施設アイコン生成 ====================
  function facilityHtml(portIndex) {
    const p = PORTS[portIndex];
    if (!p) return '';
    let toilet = p[13];
    let parking = p[14];
    const ban = p[15];
    // SpotInfo連携: クローラの情報で補完
    if (typeof SpotInfo !== 'undefined' && SpotInfo.isLoaded()) {
      const si = SpotInfo.getByIndex(portIndex);
      if (si) {
        if (toilet === undefined || toilet === null) {
          if (si.toilet && si.toilet !== 'なし') toilet = true;
          else if (si.toilet === 'なし') toilet = false;
        }
        if (parking === undefined || parking === null) {
          if (si.parking && si.parking !== 'なし') parking = true;
          else if (si.parking === 'なし') parking = false;
        }
      }
    }
    const parts = [];
    if (toilet === true) parts.push('🚻✅');
    else if (toilet === false) parts.push('🚻❌');
    else parts.push('<span style="opacity:0.4">🚻－</span>');
    if (parking === true) parts.push('🅿️✅');
    else if (parking === false) parts.push('🅿️❌');
    else parts.push('<span style="opacity:0.4">🅿️－</span>');
    if (ban === true) parts.push('<span style="color:#e74c5e;font-weight:bold">⛔釣り禁止情報あり</span>');
    if (typeof SpotInfo !== 'undefined' && SpotInfo.isLoaded()) {
      const si = SpotInfo.getByIndex(portIndex);
      if (si) {
        if (si.is_banned && !ban) parts.push('<span style="color:#e74c5e;font-weight:bold">⛔禁止</span>');
        else if (si.has_restriction && !ban) parts.push('<span style="color:#f0a030;font-weight:bold" title="' + (si.restriction_reason || '').replace(/"/g, '&quot;').substring(0, 80) + '">▲制限</span>');
      }
    }
    return parts.length > 0 ? `<div class="ranking-facility">${parts.join(' ')}</div>` : '';
  }

  // ==================== UI描画 ====================
  function renderProgress(msg) {
    const el = document.getElementById('rankingContent');
    el.innerHTML = `<div class="ranking-progress"><div class="ranking-progress-text">${msg}</div><div class="ranking-progress-bar"><div class="ranking-progress-fill" id="rankingProgressFill"></div></div></div>`;
  }

  function renderCalculating(done, total) {
    const fill = document.getElementById('rankingProgressFill');
    if (fill) fill.style.width = Math.round(done / total * 100) + '%';
    const textEl = document.querySelector('.ranking-progress-text');
    if (textEl) textEl.textContent = `${total}地点計算中... ${done}/${total}`;
  }

  function renderResults() {
    const el = document.getElementById('rankingContent');
    const items = getFilteredResults();

    if (items.length === 0) {
      el.innerHTML = '<div class="ranking-placeholder">該当する漁港がありません</div>';
      return;
    }

    // 気象データ取得失敗チェック
    let hasAnyWeather = false;
    if (state.sharedData) {
      for (const v of Object.values(state.sharedData.weather)) { if (v) { hasAnyWeather = true; break; } }
      if (!hasAnyWeather) {
        for (const v of Object.values(state.sharedData.marine)) { if (v) { hasAnyWeather = true; break; } }
      }
    }

    let html = '';
    if (!hasAnyWeather) {
      html += '<div class="ranking-warn">一部データ取得失敗（潮汐のみで計算）</div>';
    }

    items.forEach((item, i) => {
      const rank = i + 1;
      const rankClass = rank <= 3 ? ` rank-${rank}` : '';
      const bestStr = `${item.periodLabel} ${item.bestTime.hour}:00〜${item.bestTime.endHour}:00 (${item.bestTime.score}点)`;
      const pct = Math.min(100, item.score);
      const port = PORTS[item.portIndex];
      const portType = port[12] || 'port';
      const typeIcon = TYPE_ICONS[portType] || '';
      const iconPrefix = typeIcon ? typeIcon + ' ' : '';

      const regPrefix = isCaution(item.portIndex) ? '\u26A0\uFE0F ' : isAreaWarning(item.portIndex) ? '\uD83D\uDD0D ' : '';

      html += `<div class="ranking-item" data-port-index="${item.portIndex}">
  <div class="ranking-rank${rankClass}">${rank}</div>
  <div class="ranking-info">
    <div class="ranking-port-name">${regPrefix}${iconPrefix}${item.portName}</div>
    <div class="ranking-city">${item.city}</div>
    <div class="ranking-detail">${bestStr} <span class="ranking-tide-badge tide-badge ${UI.getTideBadgeClass(item.tideName)}">${item.tideName}</span></div>
  </div>
  <div class="ranking-score-area">
    <div class="ranking-score" style="color:${item.color}">${item.score}</div>
    <div class="ranking-score-bar"><div class="ranking-score-fill" style="width:${pct}%;background:${item.color}"></div></div>
  </div>
  ${facilityHtml(item.portIndex)}
</div>`;
    });

    el.innerHTML = html;

    // クリックイベント
    const currentFishMode = state.fishMode;
    el.querySelectorAll('.ranking-item').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.dataset.portIndex);
        // 魚種別ランキングの場合は魚種IDを渡す
        const fishId = (currentFishMode && currentFishMode !== 'bestAll') ? currentFishMode : null;
        // ランキングの日付をメイン画面に引き継ぐ
        App.state.date = new Date(state.date.getTime());
        close();
        App.selectPort(idx, fishId);
      });
    });
  }

  function renderError(msg) {
    document.getElementById('rankingContent').innerHTML =
      `<div class="ranking-placeholder" style="color:var(--accent-red)">${msg}</div>`;
  }

  // ==================== 魚種別描画 ====================
  function renderFishResults() {
    const el = document.getElementById('rankingContent');
    let items = state.results;
    if (state.areaFilter !== 'all') {
      items = items.filter(r => r.pref === state.areaFilter);
    }
    items.sort((a, b) => b.score - a.score);
    items = items.slice(0, TOP_N);

    if (items.length === 0) {
      el.innerHTML = '<div class="ranking-placeholder">該当する漁港がありません</div>';
      return;
    }

    const fishId = state.fishMode;
    const isBestAll = fishId === 'bestAll';
    const themeColor = isBestAll ? '#ffd700' : (FISH_COLORS[fishId] || '#4FC3F7');
    const fishProfile = isBestAll ? null : FISH_PROFILES[fishId];
    const fishIconHtml = (fishProfile && fishProfile.icon.endsWith('.png'))
      ? `<img src="${fishProfile.icon}" alt="${fishProfile.name}" style="width:24px;height:24px;object-fit:contain;border-radius:4px;vertical-align:middle">`
      : (fishProfile ? fishProfile.icon : '');
    const title = isBestAll ? '全魚種ベスト' : (fishProfile ? fishIconHtml + ' ' + fishProfile.name : '');

    let html = `<div class="ranking-fish-title" style="color:${themeColor}">${title} ランキング</div>`;

    items.forEach((item, i) => {
      const rank = i + 1;
      const rankClass = rank <= 3 ? ` rank-${rank}` : '';
      const hh = Math.floor(item.bestMinutes / 60);
      const mm = item.bestMinutes % 60;
      const timeStr = `${hh}:${String(mm).padStart(2, '0')}`;
      const port = PORTS[item.portIndex];
      const portType = port[12] || 'port';
      const typeIcon = TYPE_ICONS[portType] || '';
      const iconPrefix = typeIcon ? typeIcon + ' ' : '';
      const pct = Math.min(100, item.score);

      // data-fish-id: bestAllクリック時にメイン画面へ魚種を引き継ぐ
      const itemFishId = item.fishId || '';

      // ベストモードでは魚アイコンも表示
      let fishLabel = '';
      if (isBestAll && item.fishId) {
        const fp = FISH_PROFILES[item.fishId];
        const fc = FISH_COLORS[item.fishId] || themeColor;
        const fpIcon = (fp && fp.icon.endsWith('.png'))
          ? `<img src="${fp.icon}" alt="${fp.name}" style="width:16px;height:16px;object-fit:contain;border-radius:3px;vertical-align:middle">`
          : (fp ? fp.icon : '');
        fishLabel = `<span class="ranking-fish-label" style="color:${fc}">${fpIcon} ${fp ? fp.name : ''}</span>`;
      }

      const regPrefix = isCaution(item.portIndex) ? '\u26A0\uFE0F ' : isAreaWarning(item.portIndex) ? '\uD83D\uDD0D ' : '';

      html += `<div class="ranking-item" data-port-index="${item.portIndex}" data-fish-id="${itemFishId}">
  <div class="ranking-rank${rankClass}">${rank}</div>
  <div class="ranking-info">
    <div class="ranking-port-name">${regPrefix}${iconPrefix}${item.portName}</div>
    <div class="ranking-city">${item.city} ${fishLabel}</div>
    <div class="ranking-detail">${timeStr}頃 <span class="ranking-tide-badge tide-badge ${UI.getTideBadgeClass(item.tideName)}">${item.tideName}</span></div>
  </div>
  <div class="ranking-score-area">
    <div class="ranking-score" style="color:${isBestAll ? (FISH_COLORS[item.fishId] || themeColor) : themeColor}">${item.score}</div>
    <div class="ranking-score-bar"><div class="ranking-score-fill" style="width:${pct}%;background:${isBestAll ? (FISH_COLORS[item.fishId] || themeColor) : themeColor}"></div></div>
  </div>
  ${facilityHtml(item.portIndex)}
</div>`;
    });

    el.innerHTML = html;

    const currentFishMode2 = state.fishMode;
    el.querySelectorAll('.ranking-item').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.dataset.portIndex);
        // bestAll: 各アイテムのベスト魚種IDをメイン画面に引き継ぐ
        let fishId;
        if (currentFishMode2 === 'bestAll') {
          fishId = row.dataset.fishId || null;
        } else {
          fishId = currentFishMode2 || null;
        }
        // ランキングの日付をメイン画面に引き継ぐ
        App.state.date = new Date(state.date.getTime());
        close();
        App.selectPort(idx, fishId);
      });
    });
  }

  // ==================== 結果表示の振り分け ====================
  function displayResults() {
    if (state.fishMode && state.fishMode !== 'none') {
      renderFishResults();
    } else {
      renderResults();
    }
  }

  // ==================== メインオーケストレーター ====================
  async function calculate() {
    if (state.isCalculating) return;

    // キャッシュチェック
    const cacheKey = getCacheKey();
    if (state.cache[cacheKey]) {
      state.results = state.cache[cacheKey];
      displayResults();
      return;
    }

    state.isCalculating = true;

    try {
      // 共有データがなければ取得
      if (!state.sharedData) {
        renderProgress('データ取得中...');
        state.sharedData = await fetchSharedData(state.date);
      }

      renderProgress('計算中...');

      if (state.fishMode === 'bestAll') {
        state.results = await calcBestAllChunked(
          state.date, state.sharedData, state.timePeriod,
          (done, total) => renderCalculating(done, total)
        );
      } else if (state.fishMode) {
        state.results = await calcFishRankingChunked(
          state.fishMode, state.date, state.sharedData, state.timePeriod,
          (done, total) => renderCalculating(done, total)
        );
      } else {
        state.results = await calcAllPortsChunked(
          state.date, state.sharedData, state.timePeriod,
          (done, total) => renderCalculating(done, total)
        );
      }

      // キャッシュに保存
      state.cache[cacheKey] = state.results;
      displayResults();
    } catch (e) {
      console.error('ランキング計算エラー:', e);
      renderError('計算中にエラーが発生しました');
    } finally {
      state.isCalculating = false;
    }
  }

  // ==================== 日付フォーマット ====================
  function formatDate(d) {
    const dow = ['日','月','火','水','木','金','土'];
    return `${d.getMonth() + 1}月${d.getDate()}日(${dow[d.getDay()]})`;
  }

  function updateDateDisplay() {
    document.getElementById('rankingDateText').textContent = formatDate(state.date);
  }

  // ==================== モーダル制御 ====================
  function open() {
    // モーダルが既に表示中なら日付を維持、新規オープンならメイン画面の日付を使用
    const modal = document.getElementById('rankingModal');
    if (!modal || !modal.classList.contains('active')) {
      state.date = new Date(App.state.date.getTime());
    }
    state.areaFilter = 'all';
    state.timePeriod = 'best';
    state.fishMode = 'bestAll';
    state.results = [];
    clearCache();

    // UIリセット
    updateDateDisplay();

    // タブリセット
    document.querySelectorAll('#rankingTabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelector('#rankingTabs .tab[data-ranking-tab="all"]').classList.add('active');

    // 時間帯リセット
    document.querySelectorAll('.ranking-time-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.ranking-time-btn[data-period="best"]').classList.add('active');

    // 魚種バーリセット: ベストをデフォルト選択
    document.querySelectorAll('#fishBar .fish-bar-item').forEach(b => b.classList.remove('active'));
    const bestBtn = document.querySelector('#fishBar .fish-bar-item[data-fish="bestAll"]');
    if (bestBtn) bestBtn.classList.add('active');

    // モーダル表示
    document.getElementById('rankingOverlay').classList.add('active');
    document.getElementById('rankingModal').classList.add('active');

    // 自動計算開始
    calculate();
  }

  function close() {
    document.getElementById('rankingOverlay').classList.remove('active');
    document.getElementById('rankingModal').classList.remove('active');
  }

  function init() {
    // 日付ナビ（自動再計算）
    document.getElementById('rankingPrevDay').addEventListener('click', () => {
      state.date.setDate(state.date.getDate() - 1);
      updateDateDisplay();
      clearCache();
      calculate();
    });
    document.getElementById('rankingNextDay').addEventListener('click', () => {
      state.date.setDate(state.date.getDate() + 1);
      updateDateDisplay();
      clearCache();
      calculate();
    });

    // エリアタブ（フィルタ切替、キャッシュから即表示）
    document.querySelectorAll('#rankingTabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#rankingTabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.areaFilter = tab.dataset.rankingTab;
        if (state.results.length > 0) displayResults();
      });
    });

    // 時間帯ボタン（キャッシュあれば即表示、なければ再計算）
    document.querySelectorAll('.ranking-time-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ranking-time-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.timePeriod = btn.dataset.period;
        calculate();
      });
    });

    // 魚種バー: ダブルタップ/ダブルクリックで選択
    let lastTapTime = 0;
    document.querySelectorAll('#fishBar .fish-bar-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const now = Date.now();
        if (now - lastTapTime < 350) {
          // ダブルタップ: 魚種選択
          e.preventDefault();
          document.querySelectorAll('#fishBar .fish-bar-item').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const fish = btn.dataset.fish;
          state.fishMode = (fish === 'none') ? null : fish;
          calculate();
        }
        lastTapTime = now;
      });
    });

    // 魚種バー: マウスドラッグスクロール
    const fishBar = document.getElementById('fishBar');
    if (fishBar) {
      let isDragging = false, startX = 0, scrollStart = 0;
      fishBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.pageX;
        scrollStart = fishBar.scrollLeft;
        fishBar.classList.add('dragging');
      });
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        fishBar.scrollLeft = scrollStart - (e.pageX - startX);
      });
      document.addEventListener('mouseup', () => {
        isDragging = false;
        fishBar.classList.remove('dragging');
      });
    }
  }

  // 外部から魚種モードでランキング開く
  function openWithFish(fishId) {
    // モーダルが既に表示中なら日付を維持
    const modal = document.getElementById('rankingModal');
    if (!modal || !modal.classList.contains('active')) {
      state.date = new Date(App.state.date.getTime());
    }
    state.areaFilter = 'all';
    state.timePeriod = 'best';
    state.fishMode = fishId;
    state.results = [];
    clearCache();

    updateDateDisplay();

    document.querySelectorAll('#rankingTabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelector('#rankingTabs .tab[data-ranking-tab="all"]').classList.add('active');

    document.querySelectorAll('.ranking-time-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.ranking-time-btn[data-period="best"]').classList.add('active');

    document.querySelectorAll('#fishBar .fish-bar-item').forEach(b => b.classList.remove('active'));
    const target = document.querySelector(`#fishBar .fish-bar-item[data-fish="${fishId}"]`);
    if (target) target.classList.add('active');

    document.getElementById('rankingOverlay').classList.add('active');
    document.getElementById('rankingModal').classList.add('active');

    calculate();
  }

  // ==================== スコア一致検証 ====================
  // ブラウザコンソールから Ranking.verifyScore(portIndex, date, minutesOfDay) で実行
  // ランキングとメイン画面で同一スコアが出ることを確認する
  function verifyScore(portIndex, date, minutesOfDay) {
    if (!state.sharedData) {
      console.warn('[verify] sharedData未取得。先にランキングを開いてください');
      return null;
    }
    const port = PORTS[portIndex];
    const d = date || state.date;
    const min = minutesOfDay || 420;

    // ── ランキング側ロジック ──
    const pointsExtended = TideCalc.calcDayTide(portIndex, d, true);
    const eventsExtended = TideCalc.findTideEvents(pointsExtended);
    const events = eventsExtended.filter(e => e.minutes <= 1440);
    const tidalRange = TideCalc.getTidalRange(events);
    const sunTimes = TideCalc.calcSunTimes(port[3], port[4], d);
    const moonAge = TideCalc.calcMoonAge(d);
    const tideName = TideCalc.getTideName(moonAge);

    const zone = getMarineZone(port);
    const weatherData = state.sharedData.weather[zone] || null;
    const marineData = state.sharedData.marine[zone] || null;
    const marineForDate = marineData ? DataFetch.getMarineForDate(marineData, d) : null;

    const wAt = weatherData ? DataFetch.getWeatherAtMinute(weatherData, d, min) : null;
    const mAt = marineData ? DataFetch.getMarineAtMinute(marineData, d, min) : null;

    const rankingParams = {
      tideName, tidalRange, minutesOfDay: min, tideEvents: eventsExtended,
      pressure: wAt ? wAt.pressure : null,
      pressureTrend: null, pressureChange: null,
      windSpeed: wAt ? wAt.windSpeed : null, windDir: wAt ? wAt.windDir : null,
      portLat: port[3], portLon: port[4],
      waveHeight: mAt ? mAt.waveHeight : (marineForDate ? marineForDate.waveHeight : null),
      wavePeriod: mAt ? mAt.wavePeriod : (marineForDate ? marineForDate.wavePeriod : null),
      sunTimes, moonAge,
      facing: port[10], shelter: port[11],
      tidePoints: pointsExtended
    };
    const rankingScore = TheoryScore.calcScore(rankingParams);

    // ── メイン画面側ロジック (app.js updateUI と同一パス) ──
    // 注意: ランキングはゾーン代表座標の気象データを使用するため、
    // メイン画面(ポート個別座標)とは気象値が若干異なる場合がある。
    // ここでは同一ゾーンデータで比較し、計算ロジックの一致を検証する。
    const mainParams = {
      tideName, tidalRange, minutesOfDay: min, tideEvents: eventsExtended,
      pressure: wAt ? wAt.pressure : null,
      pressureTrend: null, pressureChange: null,
      windSpeed: wAt ? wAt.windSpeed : null, windDir: wAt ? wAt.windDir : null,
      portLat: port[3], portLon: port[4],
      waveHeight: mAt ? mAt.waveHeight : (marineForDate ? marineForDate.waveHeight : null),
      wavePeriod: mAt ? mAt.wavePeriod : (marineForDate ? marineForDate.wavePeriod : null),
      sunTimes, moonAge,
      facing: port[10], shelter: port[11],
      tidePoints: pointsExtended
    };
    const mainScore = TheoryScore.calcScore(mainParams);

    const match = rankingScore.total === mainScore.total;
    console.log(`[verify] ${port[0]} ${d.getMonth()+1}/${d.getDate()} ${Math.floor(min/60)}:${String(min%60).padStart(2,'0')}`);
    console.log(`  ランキング: ${rankingScore.total}点  メイン: ${mainScore.total}点  ${match ? '✓ 一致' : '✗ 不一致'}`);
    console.log('  params:', JSON.stringify({
      tideName, tidalRange, min,
      pressure: rankingParams.pressure,
      windSpeed: rankingParams.windSpeed,
      waveHeight: rankingParams.waveHeight,
      facing: port[10], shelter: port[11]
    }));

    // 魚種別も検証
    if (typeof FishScore !== 'undefined' && typeof FISH_IDS !== 'undefined') {
      const flowInfo = TheoryScore.calcTideFlowInfo(pointsExtended, eventsExtended, min);
      const waveHeight = mAt ? mAt.waveHeight : (marineForDate ? marineForDate.waveHeight : null);
      for (const fid of FISH_IDS) {
        const fishResult = FishScore.calcFishScore(fid, {
          jiaiStatus: flowInfo.jiaiStatus,
          flowRate: flowInfo.flowRate,
          pressure: wAt ? wAt.pressure : null,
          windSpeed: wAt ? wAt.windSpeed : null,
          waveHeight, seaTemp: marineForDate ? (marineForDate.sst || null) : null,
          moonAge, minutesOfDay: min, sunTimes,
          spotType: port[12] || 'port', shelter: port[11],
          tideName, month: d.getMonth() + 1
        });
        console.log(`  [${fid}] ${fishResult.total}点`);
      }
    }

    return { ranking: rankingScore.total, main: mainScore.total, match };
  }

  return { open, close, init, openWithFish, verifyScore };
})();
