// scrape-wakayama-coords.js
// 和歌山130件の座標を tsuriba.info + Google Maps で取得
// 出力: wakayama-coords.csv

const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PREF = 'wakayama';
const PREF_ID = 30;
const BOUNDS = { latMin: 33.43, latMax: 34.30, lonMin: 134.90, lonMax: 136.05 };

function isValid(lat, lon) {
  return lat >= BOUNDS.latMin && lat <= BOUNDS.latMax && lon >= BOUNDS.lonMin && lon <= BOUNDS.lonMax;
}

function extractSpots(portsData) {
  const spots = [];
  const re = /\["([^"]+)","([^"]*)","wakayama",([\d.]+),([\d.]+),/g;
  let m;
  while ((m = re.exec(portsData)) !== null) {
    spots.push({ name: m[1], city: m[2], oldLat: parseFloat(m[3]), oldLon: parseFloat(m[4]) });
  }
  return spots;
}

async function fetchPage(url) {
  const res = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 10000 });
  return res.data;
}

async function getTsuribaSpotList() {
  const spots = [];
  for (let page = 1; page <= 10; page++) {
    const url = page === 1
      ? `https://tsuriba.info/spotlist/${PREF_ID}`
      : `https://tsuriba.info/spotlist/${PREF_ID}?page=${page}`;
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
    } catch (e) { console.log(`  ページ${page}エラー: ${e.message}`); break; }
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

function matchName(tsuribaName, targetName) {
  if (tsuribaName === targetName) return true;
  const stripped = tsuribaName.replace(/[（(].+?[）)]/g, '').trim();
  if (stripped === targetName) return true;
  if (targetName.length >= 3 && tsuribaName.includes(targetName)) return true;
  if (targetName.length >= 4 && stripped.includes(targetName)) return true;
  return false;
}

async function getGMapsCoords(browser, name, city) {
  const query = `${name} ${city || '和歌山'} 釣り`;
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 10000 });
    await sleep(2000);
    try {
      const firstResult = await page.$('a[href*="/maps/place/"]');
      if (firstResult) { await firstResult.click(); await sleep(2000); }
    } catch (e) {}
    const url = page.url();
    const m = url.match(/@(-?[\d.]+),(-?[\d.]+)/);
    if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]), source: searchUrl };
    await sleep(1500);
    const url2 = page.url();
    const m2 = url2.match(/@(-?[\d.]+),(-?[\d.]+)/);
    if (m2) return { lat: parseFloat(m2[1]), lon: parseFloat(m2[2]), source: searchUrl };
  } catch (e) {} finally { await page.close(); }
  return null;
}

async function main() {
  const portsData = fs.readFileSync('tide-pwa-online/js/ports-data.js', 'utf8');
  const allSpots = extractSpots(portsData);
  console.log(`=== 和歌山: ${allSpots.length} スポット ===\n`);

  const results = new Map();

  // Phase 1: tsuriba.info
  console.log('--- Phase 1: tsuriba.info ---');
  const tsuribaSpots = await getTsuribaSpotList();
  console.log(`  tsuriba.info: ${tsuribaSpots.length} スポット`);

  const matched = [];
  for (const ts of tsuribaSpots) {
    for (const ps of allSpots) {
      if (!results.has(ps.name) && matchName(ts.name, ps.name)) {
        matched.push({ target: ps.name, id: ts.id, tsuribaName: ts.name });
        break;
      }
    }
  }
  console.log(`  マッチ: ${matched.length}/${allSpots.length}`);

  for (const m of matched) {
    try {
      const coords = await getTsuribaCoords(m.id);
      if (coords && isValid(coords.lat, coords.lon)) {
        results.set(m.target, { ...coords, trust: 'high' });
        console.log(`  ✓ ${m.target} (${coords.lat}, ${coords.lon})`);
      }
    } catch (e) { console.log(`  ✗ ${m.target}: ${e.message}`); }
    await sleep(800);
  }
  console.log(`\nPhase 1: ${results.size}/${allSpots.length}\n`);

  // Phase 2: Google Maps
  const remaining = allSpots.filter(s => !results.has(s.name));
  console.log(`--- Phase 2: Google Maps (${remaining.length} スポット) ---`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=ja-JP']
  });

  let done = 0;
  for (const spot of remaining) {
    done++;
    if (done % 10 === 0) console.log(`  進捗: ${done}/${remaining.length}`);
    try {
      const coords = await getGMapsCoords(browser, spot.name, spot.city);
      if (coords && isValid(coords.lat, coords.lon)) {
        results.set(spot.name, { ...coords, trust: 'high' });
        console.log(`  ✓ ${spot.name} (${coords.lat}, ${coords.lon})`);
      } else {
        console.log(`  ✗ ${spot.name}: ${coords ? '範囲外' : '座標なし'}`);
      }
    } catch (e) { console.log(`  ✗ ${spot.name}: ${e.message}`); }
    await sleep(1500);
  }

  await browser.close();
  console.log(`\nPhase 2 完了: ${results.size}/${allSpots.length}\n`);

  // CSV出力
  const csvLines = ['スポット名,緯度,経度,信頼度,ソース'];
  for (const spot of allSpots) {
    const r = results.get(spot.name);
    if (r) {
      csvLines.push(`${spot.name},${r.lat},${r.lon},${r.trust},"${r.source}"`);
    } else {
      csvLines.push(`${spot.name},,,未取得,`);
    }
  }
  fs.writeFileSync('wakayama-coords.csv', '\uFEFF' + csvLines.join('\n'), 'utf8');

  const notFound = allSpots.filter(s => !results.has(s.name));
  console.log(`=== 結果: ${results.size}/${allSpots.length} 取得 ===`);
  if (notFound.length > 0) {
    console.log(`未取得 (${notFound.length}): ${notFound.map(s => s.name).join(', ')}`);
  }
}

main().catch(e => { console.error('致命的エラー:', e); process.exit(1); });
