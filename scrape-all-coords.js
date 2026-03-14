// scrape-all-coords.js
// 和歌山・兵庫・京都の全スポット座標を tsuriba.info + Google Maps で取得し ports-data.js を更新
// 出力: all-coords-scraped.csv

const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ==================== 座標バウンディングボックス ====================
const BOUNDS = {
  wakayama: { latMin: 33.43, latMax: 34.30, lonMin: 134.90, lonMax: 136.05 },
  hyogo:    { latMin: 34.17, latMax: 35.70, lonMin: 134.30, lonMax: 135.50 },
  kyoto:    { latMin: 35.40, latMax: 35.80, lonMin: 134.90, lonMax: 135.50 },
};

function isValid(lat, lon, pref) {
  const b = BOUNDS[pref];
  if (!b) return lat > 33 && lat < 36 && lon > 134 && lon < 137;
  return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;
}

// ==================== ports-data.js からスポット抽出 ====================
function extractSpots(portsData, prefKeys) {
  const spots = [];
  const re = /\["([^"]+)","([^"]*)","(wakayama|hyogo|kyoto)",([\d.]+),([\d.]+),/g;
  let m;
  while ((m = re.exec(portsData)) !== null) {
    if (prefKeys.includes(m[3])) {
      spots.push({
        name: m[1], city: m[2], pref: m[3],
        oldLat: parseFloat(m[4]), oldLon: parseFloat(m[5])
      });
    }
  }
  return spots;
}

// ==================== tsuriba.info ====================
const TSURIBA_PREF_IDS = { wakayama: 30, hyogo: 28, kyoto: 26 };

async function fetchPage(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 15000
  });
  return res.data;
}

async function getTsuribaSpotList(prefId) {
  const spots = [];
  for (let page = 1; page <= 10; page++) {
    const url = page === 1
      ? `https://tsuriba.info/spotlist/${prefId}`
      : `https://tsuriba.info/spotlist/${prefId}?page=${page}`;
    try {
      const html = await fetchPage(url);
      const $ = cheerio.load(html);
      let found = 0;
      $('a[href*="/spot/"]').each((_, el) => {
        const href = $(el).attr('href');
        const match = href.match(/\/spot\/(\d+)/);
        if (!match) return;
        const id = parseInt(match[1]);
        const name = $(el).text().trim();
        if (name && id) { spots.push({ id, name }); found++; }
      });
      if (found === 0) break;
      await sleep(1000);
    } catch (e) { break; }
  }
  const seen = new Set();
  return spots.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
}

async function getTsuribaCoords(spotId) {
  const url = `https://tsuriba.info/spot/${spotId}`;
  const html = await fetchPage(url);
  const match = html.match(/VIEW_SPOTS_PROFILE\s*=\s*(\{[\s\S]*?\});/);
  if (match) {
    try {
      const obj = JSON.parse(match[1]);
      if (obj.spot && obj.spot.x && obj.spot.y) {
        return { lat: obj.spot.y, lon: obj.spot.x, source: url };
      }
    } catch (e) {}
  }
  return null;
}

// 名前マッチング（括弧除去・部分一致対応）
function matchName(tsuribaName, targetName) {
  if (tsuribaName === targetName) return true;
  const stripped = tsuribaName.replace(/[（(].+?[）)]/g, '').trim();
  if (stripped === targetName) return true;
  if (targetName.length >= 3 && tsuribaName.includes(targetName)) return true;
  if (targetName.length >= 4 && stripped.includes(targetName)) return true;
  return false;
}

// ==================== Google Maps (Puppeteer) ====================
async function getGMapsCoords(browser, name, city, pref) {
  const prefName = { wakayama: '和歌山', hyogo: '兵庫', kyoto: '京都' }[pref] || '';
  const query = `${name} ${city || prefName} 釣り`;
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

  const page = await browser.newPage();
  await page.setUserAgent(UA);

  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 25000 });
    await sleep(2000);

    // リスト表示なら最初の結果をクリック
    try {
      const firstResult = await page.$('a[href*="/maps/place/"]');
      if (firstResult) { await firstResult.click(); await sleep(2000); }
    } catch (e) {}

    const url = page.url();
    const m = url.match(/@(-?[\d.]+),(-?[\d.]+)/);
    if (m) {
      return { lat: parseFloat(m[1]), lon: parseFloat(m[2]), source: searchUrl };
    }

    // リトライ
    await sleep(1500);
    const url2 = page.url();
    const m2 = url2.match(/@(-?[\d.]+),(-?[\d.]+)/);
    if (m2) {
      return { lat: parseFloat(m2[1]), lon: parseFloat(m2[2]), source: searchUrl };
    }
  } catch (e) {} finally { await page.close(); }
  return null;
}

