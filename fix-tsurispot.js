// fix-tsurispot.js
// 1. 誤マッチ6件の座標を元に戻す
// 2. 未マッチtsurispot側スポットとports-data.jsを再照合して追加反映

const fs = require('fs');

const portsPath = 'tide-pwa-online/js/ports-data.js';
let portsData = fs.readFileSync(portsPath, 'utf8');

// ==================== 1. 誤マッチ修正（座標を元に戻す） ====================
// tsurispot適用前の座標（Google Maps/tsuriba.info由来）に戻す
const REVERT = [
  // 浦漁港（淡路市）: 須磨浦漁港と誤マッチ → Google Maps座標に戻す
  { name: '浦漁港', pref: 'hyogo', restoreLat: 34.5412, restoreLon: 134.9945 },
  // 小浦漁港（日高町）: tsuriba.info座標に戻す
  { name: '小浦漁港', pref: 'wakayama', restoreLat: 33.9261, restoreLon: 135.0744 },
  // 口和深漁港: Google Maps座標に戻す
  { name: '口和深漁港', pref: 'wakayama', restoreLat: 33.5231, restoreLon: 135.575 },
  // 野原漁港（京都）: Google Maps座標に戻す
  { name: '野原漁港', pref: 'kyoto', restoreLat: 35.5704, restoreLon: 135.4275 },
  // 舞鶴漁港: Google Maps座標に戻す
  { name: '舞鶴漁港', pref: 'kyoto', restoreLat: 35.504, restoreLon: 135.2639 },
  // 日置川河口: tsuriba.info座標に戻す
  { name: '日置川河口', pref: 'wakayama', restoreLat: 33.5644, restoreLon: 135.4482 },
];

console.log('=== 1. 誤マッチ修正（6件） ===\n');

for (const r of REVERT) {
  const escapedName = r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `(\\["${escapedName}","[^"]*","${r.pref}",)(\\d+\\.\\d+),(\\d+\\.\\d+),`
  );
  const match = portsData.match(regex);
  if (!match) {
    console.log(`  ✗ ${r.name} (${r.pref}): 見つかりません`);
    continue;
  }
  const oldLat = parseFloat(match[2]);
  const oldLon = parseFloat(match[3]);
  portsData = portsData.replace(match[0], `${match[1]}${r.restoreLat},${r.restoreLon},`);
  console.log(`  ✓ ${r.name} (${r.pref}): ${oldLat},${oldLon} → ${r.restoreLat},${r.restoreLon}`);
}

// ==================== 2. 未マッチtsurispot側から追加照合 ====================
console.log('\n=== 2. 未マッチtsurispot側から追加照合 ===\n');

// CSVから未マッチ行を取得
const csvText = fs.readFileSync('tsurispot-coords.csv', 'utf8').replace(/^\uFEFF/, '');
const unmatched = [];
let inUnmatched = false;
for (const line of csvText.split('\n')) {
  if (line.includes('--- 未マッチ(tsurispot側) ---')) {
    inUnmatched = true;
    continue;
  }
  if (!inUnmatched) continue;
  const m = line.match(/^\(未マッチ\),([^,]+),([^,]+),([\d.]+),([\d.]+),"([^"]+)"/);
  if (m) {
    unmatched.push({
      pref: m[1],
      tsuriName: m[2],
      lat: parseFloat(m[3]),
      lon: parseFloat(m[4]),
      url: m[5]
    });
  }
}
console.log(`未マッチtsurispot: ${unmatched.length} 件\n`);

