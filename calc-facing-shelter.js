#!/usr/bin/env node
/**
 * calc-facing-shelter.js
 * 
 * 海岸線ベクトル解析による Facing / Shelter 半自動計算スクリプト
 * 
 * 概要:
 *   1. Overpass API から対象エリアの海岸線 (natural=coastline) を取得
 *   2. 各釣りスポットの最寄り海岸線セグメントを特定
 *   3. 海岸線の法線ベクトル（海側方向）から facing を計算
 *   4. 周囲の海岸線密度・包囲度から shelter を推定
 *   5. 結果をJSON/ports-data.js形式で出力
 * 
 * OSM海岸線ルール:
 *   - 海岸線wayの進行方向に対して「左=陸、右=海」
 *   - つまり進行方向の右90度回転 = 海に向かう方向 = facing
 * 
 * 使い方:
 *   node calc-facing-shelter.js [--area wakayama|osaka|kyoto|hyogo|all]
 *   node calc-facing-shelter.js --spots spots-input.json
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 設定
// ============================================================

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// エリア別バウンディングボックス [south, west, north, east]
const AREA_BBOX = {
  wakayama: [33.4, 134.8, 34.4, 136.1],
  osaka:    [34.2, 135.0, 34.85, 135.55],
  kyoto:    [35.5, 134.8, 35.85, 135.4],
  hyogo:    [34.2, 134.5, 35.7, 135.5],
};

// shelter計算パラメータ
const SHELTER_PARAMS = {
  SEARCH_RADIUS_M: 500,     // shelter計算の探索半径(m)
  SECTOR_COUNT: 12,          // 方位を何分割するか（12=30度刻み）
  MIN_COASTLINE_DIST_M: 50, // 最寄り海岸線までの最低距離(m)
};

// ============================================================
// 地理計算ユーティリティ
// ============================================================

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_R = 6371000; // 地球半径(m)

/**
 * 2点間の距離(m) - Haversine
 */
function haversine(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) *
    Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

/**
 * 2点間の方位角(度) - 0=北, 90=東, 180=南, 270=西
 */
function bearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * DEG2RAD;
  const y = Math.sin(dLon) * Math.cos(lat2 * DEG2RAD);
  const x = Math.cos(lat1 * DEG2RAD) * Math.sin(lat2 * DEG2RAD) -
    Math.sin(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.cos(dLon);
  return ((Math.atan2(y, x) * RAD2DEG) + 360) % 360;
}

/**
 * 点から線分への最短距離と最近接点
 * P: [lat, lon], A-B: 線分の両端 [lat, lon]
 * 返り値: { dist: メートル, point: [lat, lon], t: 0-1 }
 */
function pointToSegment(P, A, B) {
  // 平面近似（緯度が近いので十分）
  const cosLat = Math.cos(P[0] * DEG2RAD);
  const px = (P[1] - A[1]) * cosLat;
  const py = P[0] - A[0];
  const bx = (B[1] - A[1]) * cosLat;
  const by = B[0] - A[0];

  const dot = px * bx + py * by;
  const lenSq = bx * bx + by * by;
  let t = lenSq > 0 ? dot / lenSq : 0;
  t = Math.max(0, Math.min(1, t));

  const closestLat = A[0] + t * (B[0] - A[0]);
  const closestLon = A[1] + t * (B[1] - A[1]);
  const dist = haversine(P[0], P[1], closestLat, closestLon);

  return { dist, point: [closestLat, closestLon], t };
}

/**
 * 指定座標から一定距離の座標を返す（方位角指定）
 */
function destPoint(lat, lon, bearingDeg, distM) {
  const brng = bearingDeg * DEG2RAD;
  const d = distM / EARTH_R;
  const lat1 = lat * DEG2RAD;
  const lon1 = lon * DEG2RAD;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [lat2 * RAD2DEG, lon2 * RAD2DEG];
}

// ============================================================
// Overpass API 海岸線取得
// ============================================================

/**
 * Overpass QLクエリ生成
 */
function buildCoastlineQuery(bbox) {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:120];
(
  way["natural"="coastline"](${s},${w},${n},${e});
);
out body;
>;
out skel qt;
  `.trim();
}

/**
 * 防波堤・埠頭も取得（shelter計算に使用）
 */
function buildStructureQuery(bbox) {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:120];
(
  way["man_made"="breakwater"](${s},${w},${n},${e});
  way["man_made"="groyne"](${s},${w},${n},${e});
  way["man_made"="pier"](${s},${w},${n},${e});
  way["waterway"="dam"](${s},${w},${n},${e});
);
out body;
>;
out skel qt;
  `.trim();
}

