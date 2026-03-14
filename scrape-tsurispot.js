// scrape-tsurispot.js
// tsurispot.com から大阪・兵庫・和歌山・京都の釣りスポット座標を取得
// JSON-LD の GeoCoordinates から座標抽出
// 出力: tsurispot-coords.csv + ports-data.js 更新

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PREFS = [
  { key: 'osaka', slug: 'osaka', label: '大阪' },
  { key: 'hyogo', slug: 'hyogo', label: '兵庫' },
  { key: 'wakayama', slug: 'wakayama', label: '和歌山' },
  { key: 'kyoto', slug: 'kyoto', label: '京都' },
];

// ports-data.js のスポット名抽出
function extractPortsSpots(portsData) {
  const spots = [];
  const re = /\["([^"]+)","([^"]*)","(osaka|hyogo|wakayama|kyoto)",([\d.]+),([\d.]+),/g;
  let m;
  while ((m = re.exec(portsData)) !== null) {
    spots.push({ name: m[1], city: m[2], pref: m[3], lat: parseFloat(m[4]), lon: parseFloat(m[5]) });
  }
  return spots;
}

async function fetchPage(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 10000
  });
  return res.data;
}

// 都道府県ページからスポット一覧を取得
async function getSpotList(prefSlug) {
  const url = `https://tsurispot.com/prefecture/${prefSlug}`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);
  const spots = [];
  const seen = new Set();

  $('a[href*="/spots/"]').each((_, el) => {
    const href = $(el).attr('href');
    const match = href.match(/\/spots\/([\w-]+)/);
    if (!match) return;
    const slug = match[1];
    if (seen.has(slug)) return;
    seen.add(slug);

    // リンクテキストからスポット名取得
    let name = $(el).text().trim();
    // 長すぎるテキストは記事タイトルなので除外、短い名前のみ
    if (name.length > 40 || name.length === 0) return;
    // 「の釣り場」「釣りスポット」等の接尾辞除去
    name = name.replace(/の釣り場.*$/, '').replace(/釣りスポット.*$/, '').trim();

    spots.push({ slug, name, url: `https://tsurispot.com/spots/${slug}` });
  });

  return spots;
}

// スポットページからJSON-LD座標を取得
async function getSpotCoords(spotUrl) {
  const html = await fetchPage(spotUrl);
  const $ = cheerio.load(html);

  // JSON-LD から座標取得
  let lat = null, lon = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (lat) return; // 既に取得済み
    try {
      const json = JSON.parse($(el).html());
      if (json.geo && json.geo.latitude && json.geo.longitude) {
        lat = parseFloat(json.geo.latitude);
        lon = parseFloat(json.geo.longitude);
      }
      // @graph 内に含まれる場合
      if (!lat && json['@graph']) {
        for (const item of json['@graph']) {
          if (item.geo && item.geo.latitude) {
            lat = parseFloat(item.geo.latitude);
            lon = parseFloat(item.geo.longitude);
            break;
          }
        }
      }
    } catch (e) {}
  });

  // fallback: Google Maps リンクから
  if (!lat) {
    $('a[href*="google.com/maps"]').each((_, el) => {
      if (lat) return;
      const href = $(el).attr('href');
      const m = href.match(/[?&]q=([-\d.]+),([-\d.]+)/);
      if (m) {
        lat = parseFloat(m[1]);
        lon = parseFloat(m[2]);
      }
    });
  }

  // スポット名も取得（h1タグ）
  let pageName = $('h1').first().text().trim();
  // 「の釣り場情報」等の接尾辞除去
  pageName = pageName
    .replace(/の釣り場.*$/, '')
    .replace(/釣り場ガイド.*$/, '')
    .replace(/釣りスポット.*$/, '')
    .replace(/完全ガイド.*$/, '')
    .trim();

  return { lat, lon, pageName };
}

