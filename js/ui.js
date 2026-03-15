// ==================== ui.js ====================
// UI操作、イベントハンドリング、DOM更新
// =====================================================

const UI = (() => {
  const DAY_NAMES = ['日','月','火','水','木','金','土'];

  function formatDate(d) {
    return `${d.getMonth()+1}月${d.getDate()}日(${DAY_NAMES[d.getDay()]})`;
  }

  function isToday(d) {
    const t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  }

  function getTideBadgeClass(name) {
    switch(name) {
      case '大潮': return 'oshio';
      case '中潮': return 'nakashio';
      case '小潮': return 'koshio';
      case '長潮': return 'nagashio';
      case '若潮': return 'wakashio';
      default: return 'nakashio';
    }
  }

  // ==================== Header ====================
  function updateHeader(port, date, tideName, portIndex) {
    document.getElementById('portName').textContent = port[0];
    const areaText = PREF_NAMES[port[2]] + ' ' + port[1];
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${port[3]},${port[4]}`;
    document.getElementById('portArea').textContent = areaText;
    const linksEl = document.getElementById('portLinks');
    linksEl.innerHTML =
      `<a href="${mapUrl}" target="_blank" rel="noopener" class="map-link">\uD83D\uDCCD 地図で見る</a>` +
      `<button class="nearby-btn" id="nearbyToggle">\uD83C\uDFEA 周辺</button>`;
    linksEl.querySelector('.map-link').addEventListener('click', e => e.stopPropagation());
    document.getElementById('nearbyToggle').addEventListener('click', e => { e.stopPropagation(); Nearby.toggle(portIndex); });
    document.getElementById('dateText').textContent = formatDate(date);

    const badge = document.getElementById('tideBadge');
    badge.textContent = tideName;
    badge.className = 'tide-badge ' + getTideBadgeClass(tideName);
  }

  // ==================== Score Section ====================
  const JIAI_CONFIGS = {
    '上げ七分': { icon: '\uD83D\uDD25', text: '上げ七分（ゴールデンタイム！）', color: '#ff2020' },
    '下げ三分': { icon: '\uD83D\uDD25', text: '下げ三分（活性UP！）', color: '#ff8c00' },
    '上げ三分': { icon: '\uD83C\uDFAF', text: '上げ三分（良い流れ！）', color: '#ffd700' },
    '下げ七分': { icon: '\uD83C\uDFAF', text: '下げ七分（良い流れ！）', color: '#ffd700' },
    '上げ潮中盤': { icon: '\uD83C\uDF0A', text: '上げ潮（潮動いてます）', color: '#40c060' },
    '下げ潮中盤': { icon: '\uD83C\uDF0A', text: '下げ潮（潮動いてます）', color: '#40c060' },
    '潮止まり': { icon: '\u23F8\uFE0F', text: '潮止まり（休憩推奨）', color: '#888888' }
  };

  function updateJiaiStatus(jiaiStatus) {
    const el = document.getElementById('jiaiStatus');
    if (!el) return;
    if (!jiaiStatus) {
      el.style.display = 'none';
      return;
    }
    const cfg = JIAI_CONFIGS[jiaiStatus];
    if (!cfg) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.style.color = cfg.color;
    el.innerHTML = `${cfg.icon} ${cfg.text}`;
  }

  function updateScore(scoreResult, bestTime, isOnline, portIndex, dynamicBestTimes) {
    const numEl = document.getElementById('scoreNumber');
    const msgEl = document.getElementById('scoreMessage');
    const barCanvas = document.getElementById('scoreBarCanvas');
    const bestEl = document.getElementById('scoreBestTime');
    const ratingsEl = document.getElementById('scoreRatings');
    const onlineBadge = document.getElementById('onlineBadge');
    const facilityEl = document.getElementById('scoreFacility');

    const score = scoreResult.total;
    const color = TheoryScore.getColor(score);
    numEl.textContent = score;
    numEl.style.color = color;
    msgEl.textContent = TheoryScore.getMessage(score);
    msgEl.style.color = color;

    TideChart.drawScoreBar(barCanvas, score, color);

    const dynamicText = dynamicBestTimes ? TheoryScore.formatBestTimes(dynamicBestTimes) : null;
    if (dynamicText) {
      bestEl.textContent = `\u30D9\u30B9\u30C8\u30BF\u30A4\u30E0: ${dynamicText}`;
    } else if (bestTime) {
      bestEl.textContent = `\u30D9\u30B9\u30C8\u30BF\u30A4\u30E0: ${bestTime.hour}:00\u301C${bestTime.endHour}:00`;
    }

    // 時合ステータス
    updateJiaiStatus(scoreResult.jiaiStatus);

    // 個別評価
    const labels = { tide: '潮', pressure: '気圧', wind: '風', wave: '波', timing: '時間', tideFlow: '潮流' };
    ratingsEl.innerHTML = '';
    for (const [key, label] of Object.entries(labels)) {
      const rating = scoreResult.ratings[key];
      let ratingColor;
      if (rating === '-') ratingColor = '#5a7090';
      else if (rating === '◎') ratingColor = '#4ecb71';
      else if (rating === '○') ratingColor = '#a0d840';
      else if (rating === '△') ratingColor = '#f0c040';
      else ratingColor = '#e74c5e';
      ratingsEl.innerHTML += `<span class="score-rating-item">${label}:<span class="rating-mark" style="color:${ratingColor}">${rating}</span></span>`;
    }

    // オンラインバッジ
    onlineBadge.textContent = isOnline ? 'LIVE' : 'OFFLINE';
    onlineBadge.className = 'online-badge ' + (isOnline ? 'online' : 'offline');

    // 施設情報
    if (facilityEl) {
      const p = (typeof portIndex === 'number') ? PORTS[portIndex] : null;
      if (p) {
        const parts = [];
        if (p[13] === true) parts.push('🚻✅');
        else if (p[13] === false) parts.push('🚻❌');
        if (p[14] === true) parts.push('🅿\uFE0F✅');
        else if (p[14] === false) parts.push('🅿\uFE0F❌');
        if (p[15] === true) parts.push('<span style="color:#e74c5e;font-weight:bold">⛔釣り禁止情報あり</span>');
        // SpotInfo連携: クローラさんの詳細情報を追加
        let spotDetail = '';
        if (typeof SpotInfo !== 'undefined' && SpotInfo.isLoaded()) {
          spotDetail = SpotInfo.renderDetail(portIndex);
        }
        facilityEl.innerHTML = parts.join(' ') + spotDetail;
        facilityEl.style.display = (parts.length > 0 || spotDetail) ? '' : 'none';
      } else {
        facilityEl.innerHTML = '';
        facilityEl.style.display = 'none';
      }
    }
  }

  // ==================== Tide Graph ====================
  function updateGraph(points, events, sunTimes, td, pressureHpa, hourlyScores, gpScores, dynamicBestTimes) {
    const canvas = document.getElementById('tideCanvas');
    TideChart.drawTideGraph(canvas, {
      points, events, sunTimes, isToday: td,
      pressureHpa, hourlyScores, gpScores, dynamicBestTimes
    });
  }

  // ==================== Weather Cards ====================
  // Open-Meteo Weather + Marine データで全カードを更新
  // 風向と港facingから相性テキストを返す
  function getWindCompat(windDirDeg, facing) {
    if (windDirDeg == null || facing == null) return null;
    // facingは港が海に向いている方向。風が海側(facing方向)から来れば向かい風、陸側から来れば追い風
    let angDiff = Math.abs(windDirDeg - facing);
    if (angDiff > 180) angDiff = 360 - angDiff;
    if (angDiff <= 30) return { text: '向かい風', icon: '\u{1F623}', color: '#ff4444' };
    if (angDiff <= 60) return { text: 'やや向かい風', icon: '\u{1F61F}', color: '#f0943a' };
    if (angDiff >= 150) return { text: '追い風', icon: '\u{1F60A}', color: '#00cc66' };
    if (angDiff >= 120) return { text: 'やや追い風', icon: '\u{1F642}', color: '#a0d840' };
    return { text: '横風', icon: '\u{1F914}', color: '#f0c040' };
  }

  function updateWindCompat(windDirDeg, facing) {
    const el = document.getElementById('windCompatDisplay');
    if (!el) return;
    const compat = getWindCompat(windDirDeg, facing);
    if (compat) {
      el.innerHTML = `<span class="wind-compat-icon">${compat.icon}</span><span class="wind-compat-text" style="color:${compat.color}">${compat.text}</span>`;
    } else {
      el.innerHTML = '';
    }
  }

  // --- 風カード ---
  function updateWindCard(weatherAtTime, facing) {
    const windCanvas = document.getElementById('windArrowCanvas');
    const windLabel = document.querySelector('#windCard .card-label');

    if (weatherAtTime && weatherAtTime.windSpeed != null) {
      const ws = weatherAtTime.windSpeed;
      const wd = weatherAtTime.windDir;
      const dirName = DataFetch.windDirName(wd);
      const speedColor = ws < 3 ? '#4ecb71' : ws < 7 ? '#f0c040' : ws < 15 ? '#f0943a' : '#e74c5e';
      if (windLabel) windLabel.textContent = '風';
      document.getElementById('windSpeedText').innerHTML =
        `<span style="color:${speedColor};font-size:18px;font-weight:700">${ws}</span> <span style="font-size:12px">m/s</span>`;
      document.getElementById('windDirText').textContent = dirName;
      TideChart.drawWindArrow(windCanvas, wd, ws);
      updateWindCompat(wd, facing);
    } else {
      if (windLabel) windLabel.textContent = '風';
      document.getElementById('windSpeedText').innerHTML = '<span style="color:var(--text-secondary)">--</span>';
      document.getElementById('windDirText').textContent = '';
      TideChart.drawWindArrow(windCanvas, null, 0);
      updateWindCompat(null, facing);
    }
  }

  // --- 気圧カード ---
  function updatePressureCard(weatherAtTime) {
    const pressEl = document.getElementById('pressureCard');

    if (weatherAtTime && weatherAtTime.pressure != null) {
      const p = weatherAtTime.pressure;
      const corr = TideCalc.pressureCorrection(p);
      const corrText = corr >= 0 ? `+${corr.toFixed(1)}cm` : `${corr.toFixed(1)}cm`;
      const corrColor = corr > 5 ? '#f0943a' : corr < -5 ? '#3ec6e0' : '#a0b0c8';
      pressEl.innerHTML = `
        <div class="card-label">気圧</div>
        <div class="card-value">${p.toFixed(1)} <span style="font-size:12px">hPa</span></div>
        <div class="card-sub">吸い上げ補正: <span style="color:${corrColor}">${corrText}</span></div>
      `;
    } else {
      pressEl.innerHTML = `
        <div class="card-label">気圧</div>
        <div class="card-value" style="color:var(--text-secondary)">--</div>
        <div class="card-sub">データなし</div>
      `;
    }
  }

  // --- 波浪カード ---
  function updateWaveCard(marineForDate, onlineData) {
    const waveEl = document.getElementById('waveCard');
    if (marineForDate && marineForDate.waveHeight != null) {
      const h = marineForDate.waveHeight;
      const levelClass = h < 0.5 ? 'calm' : h < 1.5 ? 'moderate' : 'rough';
      const levelText = h < 0.5 ? '穏やか' : h < 1.5 ? 'やや波あり' : '高波注意';
      const dirText = marineForDate.waveDir != null ? DataFetch.waveDirName(marineForDate.waveDir) : '';
      const periodText = marineForDate.wavePeriod != null ? ' / 周期 ' + marineForDate.wavePeriod.toFixed(1) + 's' : '';
      waveEl.innerHTML = `
        <div class="card-label">波浪</div>
        <div class="card-value"><span class="wave-level ${levelClass}"></span>${h.toFixed(1)} m</div>
        <div class="card-sub">${levelText}${dirText ? ' ' + dirText : ''}${periodText}</div>
      `;
    } else if (marineForDate && marineForDate.sst != null) {
      waveEl.innerHTML = `
        <div class="card-label">波浪</div>
        <div class="card-value" style="color:var(--text-secondary)">--</div>
        <div class="card-sub">この地点のデータなし</div>
      `;
    } else if (onlineData && onlineData.marine != null) {
      waveEl.innerHTML = `
        <div class="card-label">波浪</div>
        <div class="card-value" style="color:var(--text-secondary)">--</div>
        <div class="card-sub">データ範囲外</div>
      `;
    } else if (!onlineData) {
      waveEl.innerHTML = `
        <div class="card-label">波浪</div>
        <div class="card-value" style="color:var(--text-secondary)">--</div>
        <div class="card-sub">取得中...</div>
      `;
    } else {
      waveEl.innerHTML = `
        <div class="card-label">波浪</div>
        <div class="card-value" style="color:var(--text-secondary)">--</div>
        <div class="card-sub">データなし</div>
      `;
    }
  }

  // --- 海水温カード ---
  function updateSstCard(marineForDate, onlineData) {
    const sstEl = document.getElementById('sstCard');
    if (marineForDate && marineForDate.sst != null) {
      const t = marineForDate.sst;
      const tempColor = t < 15 ? '#3ec6e0' : t < 20 ? '#4ecb71' : t < 25 ? '#f0c040' : '#e74c5e';
      let diffText = '';
      if (marineForDate.sstYesterday != null) {
        const diff = t - marineForDate.sstYesterday;
        const diffAbs = Math.abs(diff);
        if (diffAbs >= 0.1) {
          const sign = diff > 0 ? '+' : '';
          const diffColor = diffAbs >= 2 ? '#e74c5e' : diffAbs >= 1 ? '#f0c040' : '#a0b0c8';
          diffText = ` <span style="color:${diffColor};font-size:11px">${sign}${diff.toFixed(1)}℃${diffAbs >= 2 ? ' 急変注意' : ''}</span>`;
        }
      }
      sstEl.innerHTML = `
        <div class="card-label">海水温</div>
        <div class="card-value" style="color:${tempColor}">${t.toFixed(1)} <span style="font-size:12px">℃</span></div>
        <div class="card-sub">${t < 15 ? '冷水域' : t < 20 ? '適温' : t < 25 ? '高水温' : '猛暑域'}${diffText}</div>
      `;
    } else if (onlineData && onlineData.marine != null) {
      sstEl.innerHTML = `
        <div class="card-label">海水温</div>
        <div class="card-value" style="color:var(--text-secondary)">--</div>
        <div class="card-sub">データ範囲外</div>
      `;
    } else if (!onlineData) {
      sstEl.innerHTML = `
        <div class="card-label">海水温</div>
        <div class="card-value" style="color:var(--text-secondary)">--</div>
        <div class="card-sub">取得中...</div>
      `;
    } else {
      sstEl.innerHTML = `
        <div class="card-label">海水温</div>
        <div class="card-value" style="color:var(--text-secondary)">--</div>
        <div class="card-sub">データなし</div>
      `;
    }
  }

  // --- 天気情報 ---
  function updateWeatherInfo(weatherAtTime, weatherForDate) {
    const weatherEl = document.getElementById('weatherInfo');
    const code = weatherAtTime ? weatherAtTime.weatherCode :
                 (weatherForDate ? weatherForDate.weatherCode : null);

    if (code != null) {
      const icon = DataFetch.getWeatherIcon(code);
      const text = DataFetch.getWeatherText(code);
      const precipProb = weatherForDate && weatherForDate.precipProb != null ? weatherForDate.precipProb :
                         (weatherAtTime && weatherAtTime.precipProb != null ? weatherAtTime.precipProb : null);
      const precipText = precipProb != null ? precipProb : '--';
      weatherEl.innerHTML = `
        <span style="font-size:20px">${icon}</span>
        <span style="font-size:12px;color:var(--text-secondary)">${text}</span>
        <span style="font-size:11px;color:var(--accent-cyan)">降水${precipText}%</span>
      `;
    } else {
      weatherEl.innerHTML = '<span style="color:var(--text-secondary);font-size:12px">--</span>';
    }
  }

  // --- 全天気カード一括更新 ---
  function updateWeatherCards(weatherAtTime, weatherForDate, marineForDate, onlineData, facing) {
    updateWindCard(weatherAtTime, facing);
    updatePressureCard(weatherAtTime);
    updateWaveCard(marineForDate, onlineData);
    updateSstCard(marineForDate, onlineData);
    updateWeatherInfo(weatherAtTime, weatherForDate);
  }

  // ==================== Tide Events ====================
  function updateTideEvents(events) {
    const el = document.getElementById('tideEventList');
    el.innerHTML = '';
    for (const ev of events) {
      const t = ev.time.getHours().toString().padStart(2,'0') + ':' + ev.time.getMinutes().toString().padStart(2,'0');
      const name = ev.type === 'high' ? '満潮' : '干潮';
      el.innerHTML += `
        <div class="tide-event-item">
          <span class="tide-event-dot ${ev.type}"></span>
          <div>
            <div class="tide-event-label">${name}</div>
            <div class="tide-event-time">${t}</div>
            <div class="tide-event-height">${ev.height} cm</div>
          </div>
        </div>`;
    }
  }

  // ==================== Next Tide Countdown ====================
  function updateNextTide(events, td) {
    const nameEl = document.getElementById('nextTideName');
    const countEl = document.getElementById('nextTideCountdown');
    const detailEl = document.getElementById('nextTideDetail');

    if (!td || events.length === 0) {
      nameEl.textContent = '--';
      countEl.textContent = td ? '--:--:--' : '当日のみ';
      detailEl.textContent = '';
      return;
    }

    const now = new Date();
    let next = null;
    for (const ev of events) { if (ev.time > now) { next = ev; break; } }
    if (!next) {
      nameEl.textContent = '--';
      countEl.textContent = '本日終了';
      detailEl.textContent = '';
      return;
    }

    const type = next.type === 'high' ? '満潮' : '干潮';
    nameEl.textContent = type;
    nameEl.style.color = next.type === 'high' ? 'var(--high-tide)' : 'var(--low-tide)';

    const diff = next.time - now;
    const hh = Math.floor(diff / 3600000);
    const mm = Math.floor((diff % 3600000) / 60000);
    const ss = Math.floor((diff % 60000) / 1000);
    countEl.textContent = `${hh}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    const t = next.time.getHours().toString().padStart(2,'0') + ':' + next.time.getMinutes().toString().padStart(2,'0');
    detailEl.textContent = `${t} (${next.height}cm)`;
  }

  // ==================== Sun / Moon ====================
  function updateSunMoon(sunTimes, moonAge) {
    document.getElementById('sunriseText').textContent = '日の出 ' + TideCalc.hoursToHHMM(sunTimes.sunrise);
    document.getElementById('sunsetText').textContent = '日の入り ' + TideCalc.hoursToHHMM(sunTimes.sunset);
    document.getElementById('moonAgeText').textContent = moonAge.toFixed(1);
    document.getElementById('moonPhaseText').textContent = TideCalc.getMoonPhaseName(moonAge);
    TideChart.drawMoon(document.getElementById('moonCanvas'), moonAge);
  }

  // ==================== Weekly Scores ====================
  function updateWeekly(days) {
    const canvas = document.getElementById('weeklyCanvas');
    TideChart.drawWeeklyMini(canvas, days);
  }

  // ==================== Port Selection Modal ====================
  function openPortModal() {
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('portModal').classList.add('active');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchInput').focus();
  }

  function closePortModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    document.getElementById('portModal').classList.remove('active');
  }

  function renderPortList(activeTab, favorites, onSelect, onToggleFav) {
    const list = document.getElementById('portList');
    const searchText = document.getElementById('searchInput').value.trim();
    list.innerHTML = '';

    let filtered = [];
    if (searchText) {
      PORTS.forEach((p, i) => {
        if (p[0].includes(searchText) || p[1].includes(searchText)) filtered.push(i);
      });
    } else if (activeTab === 'fav') {
      filtered = favorites.filter(i => i >= 0 && i < PORTS.length);
      if (filtered.length === 0) {
        list.innerHTML = '<div style="padding:32px 16px;text-align:center;color:var(--text-secondary);font-size:13px;">お気に入りがありません<br><span style="font-size:11px">漁港の★をタップして追加</span></div>';
        return;
      }
    } else {
      PORTS.forEach((p, i) => { if (p[2] === activeTab) filtered.push(i); });
    }

    // 県タブは市区町村でグループ化
    if (activeTab !== 'fav' && !searchText) {
      const groups = {};
      for (const i of filtered) {
        const area = PORTS[i][1];
        if (!groups[area]) groups[area] = [];
        groups[area].push(i);
      }
      for (const [area, indices] of Object.entries(groups)) {
        const header = document.createElement('div');
        header.className = 'port-group-header';
        header.textContent = area;
        list.appendChild(header);
        for (const i of indices) list.appendChild(createPortItem(i, favorites, onSelect, onToggleFav));
      }
    } else {
      for (const i of filtered) list.appendChild(createPortItem(i, favorites, onSelect, onToggleFav));
    }
  }

  function createPortItem(portIndex, favorites, onSelect, onToggleFav) {
    const port = PORTS[portIndex];
    const isFav = favorites.includes(portIndex);
    const portType = port[12] || 'port';
    const typeIcon = TYPE_ICONS[portType] || '';
    const iconPrefix = typeIcon ? typeIcon + ' ' : '';
    const item = document.createElement('div');
    item.className = 'port-item';
    const fc = [];
    if (port[13] === true) fc.push('🚻✅');
    else if (port[13] === false) fc.push('🚻❌');
    if (port[14] === true) fc.push('🅿\uFE0F✅');
    else if (port[14] === false) fc.push('🅿\uFE0F❌');
    if (port[15] === true) fc.push('<span style="color:#e74c5e;font-weight:bold">⛔禁止</span>');
    // SpotInfo連携: クローラさんの情報でアイコン補完
    if (typeof SpotInfo !== 'undefined' && SpotInfo.isLoaded()) {
      const si = SpotInfo.getByIndex(portIndex);
      if (si) {
        if (si.is_banned && port[15] !== true) fc.push('<span style="color:#e74c5e;font-weight:bold">⛔禁止</span>');
        if (si.parking && port[14] === undefined) fc.push('🅿\uFE0F');
        if (si.toilet && port[13] === undefined) fc.push(si.toilet === 'なし' ? '🚻❌' : '🚻');
      }
    }
    const facilityStr = fc.length > 0 ? `<span class="port-item-facility">${fc.join(' ')}</span>` : '';
    item.innerHTML = `
      <div>
        <div class="port-item-name">${iconPrefix}${port[0]}${facilityStr}</div>
        <div class="port-item-area">${PREF_NAMES[port[2]]} ${port[1]}</div>
      </div>
      <button class="fav-btn ${isFav ? 'active' : ''}">&#9733;</button>
    `;
    item.querySelector('.port-item-name').parentElement.addEventListener('click', () => onSelect(portIndex));
    item.querySelector('.fav-btn').addEventListener('click', (e) => { e.stopPropagation(); onToggleFav(portIndex); });
    return item;
  }

  // ==================== Fish Mini Scores ====================
  function updateFishMiniScores(fishResults) {
    const el = document.getElementById('fishMiniScores');
    if (!el) return;
    if (!fishResults) { el.innerHTML = ''; return; }

    let html = '';
    for (const fishId of FISH_IDS) {
      const r = fishResults[fishId];
      if (!r) continue;
      const p = FISH_PROFILES[fishId];
      const c = FISH_COLORS[fishId] || '#aaa';
      const isHigh = r.total >= 80;
      const iconHtml = p.icon.endsWith('.png')
        ? `<img src="${p.icon}" alt="${p.name}" style="width:16px;height:16px;object-fit:contain;border-radius:3px">`
        : p.icon;
      html += `<div class="fish-mini-item" data-fish="${fishId}">` +
        `<span class="fish-mini-icon">${iconHtml}</span>` +
        `<span class="fish-mini-score${isHigh ? ' high' : ''}" style="color:${isHigh ? c : 'var(--text-secondary)'}">${r.total}</span>` +
        `</div>`;
    }
    el.innerHTML = html;

    el.querySelectorAll('.fish-mini-item').forEach(item => {
      item.addEventListener('click', () => {
        Ranking.openWithFish(item.dataset.fish);
      });
    });
  }

  // ==================== Nav Buttons ====================
  function updateNavButtons(date, minDate, maxDate) {
    const prev = document.getElementById('prevDay');
    const next = document.getElementById('nextDay');
    const dView = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dMin = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
    const dMax = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
    prev.disabled = dView.getTime() <= dMin.getTime();
    next.disabled = dView.getTime() >= dMax.getTime();
  }

  // Date picker
  function openDatePicker(currentDate, minDate, maxDate) {
    const overlay = document.getElementById('datePickerOverlay');
    const input = document.getElementById('datePickerInput');
    input.value = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(currentDate.getDate()).padStart(2,'0')}`;
    if (minDate) {
      input.min = `${minDate.getFullYear()}-${String(minDate.getMonth()+1).padStart(2,'0')}-${String(minDate.getDate()).padStart(2,'0')}`;
    }
    if (maxDate) {
      input.max = `${maxDate.getFullYear()}-${String(maxDate.getMonth()+1).padStart(2,'0')}-${String(maxDate.getDate()).padStart(2,'0')}`;
    }
    overlay.classList.add('active');
  }

  function closeDatePicker() {
    document.getElementById('datePickerOverlay').classList.remove('active');
  }

  return {
    formatDate, isToday, getTideBadgeClass,
    updateHeader, updateScore, updateGraph, updateWeatherCards,
    updateWindCard, updatePressureCard, updateWaveCard, updateSstCard, updateWeatherInfo,
    updateTideEvents, updateNextTide, updateSunMoon, updateWeekly,
    updateNavButtons, updateFishMiniScores,
    openPortModal, closePortModal, renderPortList,
    openDatePicker, closeDatePicker
  };
})();