/**
 * Overpass APIからデータ取得
 */
async function fetchOverpass(query) {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass API error: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Overpass JSONからway座標リストを構築
 * 返り値: [[lat, lon], [lat, lon], ...][] (way毎の座標配列の配列)
 */
function parseWays(data) {
  const nodes = {};
  for (const el of data.elements) {
    if (el.type === 'node') {
      nodes[el.id] = [el.lat, el.lon];
    }
  }
  const ways = [];
  for (const el of data.elements) {
    if (el.type === 'way' && el.nodes) {
      const coords = el.nodes.map(nid => nodes[nid]).filter(Boolean);
      if (coords.length >= 2) ways.push(coords);
    }
  }
  return ways;
}

// ============================================================
// Facing計算
// ============================================================

/**
 * スポットの最寄り海岸線セグメントを見つけ、facingを計算
 * 
 * OSMルール: 海岸線wayの進行方向に対して左=陸、右=海
 * → 進行方向の右90度回転（時計回り） = 海に向かう方向 = facing
 * 
 * @param {[number, number]} spot - [lat, lon]
 * @param {Array<Array<[number, number]>>} coastlines - 海岸線wayの配列
 * @returns {{ facing: number, dist: number, segment: object }}
 */
function calcFacing(spot, coastlines) {
  let minDist = Infinity;
  let bestSegA = null;
  let bestSegB = null;

  // 最寄りの海岸線セグメントを探索
  for (const way of coastlines) {
    for (let i = 0; i < way.length - 1; i++) {
      const A = way[i];
      const B = way[i + 1];
      const result = pointToSegment(spot, A, B);
      if (result.dist < minDist) {
        minDist = result.dist;
        bestSegA = A;
        bestSegB = B;
      }
    }
  }

  if (!bestSegA) return { facing: 0, dist: Infinity, segment: null };

  // 海岸線セグメントの進行方向（A→B）
  const segBearing = bearing(bestSegA[0], bestSegA[1], bestSegB[0], bestSegB[1]);

  // OSMルール: 進行方向の右90度 = 海方向 = facing
  const facingDeg = (segBearing + 90) % 360;

  return {
    facing: Math.round(facingDeg),
    dist: Math.round(minDist),
    segment: { A: bestSegA, B: bestSegB },
  };
}

/**
 * 複数の近傍セグメントの加重平均でfacingを算出（より安定）
 * 半径200m以内のセグメントの加重平均を使用
 */
function calcFacingWeighted(spot, coastlines, radiusM = 200) {
  const segments = [];

  for (const way of coastlines) {
    for (let i = 0; i < way.length - 1; i++) {
      const A = way[i];
      const B = way[i + 1];
      const result = pointToSegment(spot, A, B);
      if (result.dist <= radiusM) {
        const segBearing = bearing(A[0], A[1], B[0], B[1]);
        const facingDeg = (segBearing + 90) % 360;
        const segLen = haversine(A[0], A[1], B[0], B[1]);
        segments.push({
          facing: facingDeg,
          dist: result.dist,
          length: segLen,
          weight: segLen / (result.dist + 10), // 距離の逆数×長さ
        });
      }
    }
  }

  if (segments.length === 0) {
    // radiusM内にセグメントがない → 最寄り1本で計算
    return calcFacing(spot, coastlines);
  }

  // 角度の加重円平均（circular mean）
  let sinSum = 0, cosSum = 0;
  for (const seg of segments) {
    sinSum += seg.weight * Math.sin(seg.facing * DEG2RAD);
    cosSum += seg.weight * Math.cos(seg.facing * DEG2RAD);
  }
  const avgFacing = ((Math.atan2(sinSum, cosSum) * RAD2DEG) + 360) % 360;

  // 最寄り距離
  const minDist = Math.min(...segments.map(s => s.dist));

  return {
    facing: Math.round(avgFacing),
    dist: Math.round(minDist),
    segmentCount: segments.length,
  };
}

// ============================================================
// Shelter計算
// ============================================================

/**
 * スポットの遮蔽度（shelter）を計算
 * 
 * 手法: スポットから全方位に「レイ」を放ち、海岸線/構造物に当たるかチェック
 *       当たるセクター数 / 全セクター数 = shelter
 * 
 * @param {[number, number]} spot - [lat, lon]
 * @param {Array<Array<[number, number]>>} coastlines - 海岸線way配列
 * @param {Array<Array<[number, number]>>} structures - 防波堤等の配列
 * @returns {{ shelter: number, blockedSectors: number[], openSectors: number[] }}
 */
function calcShelter(spot, coastlines, structures = []) {
  const { SEARCH_RADIUS_M, SECTOR_COUNT } = SHELTER_PARAMS;
  const sectorAngle = 360 / SECTOR_COUNT; // 30度

  // 全セグメント（海岸線+構造物）をまとめる
  const allSegments = [];
  for (const way of [...coastlines, ...structures]) {
    for (let i = 0; i < way.length - 1; i++) {
      const A = way[i];
      const B = way[i + 1];
      // 探索範囲内のセグメントのみ
      const midLat = (A[0] + B[0]) / 2;
      const midLon = (A[1] + B[1]) / 2;
      const dist = haversine(spot[0], spot[1], midLat, midLon);
      if (dist <= SEARCH_RADIUS_M * 1.5) {
        allSegments.push({ A, B });
      }
    }
  }

  const blockedSectors = [];
  const openSectors = [];

  for (let i = 0; i < SECTOR_COUNT; i++) {
    const sectorCenterDeg = i * sectorAngle + sectorAngle / 2;
    // スポットからsectorCenterDeg方向にSEARCH_RADIUS_M先の点
    const target = destPoint(spot[0], spot[1], sectorCenterDeg, SEARCH_RADIUS_M);

    let blocked = false;
    for (const seg of allSegments) {
      if (rayIntersectsSegment(spot, target, seg.A, seg.B)) {
        blocked = true;
        break;
      }
    }

    if (blocked) {
      blockedSectors.push(Math.round(sectorCenterDeg));
    } else {
      openSectors.push(Math.round(sectorCenterDeg));
    }
  }

  // shelter = 遮蔽されたセクター比率
  const shelter = blockedSectors.length / SECTOR_COUNT;

  return {
    shelter: Math.round(shelter * 100) / 100,
    blockedSectors,
    openSectors,
    details: `${blockedSectors.length}/${SECTOR_COUNT} sectors blocked`,
  };
}

/**
 * レイ（P→Q）が線分（A→B）と交差するかチェック
 * 2D平面近似
 */
function rayIntersectsSegment(P, Q, A, B) {
  const cosLat = Math.cos(P[0] * DEG2RAD);

  // 度をメートル相当のスケールに変換（相対的なので定数は不要）
  const px = (P[1] - P[1]) * cosLat;
  const py = P[0] - P[0];
  const qx = (Q[1] - P[1]) * cosLat;
  const qy = Q[0] - P[0];
  const ax = (A[1] - P[1]) * cosLat;
  const ay = A[0] - P[0];
  const bx = (B[1] - P[1]) * cosLat;
  const by = B[0] - P[0];

  // P=原点, D=Q-P, 線分=A+t*(B-A)
  const dx = qx; // qx - px = qx - 0
  const dy = qy;
  const ex = bx - ax;
  const ey = by - ay;

  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-12) return false;

  const t = (ax * (-dy) - ay * (-dx)) / denom;
  // 正しくは: t = (ax * dy - ay * dx) / ... を使う
  // クラメルの公式で再計算
  const t_seg = (ax * dy - ay * dx) / (dx * ey - dy * ex);
  const t_ray = (ax * ey - ay * ex) / (dx * ey - dy * ex);

  // t_seg: 0~1で線分上、t_ray: 0~1でレイ上
  return t_seg >= 0 && t_seg <= 1 && t_ray >= 0 && t_ray <= 1;
}