// 名前マッチング
function matchName(tsuriName, targetName) {
  // 完全一致
  if (tsuriName === targetName) return true;
  // 括弧除去
  const stripped = tsuriName.replace(/[（(].+?[）)]/g, '').trim();
  if (stripped === targetName) return true;
  // ターゲットがtsuriNameに含まれる
  if (targetName.length >= 3 && tsuriName.includes(targetName)) return true;
  if (targetName.length >= 3 && stripped.includes(targetName)) return true;
  // tsuriNameがターゲットに含まれる
  if (stripped.length >= 3 && targetName.includes(stripped)) return true;
  // 「・」で分割してマッチ
  const parts = tsuriName.split(/[・\s]/);
  for (const p of parts) {
    if (p.length >= 3 && p === targetName) return true;
  }
  return false;
}

// バウンディングボックス
const BOUNDS = {
  osaka:    { latMin: 34.27, latMax: 34.82, lonMin: 135.08, lonMax: 135.60 },
  wakayama: { latMin: 33.43, latMax: 34.30, lonMin: 134.90, lonMax: 136.05 },
  hyogo:    { latMin: 34.17, latMax: 35.70, lonMin: 134.30, lonMax: 135.50 },
  kyoto:    { latMin: 35.40, latMax: 35.80, lonMin: 134.90, lonMax: 135.50 },
};

function isValid(lat, lon, pref) {
  const b = BOUNDS[pref];
  if (!b) return lat > 33 && lat < 36 && lon > 134 && lon < 137;
  return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;
}

// ==================== テストモード ====================
async function testOne() {
  console.log('=== テスト: 大阪1件 ===\n');
  const spots = await getSpotList('osaka');
  console.log(`大阪スポット数: ${spots.length}`);
  console.log(`最初の5件:`);
  spots.slice(0, 5).forEach(s => console.log(`  ${s.name} → ${s.url}`));

  // 1件目の座標取得テスト
  const test = spots[0];
  console.log(`\nテスト取得: ${test.name} (${test.url})`);
  const coords = await getSpotCoords(test.url);
  console.log(`  ページ名: ${coords.pageName}`);
  console.log(`  座標: ${coords.lat}, ${coords.lon}`);

  if (coords.lat && coords.lon) {
    console.log(`\n✓ 座標取得成功！全件実行に進みます...\n`);
    return true;
  } else {
    console.log(`\n✗ 座標取得失敗。スクリプトを確認してください。`);
    return false;
  }
}

