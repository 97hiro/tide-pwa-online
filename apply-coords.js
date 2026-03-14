// apply-coords.js
// 3つのCSV (wakayama/hyogo/kyoto) の座標を ports-data.js に反映
// 同名スポット対策: CSVの順番とports-data.jsの出現順を対応させる

const fs = require('fs');

function parseCSV(path) {
  const text = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const entries = [];
  for (const line of text.trim().split('\n').slice(1)) {
    // スポット名,緯度,経度,信頼度,ソース  or  スポット名,緯度,経度,信頼度,"ソース"
    const m = line.match(/^([^,]+),([^,]*),([^,]*),([^,]*),(.*)/);
    if (!m) continue;
    const name = m[1].trim();
    const lat = m[2].trim();
    const lon = m[3].trim();
    const trust = m[4].trim();
    const source = m[5].replace(/^"|"$/g, '').trim();
    entries.push({ name, lat: lat ? parseFloat(lat) : null, lon: lon ? parseFloat(lon) : null, trust, source });
  }
  return entries;
}

// CSVファイル読み込み
const csvFiles = [
  { path: 'wakayama-coords.csv', pref: 'wakayama' },
  { path: 'hyogo-coords.csv', pref: 'hyogo' },
  { path: 'kyoto-coords.csv', pref: 'kyoto' },
];

const portsPath = 'tide-pwa-online/js/ports-data.js';
let portsData = fs.readFileSync(portsPath, 'utf8');

let totalApplied = 0;
let totalSkipped = 0;
let totalNotFound = 0;
const bigMoves = [];
const warnings = [];

for (const { path, pref } of csvFiles) {
  if (!fs.existsSync(path)) {
    console.log(`⚠ ${path} が見つかりません、スキップ`);
    continue;
  }

  const entries = parseCSV(path);
  console.log(`\n=== ${pref} (${entries.length} 件) ===`);

  // ports-data.js内の該当県のスポットを順番に取得
  const spotRegex = new RegExp(`\\["([^"]+)","([^"]*)","${pref}",(\\d+\\.\\d+),(\\d+\\.\\d+),`, 'g');
  const portsSpots = [];
  let match;
  while ((match = spotRegex.exec(portsData)) !== null) {
    portsSpots.push({
      name: match[1],
      city: match[2],
      oldLat: parseFloat(match[3]),
      oldLon: parseFloat(match[4]),
      fullMatch: match[0],
      prefix: match[0].replace(/[\d.]+,[\d.]+,$/, '')
    });
  }

  if (portsSpots.length !== entries.length) {
    console.log(`⚠ CSV件数(${entries.length}) != ports-data.js件数(${portsSpots.length})`);
  }

  // 順番対応で反映（同名スポット対策）
  const len = Math.min(entries.length, portsSpots.length);
  let applied = 0, skipped = 0;

  for (let i = 0; i < len; i++) {
    const csv = entries[i];
    const port = portsSpots[i];

    // 名前一致チェック
    if (csv.name !== port.name) {
      warnings.push(`[${pref}] 順番不一致 #${i}: CSV="${csv.name}" vs ports="${port.name}"`);
      continue;
    }

    if (!csv.lat || !csv.lon || csv.trust === '未取得') {
      skipped++;
      continue;
    }

    const newLat = Math.round(csv.lat * 10000) / 10000;
    const newLon = Math.round(csv.lon * 10000) / 10000;

    // 置換
    const newEntry = `${port.prefix}${newLat},${newLon},`;
    portsData = portsData.replace(port.fullMatch, newEntry);

    const dLat = Math.abs(newLat - port.oldLat);
    const dLon = Math.abs(newLon - port.oldLon);

    if (dLat > 0.03 || dLon > 0.03) {
      bigMoves.push({
        name: port.name, city: port.city, pref,
        oldLat: port.oldLat, oldLon: port.oldLon,
        newLat, newLon, dLat, dLon
      });
    }

    applied++;
  }

  console.log(`  適用: ${applied}, スキップ(未取得): ${skipped}`);
  totalApplied += applied;
  totalSkipped += skipped;
}

// 書き出し
fs.writeFileSync(portsPath, portsData, 'utf8');

// サマリー
console.log(`\n========================================`);
console.log(`合計: ${totalApplied} 件適用, ${totalSkipped} 件スキップ`);

if (warnings.length > 0) {
  console.log(`\n--- 警告 (${warnings.length}) ---`);
  warnings.forEach(w => console.log(`  ${w}`));
}

if (bigMoves.length > 0) {
  console.log(`\n--- 大移動 (Δ>0.03): ${bigMoves.length} 件 ---`);
  for (const m of bigMoves) {
    console.log(`  ${m.name} (${m.city}, ${m.pref}): ${m.oldLat},${m.oldLon} → ${m.newLat},${m.newLon} (Δlat=${m.dLat.toFixed(4)}, Δlon=${m.dLon.toFixed(4)})`);
  }
}

console.log(`\n=== ${portsPath} を更新しました ===`);
