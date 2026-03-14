// ==================== chart.js ====================
// Canvas描画: 潮汐グラフ、時間帯別ヒートマップ、月アイコン
// =====================================================

// roundRect polyfill for older browsers
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === 'number') r = [r, r, r, r];
    else if (!Array.isArray(r)) r = [0, 0, 0, 0];
    const [tl, tr, br, bl] = r;
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
    return this;
  };
}

const TideChart = (() => {

  // オーバーレイ描画用にレイアウト情報を保持
  let lastGraphLayout = null;

  // GP棒グラフ色 (スコア→色)
  function getGpBarColor(score) {
    if (score >= 90) return '#ff2020';
    if (score >= 80) return '#ff8c00';
    if (score >= 70) return '#ffd700';
    if (score >= 60) return '#40c060';
    if (score >= 50) return '#4080ff';
    return '#666666';
  }

  // メイン潮汐グラフ描画
  function drawTideGraph(canvas, options) {
    const {
      points, events, sunTimes, isToday, pressureHpa, hourlyScores, gpScores,
      dynamicBestTimes
    } = options;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width;
    // グラフ本体 + ヒートマップバー
    const graphH = Math.min(W * 0.50, 280);
    const heatH = 28; // ヒートマップの高さ
    const H = graphH + heatH + 8;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const pad = { top: 18, right: 12, bottom: 4, left: 40 };
    const gW = W - pad.left - pad.right;
    const gH = graphH - pad.top - pad.bottom;

    // データ範囲
    let minH = Infinity, maxH = -Infinity;
    for (const p of points) {
      const h = p.adjustedHeight != null ? Math.max(p.height, p.adjustedHeight) : p.height;
      const l = p.adjustedHeight != null ? Math.min(p.height, p.adjustedHeight) : p.height;
      if (h > maxH) maxH = h;
      if (l < minH) minH = l;
    }
    const range = maxH - minH || 40;
    const dataMin = minH - range * 0.15;
    const dataMax = maxH + range * 0.15;

    function xPos(minutes) { return pad.left + (minutes / 1440) * gW; }
    function yPos(h) { return pad.top + gH - ((h - dataMin) / (dataMax - dataMin)) * gH; }

    // レイアウト情報を保存（overlay描画用）
    lastGraphLayout = { W, H, graphH, heatH, pad, gW, gH, dataMin, dataMax, points: options.points };

    // 背景
    ctx.fillStyle = '#0c1a2e';
    ctx.fillRect(0, 0, W, H);

    // 日の出/日の入り背景
    if (sunTimes && sunTimes.sunrise != null && sunTimes.sunset != null) {
      const srMin = sunTimes.sunrise * 60;
      const ssMin = sunTimes.sunset * 60;

      // 夜(前)
      ctx.fillStyle = 'rgba(5,12,30,0.6)';
      ctx.fillRect(pad.left, pad.top, xPos(srMin) - pad.left, gH);

      // 日中
      const dayGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + gH);
      dayGrad.addColorStop(0, 'rgba(30,60,100,0.25)');
      dayGrad.addColorStop(1, 'rgba(15,30,60,0.1)');
      ctx.fillStyle = dayGrad;
      ctx.fillRect(xPos(srMin), pad.top, xPos(ssMin) - xPos(srMin), gH);

      // 夜(後)
      ctx.fillStyle = 'rgba(5,12,30,0.6)';
      ctx.fillRect(xPos(ssMin), pad.top, W - pad.right - xPos(ssMin), gH);

      // マズメハイライト（動的ベストタイム or 固定±60分）
      ctx.fillStyle = 'rgba(240,148,58,0.12)';
      if (dynamicBestTimes) {
        if (dynamicBestTimes.morning) {
          const ms = dynamicBestTimes.morning.startMin;
          const me = dynamicBestTimes.morning.endMin;
          ctx.fillRect(xPos(Math.max(0, ms)), pad.top, xPos(Math.min(1440, me)) - xPos(Math.max(0, ms)), gH);
        }
        if (dynamicBestTimes.evening) {
          const es = dynamicBestTimes.evening.startMin;
          const ee = dynamicBestTimes.evening.endMin;
          ctx.fillRect(xPos(Math.max(0, es)), pad.top, xPos(Math.min(1440, ee)) - xPos(Math.max(0, es)), gH);
        }
      } else {
        ctx.fillRect(xPos(Math.max(0, srMin - 60)), pad.top, xPos(Math.min(1440, srMin + 60)) - xPos(Math.max(0, srMin - 60)), gH);
        ctx.fillRect(xPos(Math.max(0, ssMin - 60)), pad.top, xPos(Math.min(1440, ssMin + 60)) - xPos(Math.max(0, ssMin - 60)), gH);
      }

      // マズメラベル
      ctx.font = '9px -apple-system, sans-serif';
      ctx.fillStyle = '#f0943a88';
      ctx.textAlign = 'center';
      if (dynamicBestTimes) {
        if (dynamicBestTimes.morning) {
          const mc = (dynamicBestTimes.morning.startMin + dynamicBestTimes.morning.endMin) / 2;
          ctx.fillText('朝マズメ', xPos(mc), pad.top + 12);
        }
        if (dynamicBestTimes.evening) {
          const ec = (dynamicBestTimes.evening.startMin + dynamicBestTimes.evening.endMin) / 2;
          ctx.fillText('夕マズメ', xPos(ec), pad.top + 12);
        }
      } else {
        ctx.fillText('朝マズメ', xPos(srMin), pad.top + 12);
        ctx.fillText('夕マズメ', xPos(ssMin), pad.top + 12);
      }

      // 日の出/入り線
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#f0943a44';
      ctx.beginPath(); ctx.moveTo(xPos(srMin), pad.top); ctx.lineTo(xPos(srMin), pad.top + gH); ctx.stroke();
      ctx.strokeStyle = '#e74c5e44';
      ctx.beginPath(); ctx.moveTo(xPos(ssMin), pad.top); ctx.lineTo(xPos(ssMin), pad.top + gH); ctx.stroke();
      ctx.setLineDash([]);
    }

    // グリッド（縦 3時間毎）
    ctx.strokeStyle = '#1a2d4a';
    ctx.lineWidth = 0.5;
    for (let h = 0; h <= 24; h += 3) {
      const x = xPos(h * 60);
      ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + gH); ctx.stroke();
    }

    // グリッド（横）+ Y軸ラベル
    const step = Math.max(10, Math.round(range / 4 / 10) * 10) || 20;
    const startY = Math.ceil(dataMin / step) * step;
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    for (let v = startY; v <= dataMax; v += step) {
      const y = yPos(v);
      if (y < pad.top || y > pad.top + gH) continue;
      ctx.strokeStyle = '#1a2d4a';
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = '#5a7090';
      ctx.fillText(Math.round(v) + '', pad.left - 4, y + 3);
    }

    // X軸ラベル
    ctx.fillStyle = '#5a7090';
    ctx.textAlign = 'center';
    for (let h = 0; h <= 24; h += 3) {
      ctx.fillText(h + '', xPos(h * 60), pad.top + gH + 14);
    }

    // ==================== GP棒グラフ (潮位曲線の下に描画) ====================
    if (gpScores && gpScores.length > 0) {
      const barW = gW / 48; // 30分幅 = 1440/30 = 48本
      const rainbowStatuses = ['上げ七分', '下げ三分', '上げ三分', '下げ七分'];

      for (const gp of gpScores) {
        const bx = xPos(gp.minutes);
        const barH = (gp.score / 100) * gH;
        const by = pad.top + gH - barH;
        const isRainbow = gp.score >= 78 && gp.jiaiStatus && rainbowStatuses.includes(gp.jiaiStatus);

        if (isRainbow) {
          const rainbow = ctx.createLinearGradient(bx, by, bx, pad.top + gH);
          rainbow.addColorStop(0.00, 'rgba(255, 0, 0, 0.6)');
          rainbow.addColorStop(0.17, 'rgba(255, 165, 0, 0.6)');
          rainbow.addColorStop(0.33, 'rgba(255, 255, 0, 0.6)');
          rainbow.addColorStop(0.50, 'rgba(0, 200, 0, 0.6)');
          rainbow.addColorStop(0.67, 'rgba(0, 100, 255, 0.6)');
          rainbow.addColorStop(0.83, 'rgba(75, 0, 130, 0.6)');
          rainbow.addColorStop(1.00, 'rgba(148, 0, 211, 0.6)');
          ctx.fillStyle = rainbow;
          ctx.globalAlpha = 1.0;
          ctx.fillRect(bx, by, barW, barH);

          // ★マーカー
          ctx.fillStyle = '#ffd700';
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('\u2605', bx + barW / 2, by - 4);
        } else {
          ctx.fillStyle = getGpBarColor(gp.score);
          ctx.globalAlpha = 0.35;
          ctx.fillRect(bx, by, barW, barH);
        }
      }
      ctx.globalAlpha = 1.0;
    }

    // 気圧補正済み潮位の塗り
    const hasAdjusted = points[0] && points[0].adjustedHeight != null &&
      Math.abs(points[0].adjustedHeight - points[0].height) > 0.1;

    if (hasAdjusted) {
      // 気圧補正潮位の塗りつぶし
      ctx.beginPath();
      ctx.moveTo(xPos(points[0].minutes), yPos(points[0].adjustedHeight));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(xPos(points[i].minutes), yPos(points[i].adjustedHeight));
      }
      ctx.lineTo(xPos(points[points.length-1].minutes), pad.top + gH);
      ctx.lineTo(xPos(points[0].minutes), pad.top + gH);
      ctx.closePath();
      const fillGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + gH);
      fillGrad.addColorStop(0, 'rgba(240,148,58,0.20)');
      fillGrad.addColorStop(1, 'rgba(240,148,58,0.03)');
      ctx.fillStyle = fillGrad;
      ctx.fill();
    }

    // 理論潮位の塗り
    ctx.beginPath();
    ctx.moveTo(xPos(points[0].minutes), yPos(points[0].height));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(xPos(points[i].minutes), yPos(points[i].height));
    }
    ctx.lineTo(xPos(points[points.length-1].minutes), pad.top + gH);
    ctx.lineTo(xPos(points[0].minutes), pad.top + gH);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + gH);
    fillGrad.addColorStop(0, 'rgba(45,125,210,0.30)');
    fillGrad.addColorStop(1, 'rgba(45,125,210,0.03)');
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // 理論潮位ライン
    ctx.beginPath();
    ctx.moveTo(xPos(points[0].minutes), yPos(points[0].height));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(xPos(points[i].minutes), yPos(points[i].height));
    }
    ctx.strokeStyle = hasAdjusted ? 'rgba(62,198,224,0.45)' : '#3ec6e0';
    ctx.lineWidth = hasAdjusted ? 1.5 : 2;
    if (hasAdjusted) ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 気圧補正潮位ライン
    if (hasAdjusted) {
      ctx.beginPath();
      ctx.moveTo(xPos(points[0].minutes), yPos(points[0].adjustedHeight));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(xPos(points[i].minutes), yPos(points[i].adjustedHeight));
      }
      ctx.strokeStyle = '#f0943a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 凡例（GP表示時は非表示）
    if (hasAdjusted && !(gpScores && gpScores.length > 0)) {
      const legX = W - pad.right - 140;
      const legY = pad.top + 4;
      ctx.font = '9px -apple-system, sans-serif';

      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = 'rgba(62,198,224,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(legX, legY + 5); ctx.lineTo(legX + 20, legY + 5); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#7ab8d0';
      ctx.textAlign = 'left';
      ctx.fillText('理論潮位', legX + 24, legY + 8);

      ctx.strokeStyle = '#f0943a';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(legX, legY + 18); ctx.lineTo(legX + 20, legY + 18); ctx.stroke();
      ctx.fillStyle = '#f0943a';
      ctx.fillText('実質潮位（気圧補正）', legX + 24, legY + 21);
    }

    // 満潮/干潮マーカー
    for (const ev of events) {
      const x = xPos(ev.minutes);
      const y = yPos(ev.height);
      const color = ev.type === 'high' ? '#f0943a' : '#3ec6e0';

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#0c1a2e';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const timeStr = ev.time.getHours().toString().padStart(2,'0') + ':' +
                      ev.time.getMinutes().toString().padStart(2,'0');
      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      const labelY = ev.type === 'high' ? y - 10 : y + 15;
      ctx.fillText(`${timeStr} (${ev.height}cm)`,
        Math.max(pad.left + 35, Math.min(W - pad.right - 35, x)), labelY);
    }

    // 時刻マーカーはオーバーレイ(drawOverlay)で描画

    // Y軸ラベル
    ctx.save();
    ctx.fillStyle = '#5a7090';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.translate(10, pad.top + gH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('潮位 (cm)', 0, 0);
    ctx.restore();

    // ==================== 時間帯別ヒートマップバー ====================
    if (hourlyScores && hourlyScores.length > 0) {
      const hmY = graphH + 4;
      const blockW = gW / 12;
      ctx.font = '8px -apple-system, sans-serif';
      ctx.textAlign = 'center';

      for (let i = 0; i < hourlyScores.length; i++) {
        const b = hourlyScores[i];
        const bx = pad.left + i * blockW;

        // ブロック背景
        ctx.fillStyle = b.color + '55';
        ctx.fillRect(bx + 1, hmY, blockW - 2, heatH - 4);

        // スコアテキスト
        ctx.fillStyle = b.color;
        ctx.fillText(b.score, bx + blockW / 2, hmY + heatH / 2 + 3);
      }

      // 最高スコアブロックをハイライト
      let bestIdx = 0;
      for (let i = 1; i < hourlyScores.length; i++) {
        if (hourlyScores[i].score > hourlyScores[bestIdx].score) bestIdx = i;
      }
      const bestX = pad.left + bestIdx * blockW;
      ctx.strokeStyle = hourlyScores[bestIdx].color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bestX + 1, hmY, blockW - 2, heatH - 4);
    }
  }

  // 月の描画
  function drawMoon(canvas, moonAge) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const r = Math.min(w, h) / 2 - 2;
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    // 暗い側
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2540';
    ctx.fill();
    ctx.strokeStyle = '#2a3a5a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 明るい側
    const phase = (moonAge / 29.53059) * Math.PI * 2;
    ctx.beginPath();
    if (phase < Math.PI) {
      ctx.arc(cx, cy, r, -Math.PI/2, Math.PI/2, false);
      const k = Math.cos(phase);
      ctx.ellipse(cx, cy, Math.abs(k) * r, r, 0, Math.PI/2, -Math.PI/2, k < 0);
    } else {
      ctx.arc(cx, cy, r, Math.PI/2, -Math.PI/2, false);
      const k = Math.cos(phase);
      ctx.ellipse(cx, cy, Math.abs(k) * r, r, 0, -Math.PI/2, Math.PI/2, k > 0);
    }
    ctx.closePath();
    ctx.fillStyle = '#e8dcc0';
    ctx.fill();
  }

  // スコアプログレスバー描画
  function drawScoreBar(canvas, score, color) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width;
    const H = 12;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 背景
    ctx.fillStyle = '#1a2d4a';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 6);
    ctx.fill();

    // プログレス
    const pw = (score / 100) * W;
    if (pw > 0) {
      const grad = ctx.createLinearGradient(0, 0, pw, 0);
      grad.addColorStop(0, color + '88');
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(0, 0, pw, H, 6);
      ctx.fill();
    }
  }

  // 風向矢印描画
  function drawWindArrow(canvas, dirDeg, speed) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) / 2 - 4;
    ctx.clearRect(0, 0, w, h);

    if (dirDeg == null) {
      ctx.fillStyle = '#5a7090';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('−', cx, cy + 4);
      return;
    }

    // 円背景
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#152238';
    ctx.fill();
    ctx.strokeStyle = '#2a3a5a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 矢印（風が「吹いてくる」方向を示す）
    const rad = (dirDeg - 90) * Math.PI / 180;
    const arrowLen = r * 0.7;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad);

    // 風速によって色を変える
    let arrowColor = '#4ecb71'; // 微風
    if (speed > 15) arrowColor = '#e74c5e';
    else if (speed > 7) arrowColor = '#f0943a';
    else if (speed > 3) arrowColor = '#f0c040';

    ctx.strokeStyle = arrowColor;
    ctx.fillStyle = arrowColor;
    ctx.lineWidth = 2;

    // 矢印本体
    ctx.beginPath();
    ctx.moveTo(-arrowLen, 0);
    ctx.lineTo(arrowLen * 0.5, 0);
    ctx.stroke();

    // 矢印ヘッド
    ctx.beginPath();
    ctx.moveTo(arrowLen * 0.8, 0);
    ctx.lineTo(arrowLen * 0.3, -5);
    ctx.lineTo(arrowLen * 0.3, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // 週間スコアミニグラフ
  function drawWeeklyMini(canvas, days) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width;
    const H = 60;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    if (!days || days.length === 0) return;

    const barW = Math.min(60, (W - 20) / days.length - 8);
    const startX = (W - days.length * (barW + 8)) / 2;

    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      const x = startX + i * (barW + 8);
      const barH = (d.score / 100) * 36;

      // バー
      ctx.fillStyle = d.color + '66';
      ctx.beginPath();
      ctx.roundRect(x, 36 - barH + 4, barW, barH, 4);
      ctx.fill();
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.roundRect(x, 36 - barH + 4, barW, barH, 4);
      ctx.fill();

      // スコア
      ctx.fillStyle = '#e8edf5';
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.score, x + barW / 2, 36 - barH);

      // 日付
      ctx.fillStyle = '#8899b0';
      ctx.font = '10px -apple-system, sans-serif';
      const dayNames = ['日','月','火','水','木','金','土'];
      const label = i === 0 ? '今日' :
        `${d.date.getMonth()+1}/${d.date.getDate()}(${dayNames[d.date.getDay()]})`;
      ctx.fillText(label, x + barW / 2, H - 4);

      // 潮名
      ctx.fillStyle = '#6a7a90';
      ctx.font = '9px -apple-system, sans-serif';
      ctx.fillText(d.tideName, x + barW / 2, H - 16);
    }
  }

  // オーバーレイ描画（時刻マーカー + ヒートマップ選択ブロック）
  function drawOverlay(canvas, sliderMinutes, hourlyScores) {
    if (!lastGraphLayout) return;
    const { W, H, graphH, heatH, pad, gW, gH, dataMin, dataMax, points } = lastGraphLayout;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    function xPos(minutes) { return pad.left + (minutes / 1440) * gW; }
    function yPos(h) { return pad.top + gH - ((h - dataMin) / (dataMax - dataMin)) * gH; }

    // 時刻マーカー線
    const x = xPos(sliderMinutes);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#e74c5e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + gH);
    ctx.stroke();
    ctx.setLineDash([]);

    // 潮位ドット
    if (points && points.length > 0) {
      const h = TideCalc.getHeightAt(points, sliderMinutes);
      ctx.beginPath();
      ctx.arc(x, yPos(h), 5, 0, Math.PI * 2);
      ctx.fillStyle = '#e74c5e';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // ヒートマップ選択ブロックハイライト
    if (hourlyScores && hourlyScores.length > 0) {
      const hmY = graphH + 4;
      const blockW = gW / 12;
      const blockIdx = Math.min(11, Math.max(0, Math.floor(sliderMinutes / 120)));
      const bx = pad.left + blockIdx * blockW;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, hmY, blockW - 2, heatH - 4);
    }
  }

  return {
    drawTideGraph, drawMoon, drawScoreBar, drawWindArrow, drawWeeklyMini, drawOverlay, getGpBarColor
  };
})();