// ports-data.js のスポット抽出
const portsSpots = [];
const re = /\["([^"]+)","([^"]*)","(osaka|hyogo|wakayama|kyoto)",([\d.]+),([\d.]+),/g;
let m;
while ((m = re.exec(portsData)) !== null) {
  portsSpots.push({ name: m[1], city: m[2], pref: m[3], lat: parseFloat(m[4]), lon: parseFloat(m[5]) });
}

// 拡張マッチング
function matchName(tsuriName, targetName) {
  if (tsuriName === targetName) return true;
  // 括弧除去
  const stripped = tsuriName.replace(/[（(].+?[）)]/g, '').trim();
  if (stripped === targetName) return true;
  // 部分一致
  if (targetName.length >= 3 && tsuriName.includes(targetName)) return true;
  if (targetName.length >= 3 && stripped.includes(targetName)) return true;
  if (stripped.length >= 3 && targetName.includes(stripped)) return true;
  // 「・」分割
  for (const p of tsuriName.split(/[・\s]/)) {
    if (p.length >= 3 && p === targetName) return true;
  }
  // 港→漁港、漁港→港 の対応
  const variants = [
    tsuriName.replace(/港$/, '漁港'),
    tsuriName.replace(/漁港$/, '港'),
    tsuriName.replace(/^(.+)港$/, '$1'),
  ];
  for (const v of variants) {
    if (v === targetName) return true;
    if (v.length >= 3 && targetName.includes(v)) return true;
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

// 手動マッチング表（名前が異なるケース）
const MANUAL_MATCH = {
  '翼港': '淡路島翼港',
  '神戸空港ベランダ': '神戸空港親水護岸',
  '蒲入漁港': '蒲井漁港',  // 「蒲入」=「かまいり」、蒲井=「かまい」→ 同じ場所の可能性
  '紀ノ川河口': '紀の川河口',
  '丸山港': '丸山漁港',
  '郡家港': '郡家漁港',
  '香住東港': '香住漁港',  // skip: 別スポット
  '鎧港': '鎧漁港',
  '津居山港': '津居山漁港',
  '竹野港': '竹野漁港',  // skip: 既にマッチ済み
  '気比堤防': '気比漁港',
  '福良港': '福良漁港',
  '太地港': '太地漁港',
  '由良港': '由良海つり公園',  // 由良港周辺
  '御坊・日高港': '日高川河口',  // skip: 別スポット
  '海南港': '海南赤灯台',  // skip: 別スポット
  '新宮港': '三輪崎漁港',  // skip: 別スポット
  '和歌山マリーナシティ': 'マリーナシティ海釣り公園',
  '舞鶴西港': '舞鶴港',
  '大塩海岸': '大塩漁港',
  '柴山港': '柴山漁港',
};

// 除外リスト（別スポットなのでマッチさせない）
const SKIP_MATCH = new Set([
  '香住東港', '香住西港', '御坊・日高港', '海南港', '新宮港',
  '南港海釣り公園', '南港北防波堤', '鶴浜地区護岸', '舞洲地区護岸',
  '南港', '堺浜海釣りテラス', '淡路島洲本港', '林崎松江海岸',
  '明石海浜公園護岸', '望海浜公園', '藤江海岸', '松江漁港',
  '明石浦漁港西波止', '魚住漁港', '魚住港', '妻鹿漁港',
  '円山川', '円山川（養父）', '揖保川', '引原川',
  '天橋立文殊堤防', '天橋立', '小橋漁港', 'ミヨ崎灯台',
  '上佐波賀', '平', '泉南りんくう釣り護岸',
  '江井ヶ島港',  // 江井ヶ島漁港と混同の可能性
  '白浜・田辺港', '田辺港',  // 田辺漁港は既にマッチ済み
  '的形海水浴場', '姫路港',  // 既にマッチ済み
  '都志港', '吹上浜', '丸山海釣り公園跡',
  '高砂海浜公園', '東二見漁港', '赤穂御崎',
  '小島岸壁', '家島',
  '白浜漁港', 'すさみ港', 'すさみ漁港', '日置川',
  '有田港', '湯浅広港', '御坊港日高港',
]);

const applied = [];
const excluded = [];  // Δ>0.05で除外

for (const ts of unmatched) {
  if (SKIP_MATCH.has(ts.tsuriName)) continue;

  let targetName = MANUAL_MATCH[ts.tsuriName] || null;
  let targetSpot = null;

  if (targetName) {
    targetSpot = portsSpots.find(ps => ps.name === targetName && ps.pref === ts.pref);
    // pref不一致の場合は全県から探す
    if (!targetSpot) {
      targetSpot = portsSpots.find(ps => ps.name === targetName);
    }
  }

  // 手動マッチがない場合は自動照合
  if (!targetSpot) {
    for (const ps of portsSpots) {
      if (ps.pref !== ts.pref) continue;
      if (matchName(ts.tsuriName, ps.name)) {
        targetSpot = ps;
        targetName = ps.name;
        break;
      }
    }
  }

  if (!targetSpot) continue;

  const b = BOUNDS[targetSpot.pref];
  if (b && (ts.lat < b.latMin || ts.lat > b.latMax || ts.lon < b.lonMin || ts.lon > b.lonMax)) {
    console.log(`  ✗ ${ts.tsuriName} → ${targetSpot.name}: 座標が範囲外`);
    continue;
  }

  const newLat = Math.round(ts.lat * 10000) / 10000;
  const newLon = Math.round(ts.lon * 10000) / 10000;
  const dLat = Math.abs(newLat - targetSpot.lat);
  const dLon = Math.abs(newLon - targetSpot.lon);

  if (dLat > 0.05 || dLon > 0.05) {
    excluded.push({
      name: targetSpot.name, pref: targetSpot.pref,
      tsuriName: ts.tsuriName, url: ts.url,
      oldLat: targetSpot.lat, oldLon: targetSpot.lon,
      newLat, newLon, dLat, dLon
    });
    continue;
  }

  // 適用
  const escapedName = targetSpot.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `(\\["${escapedName}","[^"]*","${targetSpot.pref}",)(\\d+\\.\\d+),(\\d+\\.\\d+),`
  );
  const match = portsData.match(regex);
  if (!match) {
    console.log(`  ✗ ${targetSpot.name}: ports-data.jsで見つかりません`);
    continue;
  }

  portsData = portsData.replace(match[0], `${match[1]}${newLat},${newLon},`);
  applied.push({
    name: targetSpot.name, pref: targetSpot.pref,
    tsuriName: ts.tsuriName, url: ts.url,
    oldLat: targetSpot.lat, oldLon: targetSpot.lon,
    newLat, newLon, dLat, dLon
  });
  console.log(`  ✓ ${ts.tsuriName} → ${targetSpot.name} (${targetSpot.pref}): ${targetSpot.lat},${targetSpot.lon} → ${newLat},${newLon} (Δ${dLat.toFixed(4)},${dLon.toFixed(4)})`);
}

// 書き出し
fs.writeFileSync(portsPath, portsData, 'utf8');

// サマリー
console.log(`\n=== サマリー ===`);
console.log(`誤マッチ修正: ${REVERT.length} 件`);
console.log(`追加適用: ${applied.length} 件`);
console.log(`Δ>0.05 除外: ${excluded.length} 件`);

if (excluded.length > 0) {
  console.log(`\n--- 要確認リスト (Δ>0.05で除外) ---`);
  for (const e of excluded) {
    console.log(`  ${e.name} (${e.pref}) ← tsurispot: ${e.tsuriName}`);
    console.log(`    現在: ${e.oldLat}, ${e.oldLon}`);
    console.log(`    tsurispot: ${e.newLat}, ${e.newLon} (Δlat=${e.dLat.toFixed(4)}, Δlon=${e.dLon.toFixed(4)})`);
    console.log(`    URL: ${e.url}`);
  }
}

if (applied.length > 0) {
  console.log(`\n--- 適用詳細 ---`);
  for (const a of applied) {
    console.log(`  ${a.name} (${a.pref}): ${a.oldLat},${a.oldLon} → ${a.newLat},${a.newLon} (from: ${a.tsuriName})`);
  }
}

console.log(`\n=== ${portsPath} を更新しました ===`);
