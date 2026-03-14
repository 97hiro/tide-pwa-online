#!/usr/bin/env node
/**
 * match-osaka-port.js
 *
 * 大阪市港湾局の立入禁止施設に住所ベースで座標を付与し、
 * spotsテーブルと距離マッチング。
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'fishing-spots.db');
const UA = 'tidegraph-geocoder/1.0';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocode(query) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.length === 0) return null;
  const lat = parseFloat(data[0].lat);
  const lon = parseFloat(data[0].lon);
  // 大阪湾付近のみ有効
  if (lat < 34.4 || lat > 34.8 || lon < 135.2 || lon > 135.6) return null;
  return { lat, lon };
}

// 施設名→住所マッピング（条例PDFより）
const FACILITIES = [
  { name: '南港北防波堤', addr: '大阪市住之江区南港北3丁目' },
  { name: '常吉防波堤の一部', addr: '大阪市此花区常吉2丁目' },
  { name: '北海岸通船だまり波除堤', addr: null }, // 阪神港大阪区第2区
  { name: '鶴浜通船だまり北波除堤', addr: null }, // 阪神港大阪区第3区
  { name: '木材整理場波除堤', addr: '大阪市住之江区南港東4丁目' },
  { name: '夢洲波除堤', addr: '大阪市此花区夢洲中1丁目' },
  { name: '舞洲地区護岸の一部', addr: '大阪市此花区北港緑地2丁目' },
  { name: '夢洲地区K護岸', addr: '大阪市此花区夢洲東1丁目' },
  { name: '夢洲地区J護岸', addr: '大阪市此花区夢洲東1丁目' },
  { name: '南港北地区護岸の一部', addr: '大阪市住之江区南港北1丁目' },
  { name: '南港北護岸の一部', addr: '大阪市住之江区南港東9丁目' },
  { name: '南港北ふ頭西護岸の一部', addr: '大阪市住之江区南港北3丁目' },
  { name: '南港西護岸', addr: '大阪市住之江区南港中1丁目' },
  { name: '南港中1丁目護岸', addr: '大阪市住之江区南港中1丁目' },
  { name: '南港南ふ頭北護岸', addr: '大阪市住之江区南港南7丁目' },
  { name: '南港南ふ頭東護岸の一部', addr: '大阪市住之江区南港南4丁目' },
  { name: '南港南ふ頭南護岸の一部', addr: '大阪市住之江区南港南4丁目' },
  { name: '南港南ふ頭西護岸の一部', addr: '大阪市住之江区南港南7丁目' },
  { name: '南港東護岸', addr: '大阪市住之江区南港東1丁目' },
  { name: '南港南護岸', addr: '大阪市住之江区南港南1丁目' },
  { name: '平林護岸', addr: '大阪市住之江区南港東1丁目' },
  { name: '鶴浜地区北側護岸', addr: '大阪市大正区鶴町3丁目' },
  { name: '鶴浜地区南側護岸', addr: '大阪市大正区鶴町2丁目' },
  { name: '鶴浜地区西側護岸', addr: '大阪市大正区鶴町3丁目' },
  { name: '夢洲地区F廃棄物埋立護岸', addr: '大阪市此花区夢洲東1丁目' },
  { name: '新島地区北廃棄物埋立護岸', addr: null }, // 阪神港大阪区第6区
  { name: '新島地区東廃棄物埋立護岸', addr: null }, // 阪神港大阪区第6区
  { name: '新島地区南廃棄物埋立護岸', addr: null }, // 阪神港大阪区第6区
  { name: '新島地区西廃棄物埋立護岸', addr: null }, // 阪神港大阪区第6区
];

async function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const osakaSpots = db.prepare(`
    SELECT id, name, lat, lon FROM spots
    WHERE prefecture = '大阪府' AND lat IS NOT NULL
  `).all();
  console.log(`大阪府 spots: ${osakaSpots.length}件\n`);

  // Step 1: Geocoding
  console.log('=== Step 1: 座標取得 ===');
  const results = [];
  let geoOk = 0, geoSkip = 0, geoFail = 0;

  for (const f of FACILITIES) {
    if (!f.addr) {
      console.log(`  SKIP ${f.name} (阪神港区番号のみ)`);
      results.push({ ...f, lat: null, lon: null });
      geoSkip++;
      continue;
    }

    await sleep(1100);
    let coords = await geocode(f.addr);

    // 失敗時は丁目を除去して再試行
    if (!coords) {
      const simpler = f.addr.replace(/\d+丁目$/, '');
      if (simpler !== f.addr) {
        await sleep(1100);
        coords = await geocode(simpler);
      }
    }

    if (coords) {
      geoOk++;
      results.push({ ...f, ...coords });
      console.log(`  OK   ${f.name} → ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`);
    } else {
      geoFail++;
      results.push({ ...f, lat: null, lon: null });
      console.log(`  NG   ${f.name} (${f.addr})`);
    }
  }

  console.log(`\n座標取得: ${geoOk}成功, ${geoSkip}スキップ, ${geoFail}失敗\n`);

  // Step 2: 距離計算
  console.log('=== Step 2 & 3: 距離マッチング ===\n');
  const auto = [], review = [], none = [];

  for (const r of results) {
    if (!r.lat) {
      none.push({ name: r.name, reason: r.addr ? '座標取得失敗' : '住所不明(港区番号)' });
      continue;
    }

    const candidates = [];
    for (const s of osakaSpots) {
      const d = haversine(r.lat, r.lon, s.lat, s.lon);
      if (d <= 200) candidates.push({ spotId: s.id, spotName: s.name, dist: Math.round(d) });
    }
    candidates.sort((a, b) => a.dist - b.dist);

    if (candidates.length === 0) {
      none.push({ name: r.name, reason: '200m以内に候補なし', lat: r.lat, lon: r.lon });
    } else if (candidates[0].dist <= 100) {
      auto.push({ regName: r.name, candidates });
    } else {
      review.push({ regName: r.name, candidates });
    }
  }

  console.log('[自動UPDATE: 100m以内]');
  if (auto.length === 0) console.log('  なし');
  for (const m of auto) {
    console.log(`  "${m.regName}"`);
    for (const c of m.candidates) {
      const mark = c === m.candidates[0] ? ' ★' : '';
      console.log(`    → spots.${c.spotName} (id=${c.spotId}) ${c.dist}m${mark}`);
    }
  }

  console.log('\n[要確認: 100〜200m]');
  if (review.length === 0) console.log('  なし');
  for (const m of review) {
    console.log(`  "${m.regName}"`);
    for (const c of m.candidates) {
      console.log(`    → spots.${c.spotName} (id=${c.spotId}) ${c.dist}m`);
    }
  }

  console.log('\n[候補なし]');
  for (const m of none) {
    const coord = m.lat ? ` (${m.lat.toFixed(4)}, ${m.lon.toFixed(4)})` : '';
    console.log(`  "${m.name}" → ${m.reason}${coord}`);
  }

  // Step 4: 自動UPDATE
  if (auto.length > 0) {
    console.log('\n=== 自動UPDATE実行 ===');
    const updateStmt = db.prepare('UPDATE spot_regulations SET spot_id = ? WHERE spot_name = ? AND source_name = ?');
    const tx = db.transaction(() => {
      for (const m of auto) {
        const best = m.candidates[0];
        const chg = updateStmt.run(best.spotId, m.regName, '大阪市港湾局');
        console.log(`  "${m.regName}" → spot_id=${best.spotId} (${best.spotName}) ${best.dist}m [changed=${chg.changes}]`);
      }
    });
    tx();
  }

  // 最終集計
  const finalNull = db.prepare(`
    SELECT COUNT(*) as cnt FROM spot_regulations
    WHERE source_name = '大阪市港湾局' AND spot_id IS NULL
  `).get().cnt;
  const finalMatched = db.prepare(`
    SELECT COUNT(*) as cnt FROM spot_regulations
    WHERE source_name = '大阪市港湾局' AND spot_id IS NOT NULL
  `).get().cnt;

  console.log('\n=== 最終集計 ===');
  console.log(`  座標取得成功:       ${geoOk} / ${FACILITIES.length}件`);
  console.log(`  自動UPDATE(≤100m):  ${auto.length}件`);
  console.log(`  要確認(100-200m):   ${review.length}件`);
  console.log(`  候補なし/スキップ:  ${none.length}件`);
  console.log(`  spot_id 設定済:     ${finalMatched}件`);
  console.log(`  spot_id=NULL 残:    ${finalNull}件`);

  db.close();
}

main().catch(console.error);