// ============================================================
// スポット種別の自動判定ヘルパー
// ============================================================

/**
 * スポット名から種別を推定
 */
function guessSpotType(name) {
  if (/漁港|港/.test(name)) return 'port';
  if (/磯|岩場|岩礁/.test(name)) return 'rock';
  if (/浜|ビーチ|サーフ|海岸(?!.*公園)/.test(name)) return 'surf';
  if (/河口|川/.test(name)) return 'river';
  if (/波止|堤防|防波堤|一文字/.test(name)) return 'pier';
  if (/公園|パーク|施設|釣り堀|海づり|海釣り/.test(name)) return 'park';
  if (/崎|鼻|岬/.test(name)) return 'rock'; // 岬系は地磯扱い
  return 'rock'; // デフォルトは地磯
}

/**
 * スポット種別によるshelterの補正
 */
function adjustShelterByType(baseShelter, type) {
  switch (type) {
    case 'surf':
      // サーフは基本的にshelter低い
      return Math.min(baseShelter, 0.15);
    case 'rock':
      // 地磯も基本低い
      return Math.min(baseShelter, 0.25);
    case 'river':
      // 河口は中程度
      return Math.max(baseShelter, 0.3);
    case 'park':
      // 釣り公園は施設なので中〜高
      return Math.max(baseShelter, 0.4);
    case 'port':
      // 漁港は高め
      return Math.max(baseShelter, 0.4);
    case 'pier':
      // 独立波止は中程度
      return baseShelter; // そのまま
    default:
      return baseShelter;
  }
}

