// ==================== tide-calc.js ====================
// 潮汐計算エンジン（調和定数ベース）+ 日の出日の入り + 月齢
// =====================================================

const TideCalc = (() => {
  const DEG = Math.PI / 180;

  // 分潮の角速度 (°/h)
  const SPEEDS = {
    M2: 28.9841042, S2: 30.0000000, K1: 15.0410686, O1: 13.9430356,
    N2: 28.4397295, SA: 0.0410686,  K2: 30.0821373, P1: 14.9589314
  };
  const CONSTITUENTS = ['M2','S2','K1','O1','N2','SA','K2','P1'];

  function getAstro(date) {
    const Y = date.getFullYear(), M = date.getMonth() + 1, D = date.getDate();
    const JD = 367*Y - Math.floor(7*(Y+Math.floor((M+9)/12))/4) + Math.floor(275*M/9) + D + 1721013.5;
    const T = (JD - 2451545.0) / 36525.0;
    return {
      s: (218.3165 + 481267.8813 * T) % 360,
      h: (280.4661 + 36000.7698 * T) % 360,
      p: (83.3532 + 4069.0137 * T) % 360,
      N: (125.0445 - 1934.1363 * T) % 360,
      T
    };
  }

  function getEquilibriumArgs(a) {
    return {
      M2: 2*a.h - 2*a.s, S2: 0, K1: a.h + 90, O1: a.h - 2*a.s - 90,
      N2: 2*a.h - 3*a.s + a.p, SA: a.h, K2: 2*a.h, P1: -a.h + 270
    };
  }

  function getNodeFactors(a) {
    const c = Math.cos(a.N * DEG);
    return {
      M2: 1.0 - 0.037*c, S2: 1.0, K1: 1.006 + 0.115*c, O1: 1.009 + 0.187*c,
      N2: 1.0 - 0.037*c, SA: 1.0, K2: 1.024 + 0.286*c, P1: 1.0
    };
  }

  function getNodePhaseCorr(a) {
    const s = Math.sin(a.N * DEG);
    return {
      M2: -2.1*s, S2: 0, K1: -8.9*s, O1: 10.8*s,
      N2: -2.1*s, SA: 0, K2: -17.7*s, P1: 0
    };
  }

  function getHarmonics(portIndex) {
    const port = PORTS[portIndex];
    const ref1 = REF_PORTS[port[5]];
    if (!port[6]) return ref1;
    const ref2 = REF_PORTS[port[6]];
    const w = port[7];
    const result = {};
    for (const c of CONSTITUENTS) {
      result[c] = [
        ref1[c][0] * w + ref2[c][0] * (1 - w),
        ref1[c][1] * w + ref2[c][1] * (1 - w)
      ];
    }
    return result;
  }

  function calcHeight(harmonics, date, astro, nodeF, nodeU, eqArgs, refStartOfDay) {
    // refStartOfDayが指定された場合はそれを基準にhours計算（日跨ぎ対応）
    const startOfDay = refStartOfDay || new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const hours = (date - startOfDay) / 3600000;
    let h = 100;
    for (const c of CONSTITUENTS) {
      if (!harmonics[c]) continue;
      const A = harmonics[c][0], phi = harmonics[c][1];
      h += nodeF[c] * A * Math.cos((SPEEDS[c] * hours + eqArgs[c] + nodeU[c] - phi) * DEG);
    }
    return h;
  }

  // 1日分の潮位を計算 (145点, 10分間隔: 0〜1440分)
  // extended=true の場合は翌日4時まで (169点, 0〜1680分)
  function calcDayTide(portIndex, date, extended) {
    const harmonics = getHarmonics(portIndex);
    const astro = getAstro(date);
    const nodeF = getNodeFactors(astro);
    const nodeU = getNodePhaseCorr(astro);
    const eqArgs = getEquilibriumArgs(astro);
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const maxIdx = extended ? 168 : 144; // 168 = 1680min = 翌日4:00
    const points = [];
    for (let i = 0; i <= maxIdx; i++) {
      const t = new Date(startOfDay.getTime() + i * 10 * 60000);
      points.push({
        time: t,
        height: calcHeight(harmonics, t, astro, nodeF, nodeU, eqArgs, startOfDay),
        minutes: i * 10
      });
    }
    return points;
  }

  // 満潮・干潮の検出
  function findTideEvents(points) {
    const events = [];
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i-1].height, curr = points[i].height, next = points[i+1].height;
      if (curr > prev && curr > next) {
        events.push({ type: 'high', time: points[i].time, height: Math.round(curr), minutes: points[i].minutes });
      } else if (curr < prev && curr < next) {
        events.push({ type: 'low', time: points[i].time, height: Math.round(curr), minutes: points[i].minutes });
      }
    }
    return events;
  }

  // 潮位差（1日の最大潮位差）
  function getTidalRange(events) {
    if (events.length < 2) return 0;
    let maxH = -Infinity, minH = Infinity;
    for (const e of events) {
      if (e.height > maxH) maxH = e.height;
      if (e.height < minH) minH = e.height;
    }
    return maxH - minH;
  }

  // 指定時刻の潮位を取得
  function getHeightAt(points, minutes) {
    const idx = Math.min(Math.floor(minutes / 10), points.length - 2);
    const frac = (minutes - idx * 10) / 10;
    return points[idx].height + (points[idx+1].height - points[idx].height) * frac;
  }

  // 潮位の変化率（cm/h）を取得
  function getTideRate(points, minutes) {
    const h1 = getHeightAt(points, Math.max(0, minutes - 30));
    const h2 = getHeightAt(points, Math.min(1440, minutes + 30));
    return (h2 - h1); // cm per hour
  }

  // 日の出・日の入り
  function calcSunTimes(lat, lon, date) {
    const rad = Math.PI / 180;
    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    const lnHour = lon / 15;

    function calc(rising) {
      const t = dayOfYear + ((rising ? 6 : 18) - lnHour) / 24;
      const M = 0.9856 * t - 3.289;
      let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634;
      L = ((L % 360) + 360) % 360;
      let RA = Math.atan2(Math.sin(L * rad) * 0.91764, Math.cos(L * rad)) / rad;
      RA = ((RA % 360) + 360) % 360;
      RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
      const sinDec = 0.39782 * Math.sin(L * rad);
      const cosDec = Math.cos(Math.asin(sinDec));
      const cosH = (-0.01454 - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
      if (cosH > 1 || cosH < -1) return null;
      let H = Math.acos(cosH) / rad;
      if (rising) H = 360 - H;
      H /= 15;
      let UT = ((H + RA - 0.06571 * t - 6.622 - lnHour) % 24 + 24) % 24;
      UT += 9; // JST
      if (UT >= 24) UT -= 24;
      return UT;
    }
    return { sunrise: calc(true), sunset: calc(false) };
  }

  // 月齢
  function calcMoonAge(date) {
    const Y = date.getFullYear(), M = date.getMonth() + 1, D = date.getDate();
    const JD = 367*Y - Math.floor(7*(Y+Math.floor((M+9)/12))/4) + Math.floor(275*M/9) + D + 1721013.5;
    return ((JD - 2451550.1) % 29.53059 + 29.53059) % 29.53059;
  }

  // 潮名
  function getTideName(moonAge) {
    const a = Math.floor(moonAge);
    if ((a >= 0 && a <= 2) || (a >= 14 && a <= 17)) return '大潮';
    if ((a >= 3 && a <= 6) || (a >= 11 && a <= 13) || (a >= 18 && a <= 21) || (a >= 25 && a <= 27)) return '中潮';
    if ((a >= 7 && a <= 8) || (a >= 22 && a <= 23)) return '小潮';
    if (a === 9 || a === 24) return '長潮';
    if (a === 10 || a === 25) return '若潮';
    return '中潮';
  }

  // 月相の名前
  function getMoonPhaseName(age) {
    if (age < 1.85) return '新月';
    if (age < 7.38) return '三日月';
    if (age < 9.23) return '上弦';
    if (age < 14.77) return '十三夜';
    if (age < 16.61) return '満月';
    if (age < 22.15) return '居待月';
    if (age < 24.00) return '下弦';
    return '晦日月';
  }

  // 気圧による吸い上げ補正 (cm)
  function pressureCorrection(pressureHpa) {
    if (pressureHpa == null) return 0;
    return (1013.25 - pressureHpa) * 1.0;
  }

  // 気圧補正済み潮位データを生成
  function applyPressureCorrection(points, pressureHpa) {
    const corr = pressureCorrection(pressureHpa);
    return points.map(p => ({
      ...p,
      adjustedHeight: p.height + corr
    }));
  }

  // hours → HH:MM
  function hoursToHHMM(h) {
    if (h == null) return '--:--';
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2,'0')}:${String(mm < 60 ? mm : 0).padStart(2,'0')}`;
  }

  return {
    calcDayTide, findTideEvents, getTidalRange, getHeightAt, getTideRate,
    calcSunTimes, calcMoonAge, getTideName, getMoonPhaseName,
    pressureCorrection, applyPressureCorrection, hoursToHHMM
  };
})();
