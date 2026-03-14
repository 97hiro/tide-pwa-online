// ==================== fish-score.js ====================
// 魚種別スコア算出エンジン
// FISH_PROFILES の黄金条件と現在条件を比較し 0〜100 スコアを返す
// =====================================================

const FishScore = (() => {

  const WEIGHTS = {
    tide: 0.20,
    seaTemp: 0.15,
    wind: 0.12,
    wave: 0.08,
    pressure: 0.08,
    moon: 0.05,
    time: 0.07,
    spot: 0.15,
    shelter: 0.10
  };

  // ==================== サブスコア算出 ====================

  // 潮汐 (時合ステータスとの一致度)
  function calcTideScore(profile, jiaiStatus) {
    if (!jiaiStatus) return 50;
    if (profile.tide.best.includes(jiaiStatus)) return 100;
    if (profile.tide.good.includes(jiaiStatus)) return 70;
    if (profile.tide.bad && profile.tide.bad.includes(jiaiStatus)) return 10;
    return 40;
  }

  // 範囲マッチ汎用 (best→100, good→70, ok→40, 範囲外→線形減衰)
  function rangeScore(value, ranges) {
    if (value == null) return 50;
    if (value >= ranges.best[0] && value <= ranges.best[1]) return 100;
    if (value >= ranges.good[0] && value <= ranges.good[1]) return 70;
    if (ranges.ok && value >= ranges.ok[0] && value <= ranges.ok[1]) return 40;

    // 範囲外: 最外殻からの距離で線形減衰
    const outerMin = ranges.ok ? ranges.ok[0] : ranges.good[0];
    const outerMax = ranges.ok ? ranges.ok[1] : ranges.good[1];
    if (value < outerMin) {
      const dist = outerMin - value;
      const span = outerMax - outerMin;
      return Math.max(0, 30 - (dist / (span || 1)) * 60);
    }
    if (value > outerMax) {
      const dist = value - outerMax;
      const span = outerMax - outerMin;
      return Math.max(0, 30 - (dist / (span || 1)) * 60);
    }
    return 30;
  }

  // 気圧
  function calcPressureScore(profile, pressure) {
    return rangeScore(pressure, profile.pressure);
  }

  // 風速
  function calcWindScore(profile, windSpeed) {
    if (windSpeed == null) return 50;
    if (windSpeed >= profile.wind.best[0] && windSpeed <= profile.wind.best[1]) return 100;
    if (windSpeed >= profile.wind.good[0] && windSpeed <= profile.wind.good[1]) return 70;
    if (windSpeed <= profile.wind.max) return 40;
    // 超過: 線形減衰
    const over = windSpeed - profile.wind.max;
    return Math.max(0, 30 - over * 10);
  }

  // 波高
  function calcWaveScore(profile, waveHeight) {
    if (waveHeight == null) return 50;
    if (waveHeight >= profile.wave.best[0] && waveHeight <= profile.wave.best[1]) return 100;
    if (waveHeight >= profile.wave.good[0] && waveHeight <= profile.wave.good[1]) return 70;
    if (waveHeight <= profile.wave.max) return 40;
    const over = waveHeight - profile.wave.max;
    return Math.max(0, 30 - over * 20);
  }

  // 海水温
  function calcSeaTempScore(profile, sst) {
    if (sst == null) return 50;
    if (sst >= profile.seaTemp.best[0] && sst <= profile.seaTemp.best[1]) return 100;
    if (sst >= profile.seaTemp.good[0] && sst <= profile.seaTemp.good[1]) return 70;
    if (sst >= profile.seaTemp.min && sst <= profile.seaTemp.max) return 40;
    // 範囲外
    if (sst < profile.seaTemp.min) {
      return Math.max(0, 30 - (profile.seaTemp.min - sst) * 5);
    }
    return Math.max(0, 30 - (sst - profile.seaTemp.max) * 5);
  }

  // 月齢
  function calcMoonScore(profile, moonAge) {
    if (moonAge == null) return 50;
    if (profile.moon.best === 'any') return 70;

    // 月相判定
    let phase;
    if (moonAge <= 2 || moonAge >= 28) phase = 'new';
    else if (moonAge >= 13 && moonAge <= 17) phase = 'full';
    else if (moonAge >= 6 && moonAge <= 8) phase = 'half';
    else if (moonAge >= 21 && moonAge <= 23) phase = 'half';
    else if (moonAge >= 3 && moonAge <= 5) phase = 'crescent';
    else if (moonAge >= 25 && moonAge <= 27) phase = 'crescent';
    else phase = 'other';

    if (phase === profile.moon.best) return 100;
    if (phase === profile.moon.good) return 70;
    return 40;
  }

  // 時間帯
  function calcTimeScore(profile, minutesOfDay, sunTimes) {
    if (minutesOfDay == null) return 50;

    // 時間帯カテゴリ判定
    const h = minutesOfDay / 60;
    const sr = sunTimes ? sunTimes.sunrise || 6 : 6;
    const ss = sunTimes ? sunTimes.sunset || 18 : 18;

    let category;
    if (h >= sr - 1 && h <= sr + 1) category = 'morning';
    else if (h >= ss - 1 && h <= ss + 1) category = 'evening';
    else if (h >= sr + 1 && h < ss - 1) category = 'daytime';
    else category = 'night';

    if (profile.timeOfDay.best.includes(category)) return 100;
    if (profile.timeOfDay.good.includes(category)) return 70;
    return 30;
  }

  // スポット種別
  function calcSpotScore(profile, spotType) {
    if (!spotType) return 50;
    if (profile.spotType.best.includes(spotType)) return 100;
    if (profile.spotType.good.includes(spotType)) return 60;
    if (profile.spotType.ok && profile.spotType.ok.includes(spotType)) return 30;
    return 0;
  }

  // 風裏適性
  function calcShelterScore(profile, shelter) {
    if (shelter == null) return 50;
    // shelter: 0.0(外海露出)〜1.0(完全湾奥) — ports-data.jsの実値域
    // shelterPref: 'high'=湾奥好み, 'medium'=中間, 'low'=外海OK
    const s = Math.min(1, Math.max(0, shelter));

    if (profile.shelterPref === 'high') {
      return Math.round(20 + s * 80); // shelter=1.0→100, shelter=0→20
    } else if (profile.shelterPref === 'low') {
      return Math.round(20 + (1 - s) * 80); // shelter=0→100, shelter=1.0→20
    }
    // medium: shelter=0.4〜0.6で100点、両端で40点
    const dist = Math.abs(s - 0.5);
    if (dist <= 0.1) return 100;
    return Math.round(Math.max(40, 100 - (dist - 0.1) * 150));
  }

  // ==================== メインスコア算出 ====================

  /**
   * 1魚種のスコアを計算
   * @param {string} fishId - FISH_PROFILES のキー
   * @param {Object} params
   *   - jiaiStatus: 時合ステータス文字列
   *   - pressure: hPa
   *   - windSpeed: m/s
   *   - waveHeight: m
   *   - seaTemp: ℃ (SST)
   *   - moonAge: 月齢
   *   - minutesOfDay: 0〜1440
   *   - sunTimes: { sunrise, sunset }
   *   - spotType: 'port'|'rock'|'surf'|'river'|'pier'|'park'
   *   - shelter: 0.0〜1.0
   * @returns {{ total: number, scores: Object, fishId: string }}
   */
  function calcFishScore(fishId, params) {
    const profile = FISH_PROFILES[fishId];
    if (!profile) return { total: 0, scores: {}, fishId };

    let tideScore = calcTideScore(profile, params.jiaiStatus);

    // スポット種別連動の潮汐ボーナス増幅
    if (profile.shelterPref === 'low') {
      // アオリイカ・青物・マダイ・ハタ等: 外洋スポットで潮の影響大
      if ((params.spotType === 'rock' || params.spotType === 'pier') && params.shelter != null && params.shelter <= 0.3) {
        tideScore = Math.min(100, Math.round(tideScore * 1.3));
      }
    } else if (profile.shelterPref === 'high') {
      // アジ・チヌ等: 港内で安定
      if (params.spotType === 'port' && params.shelter != null && params.shelter >= 0.6) {
        tideScore = Math.min(100, Math.round(tideScore * 1.2));
      }
    }

    const scores = {
      tide: tideScore,
      seaTemp: calcSeaTempScore(profile, params.seaTemp),
      wind: calcWindScore(profile, params.windSpeed),
      wave: calcWaveScore(profile, params.waveHeight),
      pressure: calcPressureScore(profile, params.pressure),
      moon: calcMoonScore(profile, params.moonAge),
      time: calcTimeScore(profile, params.minutesOfDay, params.sunTimes),
      spot: calcSpotScore(profile, params.spotType),
      shelter: calcShelterScore(profile, params.shelter)
    };

    let total = 0;
    for (const [key, w] of Object.entries(WEIGHTS)) {
      total += scores[key] * w;
    }

    // 魚種特有: 潮名による補正
    // タコ: 小潮プラス、大潮マイナス
    // チヌ: 大潮・中潮プラス、小潮マイナス + 雨ボーナス
    // マダイ: 大潮で大幅プラス、小潮マイナス + 雨ペナルティ・澄み潮ボーナス
    if (profile.tidalBonus && params.tideName) {
      const bonus = profile.tidalBonus[params.tideName];
      if (bonus != null) total += bonus;
    }

    // チヌ特有: 雨がプラス（濁りを好む）
    if (profile.chinuMode) {
      if (params.isRainy) {
        total += profile.rainBonus || 0;        // 雨時 +8
        total += profile.turbidityBonus || 0;   // 濁り推定 +10
      } else if (params.wasRainyYesterday) {
        total += profile.turbidityBonus || 0;   // 前日雨→濁り残り +10
      } else {
        total += profile.clearWaterPenalty || 0; // 澄み潮 -3
      }
    }

    // マダイ特有: 雨がマイナス、澄み潮がプラス
    if (profile.madaiMode) {
      if (params.isRainy) {
        total += profile.rainPenalty || 0;       // 雨時 -10
      } else if (!params.wasRainyYesterday) {
        total += profile.clearWaterBonus || 0;   // 晴天続き +5
      }
    }

    total = Math.round(Math.min(100, Math.max(0, total)));

    return { total, scores, fishId };
  }

  /**
   * 全7魚種のスコアを一括計算
   * @param {Object} params - calcFishScore と同じ params
   * @returns {Object} { aji: {total, scores, fishId}, saba: {...}, ... }
   */
  function calcAllFishScores(params) {
    const results = {};
    for (const fishId of FISH_IDS) {
      results[fishId] = calcFishScore(fishId, params);
    }
    return results;
  }

  return { calcFishScore, calcAllFishScores };
})();
