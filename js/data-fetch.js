// ==================== data-fetch.js ====================
// オンラインデータ取得（Open-Meteo Weather + Marine）
// キャッシュ管理、エラーハンドリング
// =====================================================

const DataFetch = (() => {
  const CACHE_TTL = 10 * 60 * 1000; // 10分キャッシュ
  const PAST_DAYS = 7;
  const FORECAST_DAYS = 7;
  const cache = {};

  // --- キャッシュ管理 ---
  function getCached(key) {
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.time > CACHE_TTL) { delete cache[key]; return null; }
    return entry.data;
  }
  function setCache(key, data) {
    cache[key] = { data, time: Date.now() };
  }
  function clearCache() {
    for (const key in cache) delete cache[key];
  }

  // --- 汎用fetch（タイムアウト付き）---
  async function fetchJSON(url, timeout = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  // ==================== Open-Meteo Weather API ====================
  // 風速・風向・気圧・天気コード・降水確率（過去7日+未来7日、1時間単位）
  async function fetchWeatherData(lat, lon) {
    const cacheKey = `weather_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=wind_speed_10m,wind_direction_10m,surface_pressure,weather_code,precipitation_probability` +
        `&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}&timezone=Asia/Tokyo`;
      const data = await fetchJSON(url, 10000);
      if (data && data.hourly) {
        setCache(cacheKey, data);
        return data;
      }
      return null;
    } catch (e) {
      console.warn('Open-Meteo Weather取得失敗:', e.message);
      return null;
    }
  }

  // 指定日時の気象データを抽出（スライダー対応）
  // minutesOfDay: 0〜1440 → 最も近い1時間データを返す
  function getWeatherAtMinute(weatherData, targetDate, minutesOfDay) {
    if (!weatherData || !weatherData.hourly || !weatherData.hourly.time) return null;

    const dateStr = targetDate.getFullYear() + '-' +
      String(targetDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(targetDate.getDate()).padStart(2, '0');
    const targetHour = Math.min(23, Math.floor(minutesOfDay / 60));
    const targetTimeStr = dateStr + 'T' + String(targetHour).padStart(2, '0') + ':00';

    const times = weatherData.hourly.time;
    const h = weatherData.hourly;
    const idx = times.indexOf(targetTimeStr);
    if (idx === -1) return null;

    return {
      windSpeed: h.wind_speed_10m[idx] != null ? +(h.wind_speed_10m[idx] / 3.6).toFixed(1) : null,
      windDir: h.wind_direction_10m[idx] != null ? h.wind_direction_10m[idx] : null,
      pressure: h.surface_pressure[idx] != null ? +h.surface_pressure[idx].toFixed(1) : null,
      weatherCode: h.weather_code ? h.weather_code[idx] : null,
      precipProb: h.precipitation_probability ? h.precipitation_probability[idx] : null
    };
  }

  // 指定日の日別サマリー（正午天気コード、最大降水確率）
  function getWeatherForDate(weatherData, targetDate) {
    if (!weatherData || !weatherData.hourly || !weatherData.hourly.time) return null;

    const dateStr = targetDate.getFullYear() + '-' +
      String(targetDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(targetDate.getDate()).padStart(2, '0');
    const datePrefix = dateStr + 'T';

    const times = weatherData.hourly.time;
    const h = weatherData.hourly;

    let maxPrecipProb = null;
    let noonWeatherCode = null;

    for (let i = 0; i < times.length; i++) {
      if (!times[i].startsWith(datePrefix)) continue;

      if (h.precipitation_probability && h.precipitation_probability[i] != null) {
        if (maxPrecipProb === null || h.precipitation_probability[i] > maxPrecipProb) {
          maxPrecipProb = h.precipitation_probability[i];
        }
      }

      if (times[i] === dateStr + 'T12:00') {
        noonWeatherCode = h.weather_code ? h.weather_code[i] : null;
      }
    }

    return { precipProb: maxPrecipProb, weatherCode: noonWeatherCode };
  }

  // 風向（度）→ 方位テキスト
  function windDirName(deg) {
    if (deg == null) return '静穏';
    const dirs = [
      '北','北北東','北東','東北東','東','東南東','南東','南南東',
      '南','南南西','南西','西南西','西','西北西','北西','北北西'
    ];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  // WMO天気コード → アイコン
  function getWeatherIcon(code) {
    if (code == null) return '❓';
    const c = parseInt(code);
    if (c === 0) return '☀️';
    if (c <= 3) return '⛅';
    if (c === 45 || c === 48) return '🌫️';
    if (c >= 51 && c <= 57) return '🌦️';
    if (c >= 61 && c <= 67) return '🌧️';
    if (c >= 71 && c <= 77) return '🌨️';
    if (c >= 80 && c <= 82) return '🌧️';
    if (c >= 85 && c <= 86) return '🌨️';
    if (c >= 95) return '⛈️';
    return '❓';
  }

  // WMO天気コード → テキスト
  function getWeatherText(code) {
    if (code == null) return '';
    const c = parseInt(code);
    if (c === 0) return '快晴';
    if (c === 1) return '晴れ';
    if (c === 2) return '一部曇り';
    if (c === 3) return '曇り';
    if (c === 45 || c === 48) return '霧';
    if (c >= 51 && c <= 55) return '霧雨';
    if (c >= 56 && c <= 57) return '着氷性霧雨';
    if (c === 61) return '小雨';
    if (c === 63) return '雨';
    if (c === 65) return '大雨';
    if (c >= 66 && c <= 67) return '着氷性の雨';
    if (c === 71) return '小雪';
    if (c === 73) return '雪';
    if (c === 75) return '大雪';
    if (c === 77) return '霧雪';
    if (c >= 80 && c <= 82) return 'にわか雨';
    if (c >= 85 && c <= 86) return 'にわか雪';
    if (c === 95) return '雷雨';
    if (c >= 96) return '雷雨(雹)';
    return '';
  }

  // ==================== Open-Meteo Marine API ====================
  // 波浪・海水温を一括取得（過去7日+未来7日 = 14日分、1時間単位）
  async function fetchMarineData(lat, lon) {
    const cacheKey = `marine_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
        `&hourly=wave_height,wave_period,wave_direction,sea_surface_temperature` +
        `&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}&timezone=Asia/Tokyo`;
      const data = await fetchJSON(url, 10000);
      if (data && data.hourly) {
        setCache(cacheKey, data);
        return data;
      }
      return null;
    } catch (e) {
      console.warn('Open-Meteo Marine取得失敗:', e.message);
      return null;
    }
  }

  // 指定日時のマリンデータを抽出
  // isToday: 現在時刻に最も近い値、それ以外: 正午に最も近い値
  // 各フィールドを独立に検索（波浪モデルとSSTモデルの空間解像度が異なるため）
  function getMarineForDate(marineData, targetDate) {
    if (!marineData || !marineData.hourly || !marineData.hourly.time) return null;

    const now = new Date();
    const isToday = targetDate.getFullYear() === now.getFullYear() &&
      targetDate.getMonth() === now.getMonth() &&
      targetDate.getDate() === now.getDate();
    const targetHour = isToday ? now.getHours() : 12;

    const dateStr = targetDate.getFullYear() + '-' +
      String(targetDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(targetDate.getDate()).padStart(2, '0');
    const datePrefix = dateStr + 'T';

    const times = marineData.hourly.time;
    const h = marineData.hourly;

    // 対象日の全時間インデックスを収集
    const dayIndices = [];
    for (let i = 0; i < times.length; i++) {
      if (times[i].startsWith(datePrefix)) dayIndices.push(i);
    }
    if (dayIndices.length === 0) return null;

    // targetHourに最も近いインデックスを優先
    dayIndices.sort((a, b) => {
      const ha = parseInt(times[a].substring(11, 13));
      const hb = parseInt(times[b].substring(11, 13));
      return Math.abs(ha - targetHour) - Math.abs(hb - targetHour);
    });
    const primaryIdx = dayIndices[0];

    // 各フィールドで非null値を探す（primaryIdx優先、なければ他の時間帯）
    function findValue(arr) {
      if (!arr) return null;
      if (arr[primaryIdx] != null) return arr[primaryIdx];
      for (const i of dayIndices) {
        if (arr[i] != null) return arr[i];
      }
      return null;
    }

    const result = {
      waveHeight: findValue(h.wave_height),
      wavePeriod: findValue(h.wave_period),
      waveDir: findValue(h.wave_direction),
      sst: findValue(h.sea_surface_temperature),
      sstYesterday: null,
      source: 'open-meteo'
    };

    // 前日比: 24時間前のSST
    if (primaryIdx >= 24 && h.sea_surface_temperature) {
      result.sstYesterday = h.sea_surface_temperature[primaryIdx - 24];
    }

    return result;
  }

  // 指定日時のマリンデータを抽出（スライダー対応）
  // minutesOfDay: 0〜1440 → 最も近い1時間データを返す
  function getMarineAtMinute(marineData, targetDate, minutesOfDay) {
    if (!marineData || !marineData.hourly || !marineData.hourly.time) return null;

    const dateStr = targetDate.getFullYear() + '-' +
      String(targetDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(targetDate.getDate()).padStart(2, '0');
    const targetHour = Math.min(23, Math.floor(minutesOfDay / 60));
    const targetTimeStr = dateStr + 'T' + String(targetHour).padStart(2, '0') + ':00';

    const times = marineData.hourly.time;
    const h = marineData.hourly;
    const idx = times.indexOf(targetTimeStr);
    if (idx === -1) return null;

    return {
      waveHeight: h.wave_height ? h.wave_height[idx] : null,
      wavePeriod: h.wave_period ? h.wave_period[idx] : null,
      waveDir: h.wave_direction ? h.wave_direction[idx] : null,
      sst: h.sea_surface_temperature ? h.sea_surface_temperature[idx] : null
    };
  }

  // 波向（度）→ 方位テキスト
  function waveDirName(deg) {
    if (deg == null) return '';
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  // ==================== 一括取得 ====================
  // 指定ポートの全オンラインデータを一括取得
  async function fetchAllData(portIndex) {
    const port = PORTS[portIndex];
    const lat = port[3], lon = port[4];

    const results = {
      weather: null,
      marine: null,
      isOnline: false,
      lastUpdate: null
    };

    await Promise.allSettled([
      fetchWeatherData(lat, lon).then(d => { results.weather = d; }),
      fetchMarineData(lat, lon).then(d => { results.marine = d; })
    ]);

    results.isOnline = !!(results.weather || results.marine);
    results.lastUpdate = new Date();

    return results;
  }

  return {
    fetchWeatherData, fetchMarineData, fetchAllData,
    getWeatherAtMinute, getWeatherForDate, getMarineForDate, getMarineAtMinute,
    windDirName, waveDirName, getWeatherIcon, getWeatherText,
    clearCache,
    PAST_DAYS, FORECAST_DAYS
  };
})();
