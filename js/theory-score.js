// ==================== theory-score.js ====================
// 釣り期待値スコア（Theory）算出エンジン
// 潮汐×気圧×風×波×月齢の多変数解析 → 0〜100スコア
//
// キャリブレーション基準:
//   85-95 → 大潮マズメ + 好条件
//   50-65 → 中潮の普通の日中
//   35-45 → 小潮で風強い
//   20-30 → 長潮 + 強風 + 高波
// =====================================================

const TheoryScore = (() => {

  const BASE_WEIGHTS = {
    tide: 0.30,
    pressure: 0.15,
    wind: 0.20,
    wave: 0.20,
    timing: 0.15,
    tideFlow: 0.05
  };

  const NULL_MARKER = Symbol('no_data');

  // ==================== 各要素のスコア算出 ====================

  // 1. 潮汐スコア (0-100)
  //    大潮ベース70 → 動き始め時90-100
  //    中潮ベース55 → 動き始め時70-80
  //    小潮ベース35 → 動き始め時50-60
  //    長潮ベース25
  function calcTideScore(tideName, tidalRange, minutesOfDay, tideEvents) {
    let score = 0;

    switch (tideName) {
      case '大潮': score += 70; break;
      case '中潮': score += 55; break;
      case '若潮': score += 40; break;
      case '小潮': score += 35; break;
      case '長潮': score += 25; break;
    }

    // 潮位差ボーナス (0-8)
    if (tidalRange > 0) {
      score += Math.min(8, tidalRange * 0.05);
    }

    // 潮の動き始めボーナス (0-18)
    if (tideEvents && tideEvents.length > 0) {
      let bestBonus = 0;
      for (const ev of tideEvents) {
        const dist = Math.abs(minutesOfDay - ev.minutes);
        let bonus = 0;
        if (dist >= 20 && dist <= 90) {
          bonus = 18;
        } else if (dist < 20) {
          bonus = 8 + dist * 0.3;
        } else if (dist <= 150) {
          bonus = Math.max(0, 18 - (dist - 90) * 0.25);
        } else {
          bonus = 3;
        }
        bestBonus = Math.max(bestBonus, bonus);
      }
      score += bestBonus;
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  // 2. 気圧スコア (0-100)
  //    下降中: 70-90、安定: 50-60、急上昇: 30-40
  function calcPressureScore(pressureHpa, trend, change) {
    if (pressureHpa == null) return NULL_MARKER;

    let score;
    if (pressureHpa < 1000) score = 65;
    else if (pressureHpa < 1005) score = 60;
    else if (pressureHpa < 1010) score = 58;
    else if (pressureHpa < 1015) score = 55;
    else if (pressureHpa < 1020) score = 50;
    else if (pressureHpa < 1025) score = 45;
    else score = 38;

    if (trend === 'falling') {
      score += 20;
      if (change != null && Math.abs(change) > 5) score += 10;
    } else if (trend === 'rising') {
      score -= 10;
      if (change != null && Math.abs(change) > 5) score -= 8;
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  // 3. 風スコア (0-100)
  //    2-5m/s: 80-90、無風: 60、5-8m/s: 50-60、8m/s以上: 20-40
  //    facing: 港の開口方向（度）— 風向との相性で漁港個別スコアに差をつける
  function calcWindScore(windSpeedMs, windDirDeg, portLat, portLon, facing) {
    if (windSpeedMs == null) return NULL_MARKER;

    let score;
    if (windSpeedMs < 1) score = 60;
    else if (windSpeedMs <= 2) score = 72;
    else if (windSpeedMs <= 5) score = 85;
    else if (windSpeedMs <= 8) score = 55;
    else if (windSpeedMs <= 10) score = 38;
    else if (windSpeedMs <= 13) score = 28;
    else score = 15;

    if (windDirDeg != null && windSpeedMs >= 1.5) {
      if (facing != null) {
        // facing対応: 風向と港の開口方向の関係でスコア調整
        // (facing+180)%360 = 陸側方向。風がこの方向から来る = 追い風(背中から)
        const landSide = (facing + 180) % 360;
        let angDiff = Math.abs(windDirDeg - landSide);
        if (angDiff > 180) angDiff = 360 - angDiff;

        if (angDiff <= 45) {
          // 追い風: 風が背中から吹く → 釣りやすい
          score += windSpeedMs <= 8 ? 24 : 10;
        } else if (angDiff >= 135) {
          // 向かい風: 風が港口から吹き込む → 厳しい
          score -= windSpeedMs > 5 ? 20 : 10;
        }
        // 45-135度 = 横風: 変化なし
      } else {
        // facing未設定時はエリア判定にフォールバック
        const isJapanSea = portLat > 35;
        let favorable = false;
        if (isJapanSea) {
          favorable = (windDirDeg >= 135 && windDirDeg <= 225);
        } else {
          favorable = (windDirDeg >= 315 || windDirDeg <= 60);
        }
        if (favorable && windSpeedMs <= 8) score += 5;
        if (!favorable && windSpeedMs > 5) score -= 5;
      }
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  // 4. 波浪スコア (0-100)
  //    0.3-1.0m: 80-90、ベタ凪: 60、1.0-1.5m: 50-60、1.5m以上: 20-40
  //    shelter: 遮蔽度 — 湾奥ほど実効波高が小さくなり高スコア
  function calcWaveScore(waveHeight, wavePeriod, shelter) {
    if (waveHeight == null) return NULL_MARKER;

    // 実効波高: 遮蔽度で減衰 (shelter=1.0で15%まで減衰)
    const effectiveHeight = shelter != null
      ? waveHeight * (1.0 - shelter * 0.85)
      : waveHeight;

    let score;
    if (effectiveHeight <= 0.3) score = 60;
    else if (effectiveHeight <= 0.8) score = 88;
    else if (effectiveHeight <= 1.0) score = 80;
    else if (effectiveHeight <= 1.5) score = 55;
    else if (effectiveHeight <= 2.0) score = 38;
    else if (effectiveHeight <= 2.5) score = 28;
    else if (effectiveHeight <= 3.0) score = 20;
    else score = 12;

    if (wavePeriod != null) {
      if (wavePeriod >= 4 && wavePeriod <= 8) score += 5;
      else if (wavePeriod > 12) score -= 5;
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  // 5. 時間帯スコア (0-100)
  //    マズメ: 85-100、朝夕: 60-70、日中: 40-50、深夜: 30-40
  function calcTimingScore(minutesOfDay, sunTimes, moonAge, tideName) {
    let score;

    // ベーススコア: 時間帯別
    if (minutesOfDay < 300 || minutesOfDay > 1200) {
      score = 35; // 深夜
    } else if (minutesOfDay >= 600 && minutesOfDay <= 840) {
      score = 42; // 真昼間
    } else {
      score = 48; // 朝・午後
    }

    // マズメボーナス
    if (sunTimes) {
      const srMin = sunTimes.sunrise != null ? sunTimes.sunrise * 60 : null;
      const ssMin = sunTimes.sunset != null ? sunTimes.sunset * 60 : null;
      let mazumeBonus = 0;

      if (srMin != null) {
        const dist = minutesOfDay - srMin;
        if (dist >= -30 && dist <= 60) mazumeBonus = Math.max(mazumeBonus, 47);
        else if (dist >= -60 && dist <= 90) mazumeBonus = Math.max(mazumeBonus, 20);
        else if (dist >= -90 && dist <= 120) mazumeBonus = Math.max(mazumeBonus, 8);
      }

      if (ssMin != null) {
        const dist = minutesOfDay - ssMin;
        if (dist >= -60 && dist <= 30) mazumeBonus = Math.max(mazumeBonus, 45);
        else if (dist >= -90 && dist <= 60) mazumeBonus = Math.max(mazumeBonus, 18);
        else if (dist >= -120 && dist <= 90) mazumeBonus = Math.max(mazumeBonus, 8);
      }

      score += mazumeBonus;
    }

    // 月齢ボーナス (大潮期) — 潮流スコアに一部移管
    if (moonAge != null) {
      if (moonAge < 2 || (moonAge >= 14 && moonAge <= 16) || moonAge >= 28.5) {
        score += 2;
      }
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  // ==================== 潮流・時合スコア ====================

  // 潮流速度・三分七分・時合ステータスを算出
  function calcTideFlowInfo(tidePoints, tideEvents, minutesOfDay) {
    if (!tidePoints || tidePoints.length < 3 || !tideEvents || tideEvents.length < 2) {
      return { flowRate: 0, flowScore: 50, jiaiStatus: null, jiaiBonus: 0 };
    }

    // 流速: |H(t+30) - H(t-30)| / 60 (cm/分)
    const idx = Math.round(minutesOfDay / 30);
    let flowRate = 0;
    if (idx > 0 && idx < tidePoints.length - 1) {
      flowRate = Math.abs(tidePoints[idx + 1].height - tidePoints[idx - 1].height) / 60;
    } else if (idx === 0 && tidePoints.length > 1) {
      flowRate = Math.abs(tidePoints[1].height - tidePoints[0].height) / 30;
    } else if (idx >= tidePoints.length - 1 && tidePoints.length > 1) {
      const last = tidePoints.length - 1;
      flowRate = Math.abs(tidePoints[last].height - tidePoints[last - 1].height) / 30;
    }

    // 当日最大流速
    let maxFlow = 0;
    for (let i = 1; i < tidePoints.length - 1; i++) {
      const f = Math.abs(tidePoints[i + 1].height - tidePoints[i - 1].height) / 60;
      if (f > maxFlow) maxFlow = f;
    }

    // 流速スコア: 0-100
    const flowScore = maxFlow > 0 ? Math.min(100, Math.round((flowRate / maxFlow) * 100)) : 50;

    // 満潮・干潮イベントを時刻順にソート
    const sorted = [...tideEvents].sort((a, b) => a.minutes - b.minutes);

    // 潮止まり: 満潮/干潮±30分
    for (const ev of sorted) {
      if (Math.abs(minutesOfDay - ev.minutes) <= 30) {
        return { flowRate, flowScore, jiaiStatus: '潮止まり', jiaiBonus: -5 };
      }
    }

    // 三分・七分の特定
    let jiaiStatus = null;
    let jiaiBonus = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i];
      const end = sorted[i + 1];

      if (minutesOfDay > start.minutes && minutesOfDay < end.minutes) {
        const duration = end.minutes - start.minutes;
        const elapsed = minutesOfDay - start.minutes;
        const fraction = elapsed / duration;
        const tolerance = 15 / duration; // ±15分を割合に変換
        const isRising = start.type === 'low'; // 干潮→満潮 = 上げ潮

        if (isRising) {
          if (Math.abs(fraction - 0.7) <= tolerance) {
            jiaiStatus = '上げ七分'; jiaiBonus = 5;
          } else if (Math.abs(fraction - 0.3) <= tolerance) {
            jiaiStatus = '上げ三分'; jiaiBonus = 3;
          } else {
            jiaiStatus = '上げ潮中盤'; jiaiBonus = 2;
          }
        } else {
          if (Math.abs(fraction - 0.3) <= tolerance) {
            jiaiStatus = '下げ三分'; jiaiBonus = 4;
          } else if (Math.abs(fraction - 0.7) <= tolerance) {
            jiaiStatus = '下げ七分'; jiaiBonus = 3;
          } else {
            jiaiStatus = '下げ潮中盤'; jiaiBonus = 2;
          }
        }
        break;
      }
    }

    // 最初のイベント前 or 最後のイベント後
    if (jiaiStatus === null) {
      if (minutesOfDay <= sorted[0].minutes) {
        jiaiStatus = sorted[0].type === 'high' ? '上げ潮中盤' : '下げ潮中盤';
        jiaiBonus = 2;
      } else {
        jiaiStatus = sorted[sorted.length - 1].type === 'high' ? '下げ潮中盤' : '上げ潮中盤';
        jiaiBonus = 2;
      }
    }

    return { flowRate, flowScore, jiaiStatus, jiaiBonus };
  }

  // デバッグログ: 満潮/干潮・三分七分時刻を出力
  function debugLogTideFlow(tideEvents) {
    if (!tideEvents || tideEvents.length < 2) return;
    const sorted = [...tideEvents].sort((a, b) => a.minutes - b.minutes);
    const fmtTime = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

    const eventStrs = sorted.map(ev => {
      const type = ev.type === 'high' ? '満潮' : '干潮';
      return `${type}: ${fmtTime(ev.minutes)} (${ev.height}cm)`;
    });
    console.log('[潮流] ' + eventStrs.join(', '));

    const timings = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i];
      const end = sorted[i + 1];
      const duration = end.minutes - start.minutes;
      const sanbuMin = Math.round(start.minutes + duration * 0.3);
      const nanabuMin = Math.round(start.minutes + duration * 0.7);
      const isRising = start.type === 'low';

      if (isRising) {
        timings.push(`上げ三分: ${fmtTime(sanbuMin)}, 上げ七分: ${fmtTime(nanabuMin)}`);
      } else {
        timings.push(`下げ三分: ${fmtTime(sanbuMin)}, 下げ七分: ${fmtTime(nanabuMin)}`);
      }
    }
    console.log('[時合] ' + timings.join(', '));
  }

  // ==================== 総合スコア算出 ====================

  function calcScore(params) {
    const {
      tideName, tidalRange, minutesOfDay, tideEvents,
      pressure, pressureTrend, pressureChange,
      windSpeed, windDir, portLat, portLon,
      waveHeight, wavePeriod,
      sunTimes, moonAge,
      facing, shelter,
      tidePoints
    } = params;

    const flowInfo = calcTideFlowInfo(tidePoints, tideEvents, minutesOfDay);

    const rawScores = {
      tide: calcTideScore(tideName, tidalRange || 0, minutesOfDay, tideEvents),
      pressure: calcPressureScore(pressure, pressureTrend, pressureChange),
      wind: calcWindScore(windSpeed, windDir, portLat, portLon, facing),
      wave: calcWaveScore(waveHeight, wavePeriod, shelter),
      timing: calcTimingScore(minutesOfDay, sunTimes, moonAge, tideName),
      tideFlow: flowInfo.flowScore
    };

    let totalWeight = 0, totalScore = 0;
    const scores = {};
    const available = {};

    for (const [key, w] of Object.entries(BASE_WEIGHTS)) {
      if (rawScores[key] === NULL_MARKER) {
        scores[key] = null;
        available[key] = false;
      } else {
        scores[key] = rawScores[key];
        available[key] = true;
        totalScore += rawScores[key] * w;
        totalWeight += w;
      }
    }

    // 欠損データは重みから除外して正規化（ペナルティなし）
    let finalScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;

    // 時合ボーナス加算（重み計算後に直接加算）
    finalScore = Math.min(100, Math.max(0, finalScore + flowInfo.jiaiBonus));

    const ratings = {};
    for (const key of Object.keys(BASE_WEIGHTS)) {
      ratings[key] = available[key] ? getRating(scores[key]) : '-';
    }

    return {
      total: finalScore,
      scores,
      ratings,
      available,
      jiaiStatus: flowInfo.jiaiStatus,
      jiaiBonus: flowInfo.jiaiBonus
    };
  }

  function getRating(score) {
    if (score >= 78) return '◎';
    if (score >= 65) return '○';
    if (score >= 46) return '△';
    return '×';
  }

  function getMessage(score) {
    if (score >= 78) return '最高のコンディション！';
    if (score >= 65) return '期待大！';
    if (score >= 46) return 'まずまず';
    if (score >= 31) return 'やや渋め';
    return '厳しい条件です';
  }

  function getColor(score) {
    if (score >= 78) return '#4ecb71';
    if (score >= 65) return '#a0d840';
    if (score >= 46) return '#f0c040';
    if (score >= 31) return '#f0943a';
    return '#e74c5e';
  }

  // ==================== 時間帯別スコア ====================
  function calcHourlyScores(params) {
    const blocks = [];
    for (let h = 0; h < 24; h += 2) {
      const minutes = h * 60 + 60;
      const result = calcScore({ ...params, minutesOfDay: minutes });
      blocks.push({
        hour: h,
        label: `${h}:00`,
        score: result.total,
        color: getColor(result.total)
      });
    }
    return blocks;
  }

  function findBestTime(hourlyScores) {
    let best = hourlyScores[0];
    for (const b of hourlyScores) {
      if (b.score > best.score) best = b;
    }
    return { hour: best.hour, endHour: best.hour + 2, score: best.score };
  }

  // ==================== 動的ベストタイム ====================
  // 朝マズメ・夕マズメ × 潮流ピーク × 潮回りの重み付けで算出
  function findDynamicBestTimes(sunTimes, tideEvents, tideName) {
    if (!sunTimes || !tideEvents || tideEvents.length < 2) return null;

    const srMin = sunTimes.sunrise != null ? Math.round(sunTimes.sunrise * 60) : null;
    const ssMin = sunTimes.sunset != null ? Math.round(sunTimes.sunset * 60) : null;
    if (srMin == null || ssMin == null) return null;

    // マズメ時間帯定義
    const morningStart = srMin - 60;
    const morningEnd = srMin + 90;
    const eveningStart = ssMin - 90;
    const eveningEnd = ssMin + 30;

    // 潮回り倍率
    let tideMult = 1.0;
    switch (tideName) {
      case '大潮': tideMult = 1.2; break;
      case '中潮': tideMult = 1.0; break;
      case '小潮': tideMult = 0.8; break;
      case '若潮': tideMult = 0.85; break;
      case '長潮': tideMult = 0.75; break;
    }

    // 潮流ピーク時刻（上げ七分・下げ三分）を全て列挙
    const sorted = [...tideEvents].sort((a, b) => a.minutes - b.minutes);
    const flowPeaks = []; // { minutes, strength }
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i];
      const end = sorted[i + 1];
      const duration = end.minutes - start.minutes;
      const range = Math.abs(end.height - start.height);
      const isRising = start.type === 'low';

      if (isRising) {
        // 上げ七分: 干潮から70%の地点（最強流）
        flowPeaks.push({ minutes: Math.round(start.minutes + duration * 0.7), strength: range * 1.0 });
        // 上げ三分
        flowPeaks.push({ minutes: Math.round(start.minutes + duration * 0.3), strength: range * 0.6 });
      } else {
        // 下げ三分: 満潮から30%の地点（強い流れ）
        flowPeaks.push({ minutes: Math.round(start.minutes + duration * 0.3), strength: range * 0.9 });
        // 下げ七分
        flowPeaks.push({ minutes: Math.round(start.minutes + duration * 0.7), strength: range * 0.5 });
      }
    }

    // 各分のスコアを計算（マズメ範囲内のみ）
    function calcMinuteScore(min) {
      // マズメ近接度（ピークで1.0、端で0.3）
      let mazumeScore = 0;
      // 朝マズメ
      const srDist = Math.abs(min - srMin);
      if (srDist <= 30) mazumeScore = Math.max(mazumeScore, 1.0);
      else if (srDist <= 60) mazumeScore = Math.max(mazumeScore, 0.7);
      else if (srDist <= 90) mazumeScore = Math.max(mazumeScore, 0.3);
      // 夕マズメ
      const ssDist = Math.abs(min - ssMin);
      if (ssDist <= 30) mazumeScore = Math.max(mazumeScore, 1.0);
      else if (ssDist <= 60) mazumeScore = Math.max(mazumeScore, 0.7);
      else if (ssDist <= 90) mazumeScore = Math.max(mazumeScore, 0.3);

      // 潮流ピーク近接度
      let flowScore = 0;
      for (const peak of flowPeaks) {
        const dist = Math.abs(min - peak.minutes);
        if (dist <= 20) flowScore = Math.max(flowScore, peak.strength);
        else if (dist <= 45) flowScore = Math.max(flowScore, peak.strength * 0.6);
        else if (dist <= 70) flowScore = Math.max(flowScore, peak.strength * 0.3);
      }

      return (mazumeScore * 50 + flowScore * 0.5) * tideMult;
    }

    // 朝・夕それぞれでピーク区間を特定
    function findPeakWindow(rangeStart, rangeEnd) {
      const start = Math.max(0, rangeStart);
      const end = Math.min(1440, rangeEnd);
      if (start >= end) return null;

      // 10分刻みでスコア計算
      let bestMin = start, bestScore = -1;
      const scores = [];
      for (let m = start; m <= end; m += 10) {
        const s = calcMinuteScore(m);
        scores.push({ m, s });
        if (s > bestScore) { bestScore = s; bestMin = m; }
      }

      if (bestScore <= 0) return null;

      // ピークの70%以上の連続区間を抽出
      const threshold = bestScore * 0.7;
      let windowStart = bestMin, windowEnd = bestMin;
      for (const { m, s } of scores) {
        if (s >= threshold) {
          if (m < windowStart) windowStart = m;
          if (m > windowEnd) windowEnd = m;
        }
      }

      // 連続区間のみ（ピークから離れた孤立点を除外）
      let contStart = bestMin, contEnd = bestMin;
      for (let m = bestMin - 10; m >= windowStart; m -= 10) {
        const s = calcMinuteScore(m);
        if (s >= threshold) contStart = m;
        else break;
      }
      for (let m = bestMin + 10; m <= windowEnd; m += 10) {
        const s = calcMinuteScore(m);
        if (s >= threshold) contEnd = m;
        else break;
      }

      return {
        startMin: contStart,
        endMin: contEnd + 10,
        score: bestScore
      };
    }

    const morning = findPeakWindow(morningStart, morningEnd);
    const evening = findPeakWindow(eveningStart, eveningEnd);

    if (!morning && !evening) return null;

    return { morning, evening };
  }

  // ベストタイムの表示文字列を生成
  function formatBestTimes(bestTimes) {
    if (!bestTimes) return null;
    const fmt = (min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return `${h}:${String(m).padStart(2, '0')}`;
    };
    const parts = [];
    if (bestTimes.morning) {
      parts.push(`${fmt(bestTimes.morning.startMin)}\u301C${fmt(bestTimes.morning.endMin)}`);
    }
    if (bestTimes.evening) {
      parts.push(`${fmt(bestTimes.evening.startMin)}\u301C${fmt(bestTimes.evening.endMin)}`);
    }
    return parts.length > 0 ? parts.join(' / ') : null;
  }

  // ==================== 週間スコア予測 ====================
  function calcWeeklyScores(portIndex, baseDate) {
    const days = [];
    for (let d = 0; d < 3; d++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + d);

      const moonAge = TideCalc.calcMoonAge(date);
      const tideName = TideCalc.getTideName(moonAge);
      const points = TideCalc.calcDayTide(portIndex, date);
      const events = TideCalc.findTideEvents(points);
      const tidalRange = TideCalc.getTidalRange(events);
      const sunTimes = TideCalc.calcSunTimes(PORTS[portIndex][3], PORTS[portIndex][4], date);

      const srMin = sunTimes.sunrise ? sunTimes.sunrise * 60 : 360;
      const result = calcScore({
        tideName, tidalRange, minutesOfDay: srMin,
        tideEvents: events,
        pressure: null, pressureTrend: null, pressureChange: null,
        windSpeed: null, windDir: null,
        portLat: PORTS[portIndex][3], portLon: PORTS[portIndex][4],
        waveHeight: null, wavePeriod: null,
        sunTimes, moonAge,
        facing: PORTS[portIndex][10], shelter: PORTS[portIndex][11],
        tidePoints: points
      });

      days.push({
        date,
        tideName,
        score: result.total,
        color: getColor(result.total),
        message: getMessage(result.total)
      });
    }
    return days;
  }

  return {
    calcScore, calcHourlyScores, calcWeeklyScores,
    findBestTime, findDynamicBestTimes, formatBestTimes,
    getMessage, getColor, getRating,
    debugLogTideFlow, calcTideFlowInfo
  };
})();
