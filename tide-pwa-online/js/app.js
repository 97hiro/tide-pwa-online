// ==================== app.js ====================
// メインアプリケーション: 初期化、状態管理、イベント接続
// =====================================================

const App = (() => {
  // 日付範囲制限
  const DATE_RANGE_PAST = 60;   // 過去60日
  const DATE_RANGE_FUTURE = 7;  // 未来7日

  function getMinDate() {
    const d = new Date();
    d.setDate(d.getDate() - DATE_RANGE_PAST);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function getMaxDate() {
    const d = new Date();
    d.setDate(d.getDate() + DATE_RANGE_FUTURE);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // 状態
  const state = {
    portIndex: 74, // 串本漁港（デフォルト）
    date: new Date(),
    favorites: [],
    activeTab: 'fav',
    onlineData: null,
    refreshTimer: null,
    sliderMinutes: null,      // null=auto(今日=現在時刻,他=正午), number=ユーザー設定値
    lastScoreParams: null,    // スライダー操作用キャッシュ
    lastHourlyScores: null,
    lastBestTime: null,
    lastDynamicBestTimes: null,
    lastIsOnline: false,
    lastWeatherAtTime: null,  // スライダー用: 最後の有効な気象データ
    lastFacing: null,         // スライダー用: 最後の港facing
    gpEnabled: false,         // GP棒グラフ表示
    gpScores: null            // GP 48本分キャッシュ
  };

  // localStorage読み書き
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem('tidegraph_online_state'));
      if (s) {
        if (typeof s.portIndex === 'number' && s.portIndex >= 0 && s.portIndex < PORTS.length) state.portIndex = s.portIndex;
        if (Array.isArray(s.favorites)) state.favorites = s.favorites;
        if (typeof s.gpEnabled === 'boolean') state.gpEnabled = s.gpEnabled;
      }
    } catch(e) {}
  }

  function saveState() {
    try {
      localStorage.setItem('tidegraph_online_state', JSON.stringify({
        portIndex: state.portIndex,
        favorites: state.favorites,
        gpEnabled: state.gpEnabled
      }));
    } catch(e) {}
  }

  // ==================== スライダー時刻取得 ====================
  function getMinutesOfDay() {
    if (state.sliderMinutes != null) return state.sliderMinutes;
    if (UI.isToday(state.date)) {
      const now = new Date();
      return Math.round((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
    }
    return 720;
  }

  // ==================== メイン更新 ====================
  function updateUI() {
    const port = PORTS[state.portIndex];
    const d = state.date;
    const td = UI.isToday(d);

    // 月齢・潮名
    const moonAge = TideCalc.calcMoonAge(d);
    const tideName = TideCalc.getTideName(moonAge);

    // ヘッダー更新
    UI.updateHeader(port, d, tideName, state.portIndex);

    // 潮汐計算
    const points = TideCalc.calcDayTide(state.portIndex, d);
    const events = TideCalc.findTideEvents(points);
    const tidalRange = TideCalc.getTidalRange(events);
    const sunTimes = TideCalc.calcSunTimes(port[3], port[4], d);

    // スコア計算（スライダー位置）
    const minutesOfDay = getMinutesOfDay();

    // Open-Meteo Weather: 過去7日〜未来7日の風・気圧・天気（1時間単位）
    const weather = state.onlineData ? state.onlineData.weather : null;
    const weatherAtTime = weather ? DataFetch.getWeatherAtMinute(weather, d, minutesOfDay) : null;
    const weatherForDate = weather ? DataFetch.getWeatherForDate(weather, d) : null;

    // Open-Meteo Marine: 過去7日〜未来7日の波浪・海水温
    const marine = state.onlineData ? state.onlineData.marine : null;
    const marineForDate = marine ? DataFetch.getMarineForDate(marine, d) : null;
    const marineAtTime = marine ? DataFetch.getMarineAtMinute(marine, d, minutesOfDay) : null;

    // 気象値抽出（時刻別の波浪データを優先、なければ日次データ）
    const windSpeed = weatherAtTime ? weatherAtTime.windSpeed : null;
    const windDir = weatherAtTime ? weatherAtTime.windDir : null;
    const pressure = weatherAtTime ? weatherAtTime.pressure : null;
    const waveHeight = marineAtTime ? marineAtTime.waveHeight : (marineForDate ? marineForDate.waveHeight : null);
    const wavePeriod = marineAtTime ? marineAtTime.wavePeriod : (marineForDate ? marineForDate.wavePeriod : null);

    const adjustedPoints = pressure != null ? TideCalc.applyPressureCorrection(points, pressure) : points;

    const scoreParams = {
      tideName, tidalRange, minutesOfDay, tideEvents: events,
      pressure: pressure,
      pressureTrend: null,
      pressureChange: null,
      windSpeed, windDir,
      portLat: port[3], portLon: port[4],
      waveHeight, wavePeriod,
      sunTimes, moonAge,
      facing: port[10], shelter: port[11],
      tidePoints: points
    };

    const scoreResult = TheoryScore.calcScore(scoreParams);
    const hourlyScores = TheoryScore.calcHourlyScores(scoreParams);
    const bestTime = TheoryScore.findBestTime(hourlyScores);
    const dynamicBestTimes = TheoryScore.findDynamicBestTimes(sunTimes, events, tideName);
    const isOnline = !!(state.onlineData && state.onlineData.isOnline);

    // 潮流デバッグログ（1回だけ）
    TheoryScore.debugLogTideFlow(events);

    // スライダー用にキャッシュ
    state.lastScoreParams = scoreParams;
    state.lastHourlyScores = hourlyScores;
    state.lastBestTime = bestTime;
    state.lastDynamicBestTimes = dynamicBestTimes;
    state.lastIsOnline = isOnline;

    // GP棒グラフ (全48時点のスコアを一括計算)
    if (state.gpEnabled) {
      const gpScores = [];
      for (let min = 0; min < 1440; min += 30) {
        const wAt = weather ? DataFetch.getWeatherAtMinute(weather, d, min) : null;
        const result = TheoryScore.calcScore({
          ...scoreParams,
          minutesOfDay: min,
          windSpeed: wAt ? wAt.windSpeed : null,
          windDir: wAt ? wAt.windDir : null,
          pressure: wAt ? wAt.pressure : null
        });
        gpScores.push({ minutes: min, score: result.total, jiaiStatus: result.jiaiStatus });
      }
      state.gpScores = gpScores;
    } else {
      state.gpScores = null;
    }

    // UI更新
    UI.updateScore(scoreResult, bestTime, isOnline, state.portIndex, dynamicBestTimes);
    UI.updateGraph(adjustedPoints, events, sunTimes, td, pressure, hourlyScores, state.gpScores, dynamicBestTimes);
    UI.updateTideEvents(events);
    UI.updateNextTide(events, td);
    UI.updateSunMoon(sunTimes, moonAge);

    // 風カード用キャッシュ
    if (weatherAtTime) state.lastWeatherAtTime = weatherAtTime;
    state.lastFacing = port[10];

    // 天気カード（波浪は時刻別データ優先）
    const marineDisplayInit = marineAtTime ? {
      waveHeight: marineAtTime.waveHeight,
      wavePeriod: marineAtTime.wavePeriod,
      waveDir: marineAtTime.waveDir,
      sst: marineForDate ? marineForDate.sst : null,
      sstYesterday: marineForDate ? marineForDate.sstYesterday : null,
      source: 'open-meteo'
    } : marineForDate;
    UI.updateWeatherCards(weatherAtTime, weatherForDate, marineDisplayInit, state.onlineData, port[10]);

    // 魚種ミニスコア
    const fishFlowInfo = TheoryScore.calcTideFlowInfo(points, events, minutesOfDay);
    const fishParams = {
      jiaiStatus: fishFlowInfo.jiaiStatus,
      pressure, windSpeed, waveHeight,
      seaTemp: marineForDate ? (marineForDate.sst || null) : null,
      moonAge, minutesOfDay, sunTimes,
      spotType: port[12] || 'port',
      shelter: port[11],
      tideName
    };
    UI.updateFishMiniScores(FishScore.calcAllFishScores(fishParams));

    // ナビボタン状態更新
    UI.updateNavButtons(d, getMinDate(), getMaxDate());

    // 週間スコア
    const weeklyDays = TheoryScore.calcWeeklyScores(state.portIndex, d);
    UI.updateWeekly(weeklyDays);

    // スライダー更新
    const slider = document.getElementById('timeSlider');
    if (slider) {
      slider.value = minutesOfDay;
      const hh = Math.floor(minutesOfDay / 60);
      const mm = minutesOfDay % 60;
      document.getElementById('timeSliderDisplay').textContent =
        `${hh}:${String(mm).padStart(2, '0')}`;
      document.getElementById('timeSliderNow').disabled = !td;
    }

    // スライダー前日/翌日ボタン
    updateSliderDayButtons();

    // グラフオーバーレイ（時刻マーカー）
    TideChart.drawOverlay(document.getElementById('tideOverlay'), minutesOfDay, hourlyScores);
  }

  // ==================== スライダー操作（軽量更新） ====================
  function onSliderChange(minutes) {
    state.sliderMinutes = minutes;
    if (!state.lastScoreParams) return;

    // 新しい時刻の気象データを取得（nullの場合はキャッシュを使用）
    const weather = state.onlineData ? state.onlineData.weather : null;
    const weatherAtTime = weather ? DataFetch.getWeatherAtMinute(weather, state.date, minutes) : null;
    const effectiveWeather = weatherAtTime || state.lastWeatherAtTime;
    if (weatherAtTime) state.lastWeatherAtTime = weatherAtTime;
    const windSpeed = effectiveWeather ? effectiveWeather.windSpeed : null;
    const windDir = effectiveWeather ? effectiveWeather.windDir : null;
    const pressure = effectiveWeather ? effectiveWeather.pressure : null;

    const params = { ...state.lastScoreParams, minutesOfDay: minutes, windSpeed, windDir, pressure };
    const scoreResult = TheoryScore.calcScore(params);

    UI.updateScore(scoreResult, state.lastBestTime, state.lastIsOnline, state.portIndex, state.lastDynamicBestTimes);

    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    document.getElementById('timeSliderDisplay').textContent =
      `${hh}:${String(mm).padStart(2, '0')}`;

    TideChart.drawOverlay(
      document.getElementById('tideOverlay'),
      minutes, state.lastHourlyScores
    );

    // 時刻別マリンデータを取得
    const marine = state.onlineData ? state.onlineData.marine : null;
    const marineAtTime = marine ? DataFetch.getMarineAtMinute(marine, state.date, minutes) : null;
    const marineForDate = marine ? DataFetch.getMarineForDate(marine, state.date) : null;

    // 波浪値（時刻別優先、なければ日次）
    const waveHeightNow = marineAtTime ? marineAtTime.waveHeight : (marineForDate ? marineForDate.waveHeight : null);

    // 風・気圧・波浪・天気カードを更新
    const port = PORTS[state.portIndex];
    UI.updateWindCard(effectiveWeather, port[10]);
    UI.updatePressureCard(effectiveWeather);
    // 波浪カード: 時刻別データでmarineForDateを上書き構築
    const marineDisplay = marineAtTime ? {
      waveHeight: marineAtTime.waveHeight,
      wavePeriod: marineAtTime.wavePeriod,
      waveDir: marineAtTime.waveDir,
      sst: marineForDate ? marineForDate.sst : null,
      sstYesterday: marineForDate ? marineForDate.sstYesterday : null,
      source: 'open-meteo'
    } : marineForDate;
    UI.updateWaveCard(marineDisplay, state.onlineData);
    UI.updateSstCard(marineDisplay, state.onlineData);
    const weatherForDate = weather ? DataFetch.getWeatherForDate(weather, state.date) : null;
    UI.updateWeatherInfo(effectiveWeather, weatherForDate);

    // 魚種ミニスコア更新
    if (state.lastScoreParams) {
      const points = state.lastScoreParams.tidePoints;
      const events = state.lastScoreParams.tideEvents;
      const flowInfo = TheoryScore.calcTideFlowInfo(points, events, minutes);
      const fishParams = {
        jiaiStatus: flowInfo.jiaiStatus,
        pressure, windSpeed,
        waveHeight: waveHeightNow,
        seaTemp: marineForDate ? (marineForDate.sst || null) : null,
        moonAge: state.lastScoreParams.moonAge,
        minutesOfDay: minutes,
        sunTimes: state.lastScoreParams.sunTimes,
        spotType: port[12] || 'port',
        shelter: port[11],
        tideName: state.lastScoreParams.tideName
      };
      UI.updateFishMiniScores(FishScore.calcAllFishScores(fishParams));
    }
  }

  // ==================== オンラインデータ取得 ====================
  async function fetchOnlineData() {
    try {
      DataFetch.clearCache();
      state.onlineData = await DataFetch.fetchAllData(state.portIndex);
      // 最終更新時刻を記録・表示
      lastFetchTime = Date.now();
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const el = document.getElementById('lastUpdateLabel');
      if (el) el.textContent = `更新${hh}:${mm}`;
    } catch (e) {
      console.warn('オンラインデータ取得エラー:', e);
      if (!state.onlineData) state.onlineData = { isOnline: false };
    }
    updateUI();
  }

  // ==================== 自動更新タイマー（0分/20分/40分） ====================
  let autoRefreshTimer = null;
  let lastFetchTime = 0; // 最終取得時刻(ms)

  function getNextRefreshMs() {
    const now = new Date();
    const min = now.getMinutes();
    // 次の0/20/40分を計算
    let nextMin;
    if (min < 20) nextMin = 20;
    else if (min < 40) nextMin = 40;
    else nextMin = 60; // 次の時の0分
    const target = new Date(now);
    target.setMinutes(nextMin % 60, 0, 0);
    if (nextMin === 60) target.setHours(target.getHours() + 1);
    return target.getTime() - now.getTime();
  }

  function scheduleAutoRefresh() {
    if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
    const ms = getNextRefreshMs();
    autoRefreshTimer = setTimeout(() => {
      // 画面非表示ならスキップ
      if (document.hidden) {
        scheduleAutoRefresh();
        return;
      }
      // 当日or翌日表示中のみ再取得
      const dView = new Date(state.date.getFullYear(), state.date.getMonth(), state.date.getDate());
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const tomorrowEnd = new Date(todayStart.getTime() + 2 * 86400000);
      if (dView >= todayStart && dView < tomorrowEnd) {
        fetchOnlineData();
      }
      scheduleAutoRefresh();
    }, ms);
  }

  // ==================== 日付操作 ====================
  function changeDay(delta) {
    const newDate = new Date(state.date.getTime() + delta * 86400000);
    const nd = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
    if (nd < getMinDate() || nd > getMaxDate()) return;
    state.date = newDate;
    // 当日→現在時刻(null)、それ以外→0:00
    state.sliderMinutes = isToday(newDate) ? null : 0;
    updateUI();
    fetchOnlineData();
  }

  function isToday(d) {
    const t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  }

  // スライダー前日/翌日ボタンの有効/無効を更新
  function updateSliderDayButtons() {
    const prev = document.getElementById('sliderPrevDay');
    const next = document.getElementById('sliderNextDay');
    if (!prev || !next) return;
    const dView = new Date(state.date.getFullYear(), state.date.getMonth(), state.date.getDate());
    const dMin = new Date(getMinDate().getFullYear(), getMinDate().getMonth(), getMinDate().getDate());
    const dMax = new Date(getMaxDate().getFullYear(), getMaxDate().getMonth(), getMaxDate().getDate());
    prev.disabled = dView.getTime() <= dMin.getTime();
    next.disabled = dView.getTime() >= dMax.getTime();
  }

  // ==================== お気に入り ====================
  function toggleFavorite(portIndex) {
    const idx = state.favorites.indexOf(portIndex);
    if (idx >= 0) state.favorites.splice(idx, 1);
    else state.favorites.push(portIndex);
    saveState();
    UI.renderPortList(state.activeTab, state.favorites, selectPort, toggleFavorite);
  }

  function selectPort(portIndex) {
    state.portIndex = portIndex;
    DataFetch.clearCache();
    saveState();
    UI.closePortModal();
    Nearby.hide();
    updateUI();
    fetchOnlineData();
  }

  // ==================== GP棒グラフトグル ====================
  function toggleGp() {
    state.gpEnabled = !state.gpEnabled;
    saveState();
    updateGpButton();
    updateUI();
  }

  function updateGpButton() {
    const btn = document.getElementById('gpToggle');
    const legend = document.getElementById('gpLegend');
    if (btn) {
      if (state.gpEnabled) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
    if (legend) {
      legend.style.display = state.gpEnabled ? 'flex' : 'none';
    }
  }

  // ==================== スワイプ ====================
  let touchStartX = 0, touchStartY = 0;
  function onTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }
  function onTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      changeDay(dx < 0 ? 1 : -1);
    }
  }

  // ==================== 初期化 ====================
  function showDisclaimer() {
    if (!localStorage.getItem('disclaimerAccepted')) {
      document.getElementById('disclaimerOverlay').classList.add('active');
      document.getElementById('disclaimerOk').addEventListener('click', () => {
        localStorage.setItem('disclaimerAccepted', '1');
        document.getElementById('disclaimerOverlay').classList.remove('active');
      });
    }
  }

  function init() {
    loadState();
    showDisclaimer();

    // イベントリスナー
    document.getElementById('openPortSelect').addEventListener('click', UI.openPortModal);
    document.getElementById('modalOverlay').addEventListener('click', UI.closePortModal);
    document.getElementById('closeModal').addEventListener('click', UI.closePortModal);
    document.getElementById('prevDay').addEventListener('click', () => changeDay(-1));
    document.getElementById('nextDay').addEventListener('click', () => changeDay(1));
    document.getElementById('dateText').addEventListener('click', () => UI.openDatePicker(state.date, getMinDate(), getMaxDate()));

    // 検索
    document.getElementById('searchInput').addEventListener('input', () => {
      UI.renderPortList(state.activeTab, state.favorites, selectPort, toggleFavorite);
    });

    // タブ（ポート選択モーダルのみ）
    document.querySelectorAll('#tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeTab = tab.dataset.tab;
        UI.renderPortList(state.activeTab, state.favorites, selectPort, toggleFavorite);
      });
    });

    // 日付ピッカー
    document.getElementById('datePickerCancel').addEventListener('click', UI.closeDatePicker);
    document.getElementById('datePickerToday').addEventListener('click', () => {
      state.sliderMinutes = null;
      state.date = new Date();
      UI.closeDatePicker();
      updateUI();
      fetchOnlineData();
    });
    document.getElementById('datePickerInput').addEventListener('change', (e) => {
      const parts = e.target.value.split('-');
      if (parts.length === 3) {
        const picked = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
        const pd = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate());
        if (pd < getMinDate() || pd > getMaxDate()) return;
        state.sliderMinutes = null;
        state.date = picked;
        UI.closeDatePicker();
        updateUI();
      }
    });
    document.getElementById('datePickerOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) UI.closeDatePicker();
    });

    // 時間スライダー
    document.getElementById('timeSlider').addEventListener('input', (e) => {
      onSliderChange(parseInt(e.target.value));
    });
    document.getElementById('timeSliderNow').addEventListener('click', () => {
      state.sliderMinutes = null;
      updateUI();
    });
    document.getElementById('sliderPrevDay').addEventListener('click', () => changeDay(-1));
    document.getElementById('sliderNextDay').addEventListener('click', () => changeDay(1));

    // GP棒グラフ
    document.getElementById('gpToggle').addEventListener('click', toggleGp);
    updateGpButton();

    // スワイプ
    const gc = document.getElementById('graphContainer');
    gc.addEventListener('touchstart', onTouchStart, { passive: true });
    gc.addEventListener('touchend', onTouchEnd, { passive: true });

    // ランキング
    document.getElementById('openRanking').addEventListener('click', Ranking.open);
    document.getElementById('rankingOverlay').addEventListener('click', Ranking.close);
    document.getElementById('closeRanking').addEventListener('click', Ranking.close);
    Ranking.init();

    // リサイズ
    window.addEventListener('resize', updateUI);

    // 即座に潮汐表示（Phase 1: オフライン即表示）
    updateUI();

    // 非同期でオンラインデータ取得（Phase 2-5）
    fetchOnlineData();

    // カウントダウン更新（毎秒）
    setInterval(() => {
      if (UI.isToday(state.date)) {
        const points = TideCalc.calcDayTide(state.portIndex, state.date);
        const events = TideCalc.findTideEvents(points);
        UI.updateNextTide(events, true);
      }
    }, 1000);

    // グラフ再描画（毎分、今日のみ）
    setInterval(() => {
      if (UI.isToday(state.date)) updateUI();
    }, 60000);

    // オンラインデータ自動更新（毎時0分/20分/40分）
    scheduleAutoRefresh();

    // 画面復帰時: タイマー再セット + 10分以上経過なら即再取得
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        scheduleAutoRefresh();
        if (Date.now() - lastFetchTime >= 10 * 60 * 1000) {
          fetchOnlineData();
        }
      }
    });
  }

  // Service Worker登録
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);

  return { state, updateUI, fetchOnlineData, selectPort };
})();