// ============================================================
// メイン処理
// ============================================================

async function processSpots(spots, areaName = 'all') {
  console.log(`\n=== Facing/Shelter計算開始 ===`);
  console.log(`対象スポット数: ${spots.length}`);
  console.log(`対象エリア: ${areaName}\n`);

  // 1. 対象エリアのbboxを決定
  let bbox;
  if (areaName === 'all') {
    // 全エリアのbboxを結合
    const allBoxes = Object.values(AREA_BBOX);
    bbox = [
      Math.min(...allBoxes.map(b => b[0])),
      Math.min(...allBoxes.map(b => b[1])),
      Math.max(...allBoxes.map(b => b[2])),
      Math.max(...allBoxes.map(b => b[3])),
    ];
  } else {
    bbox = AREA_BBOX[areaName];
    if (!bbox) throw new Error(`Unknown area: ${areaName}`);
  }

  console.log(`BBOX: [${bbox.join(', ')}]`);

  // 2. Overpass APIから海岸線取得
  console.log('\n[1/4] 海岸線データ取得中...');
  const coastQuery = buildCoastlineQuery(bbox);
  const coastData = await fetchOverpass(coastQuery);
  const coastlines = parseWays(coastData);
  console.log(`  → ${coastlines.length} ways, ${coastlines.reduce((s, w) => s + w.length, 0)} nodes`);

  // 3. 構造物（防波堤等）取得
  console.log('[2/4] 防波堤・構造物データ取得中...');
  const structQuery = buildStructureQuery(bbox);
  const structData = await fetchOverpass(structQuery);
  const structures = parseWays(structData);
  console.log(`  → ${structures.length} structures`);

  // 4. 各スポットのfacing/shelter計算
  console.log('[3/4] Facing/Shelter計算中...\n');
  const results = [];

  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    const name = spot.name;
    const lat = spot.lat;
    const lon = spot.lon;
    const type = spot.type || guessSpotType(name);

    process.stdout.write(`  [${i + 1}/${spots.length}] ${name} ... `);

    // facing計算（加重平均方式）
    const facingResult = calcFacingWeighted([lat, lon], coastlines);

    // shelter計算
    const shelterResult = calcShelter([lat, lon], coastlines, structures);

    // 種別による補正
    const adjustedShelter = adjustShelterByType(shelterResult.shelter, type);

    const entry = {
      name,
      lat,
      lon,
      type,
      facing: facingResult.facing,
      shelter: adjustedShelter,
      // デバッグ情報
      _debug: {
        rawFacing: facingResult.facing,
        coastlineDist: facingResult.dist,
        rawShelter: shelterResult.shelter,
        adjustedShelter,
        shelterDetail: shelterResult.details,
        blockedSectors: shelterResult.blockedSectors,
        openSectors: shelterResult.openSectors,
      },
      // 元データ引き継ぎ
      prefecture: spot.prefecture,
      city: spot.city,
      refPort: spot.refPort,
    };

    results.push(entry);
    console.log(`facing=${entry.facing}° shelter=${entry.shelter} (${shelterResult.details})`);
  }

  return results;
}

// ============================================================
// 出力フォーマット
// ============================================================

/**
 * ports-data.js形式の配列エントリに変換
 */