// ==================== メイン ====================
async function main() {
  const portsPath = 'tide-pwa-online/js/ports-data.js';
  let portsData = fs.readFileSync(portsPath, 'utf8');

  const prefKeys = ['wakayama', 'hyogo', 'kyoto'];
  const allSpots = extractSpots(portsData, prefKeys);
  console.log(`=== 対象: ${allSpots.length} スポット ===`);
  console.log(`  和歌山: ${allSpots.filter(s=>s.pref==='wakayama').length}`);
  console.log(`  兵庫: ${allSpots.filter(s=>s.pref==='hyogo').length}`);
  console.log(`  京都: ${allSpots.filter(s=>s.pref==='kyoto').length}\n`);

  const results = new Map(); // name → { lat, lon, source, trust }

  // ---- Phase 1: tsuriba.info ----
  console.log('--- Phase 1: tsuriba.info ---');
  for (const pref of prefKeys) {
    const prefId = TSURIBA_PREF_IDS[pref];
    console.log(`\n  [${pref}] スポット一覧取得中 (prefId=${prefId})...`);
    const tsuribaSpots = await getTsuribaSpotList(prefId);
    console.log(`  ${tsuribaSpots.length} スポット`);

    const prefSpots = allSpots.filter(s => s.pref === pref);

    // マッチング
    const matched = [];
    for (const ts of tsuribaSpots) {
      for (const ps of prefSpots) {
        if (!results.has(ps.name) && matchName(ts.name, ps.name)) {
          matched.push({ target: ps.name, id: ts.id, tsuribaName: ts.name, pref });
          break;
        }
      }
    }
    console.log(`  マッチ: ${matched.length}/${prefSpots.length}`);

    // 座標取得
    for (const m of matched) {
      try {
        const coords = await getTsuribaCoords(m.id);
        if (coords && isValid(coords.lat, coords.lon, m.pref)) {
          results.set(m.target, { lat: coords.lat, lon: coords.lon, source: coords.source, trust: 'high' });
        }
      } catch (e) {}
      await sleep(800);
    }
    console.log(`  取得: ${matched.filter(m => results.has(m.target)).length}`);
  }

  console.log(`\nPhase 1 完了: ${results.size}/${allSpots.length}\n`);

  // ---- Phase 2: Google Maps (Puppeteer) ----
  const remaining = allSpots.filter(s => !results.has(s.name));
  console.log(`--- Phase 2: Google Maps (${remaining.length} スポット) ---`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=ja-JP']
  });

  let gmapsDone = 0;
  for (const spot of remaining) {
    gmapsDone++;
    if (gmapsDone % 20 === 0) console.log(`  進捗: ${gmapsDone}/${remaining.length}`);

    try {
      const coords = await getGMapsCoords(browser, spot.name, spot.city, spot.pref);
      if (coords && isValid(coords.lat, coords.lon, spot.pref)) {
        results.set(spot.name, { lat: coords.lat, lon: coords.lon, source: coords.source, trust: 'high' });
      }
    } catch (e) {}
    await sleep(2000);
  }

  await browser.close();
  console.log(`\nPhase 2 完了: ${results.size}/${allSpots.length}\n`);

  // ---- CSV出力 ----
  const csvLines = ['スポット名,県,緯度,経度,信頼度,ソース'];
  for (const spot of allSpots) {
    const r = results.get(spot.name);
    if (r) {
      csvLines.push(`${spot.name},${spot.pref},${r.lat},${r.lon},${r.trust},"${r.source}"`);
    } else {
      csvLines.push(`${spot.name},${spot.pref},,,未取得,`);
    }
  }
  fs.writeFileSync('all-coords-scraped.csv', '\uFEFF' + csvLines.join('\n'), 'utf8');

  // ---- ports-data.js 更新 ----
  console.log('--- ports-data.js 更新 ---\n');

  // 既存の要確認コメント除去
  portsData = portsData.replace(/ *\/\/ 要確認: 座標/g, '');

  let applied = 0, bigMoves = [];
  for (const spot of allSpots) {
    const r = results.get(spot.name);
    if (!r) continue;

    const escapedName = spot.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(\\["${escapedName}","[^"]*","${spot.pref}",)(\\d+\\.\\d+),(\\d+\\.\\d+),`
    );
    const match = portsData.match(regex);
    if (!match) continue;

    const newLat = Math.round(r.lat * 10000) / 10000;
    const newLon = Math.round(r.lon * 10000) / 10000;

    portsData = portsData.replace(match[0], `${match[1]}${newLat},${newLon},`);

    // 低信頼は要確認コメント
    if (r.trust === 'low') {
      const lineRegex = new RegExp(`(\\["${escapedName}",[^\\n]+?)\\s*$`, 'm');
      const lineMatch = portsData.match(lineRegex);
      if (lineMatch && !lineMatch[0].includes('// 要確認')) {
        portsData = portsData.replace(lineMatch[0], lineMatch[1] + ' // 要確認: 座標');
      }
    }

    const dLat = Math.abs(newLat - spot.oldLat);
    const dLon = Math.abs(newLon - spot.oldLon);
    if (dLat > 0.03 || dLon > 0.03) {
      bigMoves.push({ name: spot.name, pref: spot.pref, oldLat: spot.oldLat, oldLon: spot.oldLon, newLat, newLon, dLat, dLon, source: r.source });
    }
    applied++;
  }

  fs.writeFileSync(portsPath, portsData, 'utf8');

  // ---- サマリー ----
  console.log(`更新: ${applied}/${allSpots.length} 件`);

  const notUpdated = allSpots.filter(s => !results.has(s.name));
  if (notUpdated.length > 0) {
    console.log(`\n未取得 (${notUpdated.length}): ${notUpdated.map(s => s.name).join(', ')}`);
  }

  if (bigMoves.length > 0) {
    console.log(`\n--- 大移動 (Δ>0.03) : ${bigMoves.length} 件 ---`);
    for (const m of bigMoves) {
      console.log(`  ${m.name} (${m.pref}): ${m.oldLat},${m.oldLon} → ${m.newLat},${m.newLon} (Δlat=${m.dLat.toFixed(4)}, Δlon=${m.dLon.toFixed(4)})`);
    }
  }

  // ソース別集計
  let tsuriba = 0, gmaps = 0;
  for (const [, v] of results) {
    if (v.source.includes('tsuriba.info')) tsuriba++;
    else gmaps++;
  }
  console.log(`\nソース別: tsuriba=${tsuriba}, GMaps=${gmaps}`);
  console.log(`\n=== 完了 ===`);
}

main().catch(e => { console.error('致命的エラー:', e); process.exit(1); });