// ==================== 全件実行 ====================
async function runAll() {
  const portsPath = 'tide-pwa-online/js/ports-data.js';
  const portsData = fs.readFileSync(portsPath, 'utf8');
  const portsSpots = extractPortsSpots(portsData);
  console.log(`ports-data.js: ${portsSpots.length} スポット\n`);

  // 全tsurispot座標を収集
  const allResults = []; // { name, pageName, pref, lat, lon, url }

  for (const pref of PREFS) {
    console.log(`--- ${pref.label} ---`);
    const spots = await getSpotList(pref.slug);
    console.log(`  一覧: ${spots.length} スポット`);
    await sleep(1000);

    let fetched = 0, withCoords = 0;
    for (const spot of spots) {
      try {
        const coords = await getSpotCoords(spot.url);
        fetched++;
        if (coords.lat && coords.lon && isValid(coords.lat, coords.lon, pref.key)) {
          allResults.push({
            name: spot.name,
            pageName: coords.pageName,
            pref: pref.key,
            lat: coords.lat,
            lon: coords.lon,
            url: spot.url
          });
          withCoords++;
        }
        if (fetched % 20 === 0) console.log(`  進捗: ${fetched}/${spots.length}`);
      } catch (e) {
        fetched++;
      }
      await sleep(1000);
    }
    console.log(`  座標取得: ${withCoords}/${spots.length}\n`);
  }

  console.log(`=== 全座標: ${allResults.length} 件 ===\n`);

  // ports-data.js のスポットとマッチング
  const matched = new Map(); // portsスポット名 → { lat, lon, source, tsuriName }

  for (const ps of portsSpots) {
    if (matched.has(ps.name)) continue;
    for (const ts of allResults) {
      if (ts.pref !== ps.pref) continue;
      if (matchName(ts.pageName, ps.name) || matchName(ts.name, ps.name)) {
        matched.set(ps.name, {
          lat: ts.lat,
          lon: ts.lon,
          source: ts.url,
          tsuriName: ts.pageName,
          pref: ps.pref
        });
        break;
      }
    }
  }

  console.log(`マッチ: ${matched.size}/${portsSpots.length}\n`);

  // CSV出力
  const csvLines = ['スポット名,県,tsurispot名,緯度,経度,ソース'];
  for (const ps of portsSpots) {
    const m = matched.get(ps.name);
    if (m) {
      csvLines.push(`${ps.name},${m.pref},${m.tsuriName},${m.lat},${m.lon},"${m.source}"`);
    }
  }
  // マッチしなかったtsurispot側も記録
  csvLines.push('');
  csvLines.push('--- 未マッチ(tsurispot側) ---');
  const matchedTsuriNames = new Set([...matched.values()].map(v => v.source));
  for (const ts of allResults) {
    if (!matchedTsuriNames.has(ts.url)) {
      csvLines.push(`(未マッチ),${ts.pref},${ts.pageName},${ts.lat},${ts.lon},"${ts.url}"`);
    }
  }

  fs.writeFileSync('tsurispot-coords.csv', '\uFEFF' + csvLines.join('\n'), 'utf8');
  console.log(`tsurispot-coords.csv を出力 (${matched.size} マッチ)\n`);

  // ports-data.js 更新
  let updatedData = portsData;
  let applied = 0;
  const bigMoves = [];

  for (const [name, upd] of matched) {
    const ps = portsSpots.find(s => s.name === name && s.pref === upd.pref);
    if (!ps) continue;

    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(\\["${escapedName}","[^"]*","${upd.pref}",)(\\d+\\.\\d+),(\\d+\\.\\d+),`
    );
    const match = updatedData.match(regex);
    if (!match) continue;

    const oldLat = parseFloat(match[2]);
    const oldLon = parseFloat(match[3]);
    const newLat = Math.round(upd.lat * 10000) / 10000;
    const newLon = Math.round(upd.lon * 10000) / 10000;

    updatedData = updatedData.replace(match[0], `${match[1]}${newLat},${newLon},`);

    const dLat = Math.abs(newLat - oldLat);
    const dLon = Math.abs(newLon - oldLon);
    if (dLat > 0.01 || dLon > 0.01) {
      bigMoves.push({ name, pref: upd.pref, tsuriName: upd.tsuriName, oldLat, oldLon, newLat, newLon, dLat, dLon });
    }
    applied++;
  }

  fs.writeFileSync(portsPath, updatedData, 'utf8');
  console.log(`ports-data.js 更新: ${applied} 件\n`);

  if (bigMoves.length > 0) {
    console.log(`--- 座標変動 (Δ>0.01): ${bigMoves.length} 件 ---`);
    for (const m of bigMoves) {
      console.log(`  ${m.name} (${m.pref}, tsurispot:${m.tsuriName}): ${m.oldLat},${m.oldLon} → ${m.newLat},${m.newLon} (Δ${m.dLat.toFixed(4)},${m.dLon.toFixed(4)})`);
    }
  }

  // マッチ詳細
  console.log(`\n--- マッチ詳細 (県別) ---`);
  for (const pref of PREFS) {
    const prefMatched = [...matched.entries()].filter(([, v]) => v.pref === pref.key);
    const prefTotal = portsSpots.filter(s => s.pref === pref.key).length;
    console.log(`  ${pref.label}: ${prefMatched.length}/${prefTotal}`);
  }
}

// ==================== メイン ====================
async function main() {
  const testOk = await testOne();
  if (!testOk) return;

  await sleep(1000);
  await runAll();
  console.log('\n=== 完了 ===');
}

main().catch(e => { console.error('致命的エラー:', e); process.exit(1); });