function toPortsDataEntry(r) {
  return [
    r.name,       // [0] スポット名
    r.lat,        // [1] 緯度
    r.lon,        // [2] 経度
    r.refPort,    // [3] 基準港キー
    r.prefecture, // [4] 都道府県
    r.city,       // [5] 市町村
    r.type,       // [6] 種別
    null,         // [7] 予備
    null,         // [8] 予備
    null,         // [9] 予備
    r.facing,     // [10] facing
    r.shelter,    // [11] shelter
  ];
}

/**
 * 結果出力
 */
function outputResults(results, outputPath) {
  // 1. JSON出力（デバッグ情報付き）
  const jsonPath = outputPath.replace(/\.\w+$/, '.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nJSON出力: ${jsonPath}`);

  // 2. ports-data.js追加用コード出力
  const jsPath = outputPath.replace(/\.\w+$/, '-ports-data-append.js');
  const entries = results.map(r => {
    const arr = toPortsDataEntry(r);
    return `  ${JSON.stringify(arr)},`;
  });
  const jsCode = `// Auto-generated: calc-facing-shelter.js
// ${new Date().toISOString()}
// 以下をports-data.jsのWAKAYAMA_PORTS等の配列に追加

const NEW_SPOTS = [
${entries.join('\n')}
];
`;
  fs.writeFileSync(jsPath, jsCode, 'utf-8');
  console.log(`ports-data.js追加用: ${jsPath}`);

  // 3. レビュー用CSVも出力
  const csvPath = outputPath.replace(/\.\w+$/, '-review.csv');
  const header = 'name,lat,lon,type,facing,shelter,coastline_dist,raw_shelter,blocked_sectors,prefecture,city,refPort';
  const rows = results.map(r =>
    `"${r.name}",${r.lat},${r.lon},${r.type},${r.facing},${r.shelter},${r._debug.coastlineDist},${r._debug.rawShelter},"${r._debug.shelterDetail}","${r.prefecture}","${r.city}","${r.refPort}"`
  );
  fs.writeFileSync(csvPath, header + '\n' + rows.join('\n'), 'utf-8');
  console.log(`レビュー用CSV: ${csvPath}`);
}

// ============================================================
// サンプル入力（テスト用 / 釣り広場スポットの一部）
// ============================================================

const SAMPLE_SPOTS = [
  // 和歌山 - 地磯
  { name: '天神崎', lat: 33.7258, lon: 135.3753, prefecture: '和歌山', city: '田辺市', refPort: 'shirahama', type: 'rock' },
  { name: '潮岬', lat: 33.4372, lon: 135.7547, prefecture: '和歌山', city: '串本町', refPort: 'kushimoto', type: 'rock' },
  { name: '番所庭園の磯', lat: 34.1901, lon: 135.0931, prefecture: '和歌山', city: '和歌山市', refPort: 'wakayama', type: 'rock' },

  // 和歌山 - サーフ
  { name: '煙樹ヶ浜', lat: 33.8733, lon: 135.1333, prefecture: '和歌山', city: '美浜町', refPort: 'gobo', type: 'surf' },
  { name: '磯ノ浦', lat: 34.2697, lon: 135.1078, prefecture: '和歌山', city: '和歌山市', refPort: 'wakayama', type: 'surf' },
  { name: '千里浜', lat: 33.7450, lon: 135.2975, prefecture: '和歌山', city: 'みなべ町', refPort: 'tanabe', type: 'surf' },

  // 和歌山 - 河口
  { name: '紀の川河口', lat: 34.2342, lon: 135.1467, prefecture: '和歌山', city: '和歌山市', refPort: 'wakayama', type: 'river' },
  { name: '日高川河口', lat: 33.8814, lon: 135.1550, prefecture: '和歌山', city: '御坊市', refPort: 'gobo', type: 'river' },

  // 和歌山 - 波止
  { name: '小浦一文字', lat: 33.9336, lon: 135.0839, prefecture: '和歌山', city: '日高町', refPort: 'gobo', type: 'pier' },
  { name: '青岸', lat: 34.2280, lon: 135.1372, prefecture: '和歌山', city: '和歌山市', refPort: 'wakayama', type: 'pier' },

  // 和歌山 - 釣り公園
  { name: '和歌山マリーナシティ海釣り公園', lat: 34.1575, lon: 135.1575, prefecture: '和歌山', city: '和歌山市', refPort: 'wakayama', type: 'park' },
  { name: '由良海つり公園', lat: 33.9586, lon: 135.0800, prefecture: '和歌山', city: '由良町', refPort: 'gobo', type: 'park' },

  // 大阪 - 波止
  { name: 'とっとパーク小島', lat: 34.3175, lon: 135.1428, prefecture: '大阪', city: '岬町', refPort: 'osaka', type: 'park' },
  { name: '大阪南港魚つり園', lat: 34.6222, lon: 135.4150, prefecture: '大阪', city: '大阪市', refPort: 'osaka', type: 'park' },

  // 京都 - 地磯
  { name: '経ヶ岬', lat: 35.7833, lon: 135.2547, prefecture: '京都', city: '京丹後市', refPort: 'maizuru', type: 'rock' },
  { name: '城島', lat: 35.5622, lon: 135.1997, prefecture: '京都', city: '舞鶴市', refPort: 'maizuru', type: 'rock' },

  // 兵庫
  { name: 'アジュール舞子', lat: 34.6250, lon: 135.0264, prefecture: '兵庫', city: '神戸市', refPort: 'kobe', type: 'park' },
  { name: '平磯海づり公園', lat: 34.6431, lon: 135.0053, prefecture: '兵庫', city: '神戸市', refPort: 'kobe', type: 'park' },
  { name: '須磨浦海釣り公園', lat: 34.6347, lon: 135.1036, prefecture: '兵庫', city: '神戸市', refPort: 'kobe', type: 'park' },
];

// ============================================================
// CLI
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  let area = 'all';
  let spotsFile = null;
  let outputFile = './facing-shelter-output.json';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--area' && args[i + 1]) {
      area = args[i + 1];
      i++;
    } else if (args[i] === '--spots' && args[i + 1]) {
      spotsFile = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputFile = args[i + 1];
      i++;
    } else if (args[i] === '--sample') {
      spotsFile = '__sample__';
    } else if (args[i] === '--help') {
      console.log(`
Usage: node calc-facing-shelter.js [options]

Options:
  --area <name>    エリア指定 (wakayama|osaka|kyoto|hyogo|all)
  --spots <file>   入力JSONファイル（[{name,lat,lon,type?,prefecture?,city?,refPort?}]）
  --output <file>  出力ファイルパス（.json拡張子）
  --sample         サンプルデータでテスト実行
  --help           ヘルプ表示
      `);
      process.exit(0);
    }
  }

  let spots;
  if (spotsFile === '__sample__') {
    spots = SAMPLE_SPOTS;
    console.log('サンプルスポットを使用');
  } else if (spotsFile) {
    spots = JSON.parse(fs.readFileSync(spotsFile, 'utf-8'));
    console.log(`入力ファイル: ${spotsFile}`);
  } else {
    spots = SAMPLE_SPOTS;
    console.log('入力ファイル未指定 → サンプルスポットを使用');
  }

  try {
    const results = await processSpots(spots, area);

    // 出力
    outputResults(results, outputFile);

    // サマリー
    console.log(`\n=== 完了 ===`);
    console.log(`計算済みスポット: ${results.length}`);
    console.log(`\n種別分布:`);
    const typeCounts = {};
    for (const r of results) {
      typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
    }
    for (const [t, c] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${t}: ${c}`);
    }

    console.log(`\nShelter分布:`);
    const shelterBuckets = { '0.0-0.2': 0, '0.2-0.4': 0, '0.4-0.6': 0, '0.6-0.8': 0, '0.8-1.0': 0 };
    for (const r of results) {
      if (r.shelter < 0.2) shelterBuckets['0.0-0.2']++;
      else if (r.shelter < 0.4) shelterBuckets['0.2-0.4']++;
      else if (r.shelter < 0.6) shelterBuckets['0.4-0.6']++;
      else if (r.shelter < 0.8) shelterBuckets['0.6-0.8']++;
      else shelterBuckets['0.8-1.0']++;
    }
    for (const [range, count] of Object.entries(shelterBuckets)) {
      const bar = '█'.repeat(count);
      console.log(`  ${range}: ${bar} ${count}`);
    }

  } catch (err) {
    console.error('\nエラー:', err.message);
    if (err.message.includes('fetch')) {
      console.error('\nOverpass APIへの接続に失敗しました。');
      console.error('Claude Code等のネットワーク有効な環境で実行してください。');
    }
    process.exit(1);
  }
}

main();
