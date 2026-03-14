#!/usr/bin/env node
/**
 * scrape-turihiroba.js
 * 
 * 釣り広場.com から和歌山・大阪・京都・兵庫の全釣りスポットを収集
 * → calc-facing-shelter.js の入力JSONを生成
 * 
 * 使い方:
 *   node scrape-turihiroba.js
 *   → spots-all.json を出力
 * 
 * 依存: cheerio (npm install cheerio)
 */

const fs = require('fs');

// cheerioが無い場合のフォールバック用正規表現パーサーも用意
let cheerio;
try {
  cheerio = require('cheerio');
} catch {
  console.log('cheerio not found, using regex parser');
}

// ============================================================
// 設定
// ============================================================

const BASE_URL = 'https://turihiroba.com';

// 県別トップページ
const AREA_PAGES = {
  和歌山: '/zzzwakayama.html',
  大阪:   '/zzzoosaka.html',
  京都:   '/zzzkyouto.html',
  兵庫:   '/zzzhyougo.html',
};

// 基準港マッピング用の緯度経度範囲
const REF_PORT_ZONES = {
  // 和歌山
  wakayama:  { latRange: [34.10, 34.40], lonRange: [135.05, 135.25] },
  kainan:    { latRange: [34.05, 34.15], lonRange: [135.15, 135.30] },
  arida:     { latRange: [33.95, 34.10], lonRange: [135.05, 135.20] },
  yura:      { latRange: [33.90, 34.00], lonRange: [135.00, 135.15] },
  gobo:      { latRange: [33.80, 33.95], lonRange: [135.05, 135.25] },
  minabe:    { latRange: [33.70, 33.83], lonRange: [135.15, 135.40] },
  tanabe:    { latRange: [33.68, 33.78], lonRange: [135.30, 135.45] },
  shirahama: { latRange: [33.58, 33.72], lonRange: [135.30, 135.50] },
  susami:    { latRange: [33.48, 33.62], lonRange: [135.45, 135.65] },
  kushimoto: { latRange: [33.42, 33.55], lonRange: [135.60, 135.85] },
  koza:      { latRange: [33.50, 33.65], lonRange: [135.80, 136.00] },
  taiji:     { latRange: [33.55, 33.65], lonRange: [135.90, 136.00] },
  nachikatsuura: { latRange: [33.58, 33.68], lonRange: [135.92, 136.05] },
  shingu:    { latRange: [33.68, 33.80], lonRange: [135.95, 136.10] },
  // 大阪
  osaka:     { latRange: [34.30, 34.85], lonRange: [135.05, 135.55] },
  // 京都
  maizuru:   { latRange: [35.40, 35.90], lonRange: [134.80, 135.50] },
  // 兵庫
  kobe:      { latRange: [34.55, 34.75], lonRange: [134.90, 135.35] },
  akashi:    { latRange: [34.60, 34.70], lonRange: [134.90, 135.05] },
  himeji:    { latRange: [34.70, 34.85], lonRange: [134.55, 134.80] },
  // 兵庫日本海側
  toyooka:   { latRange: [35.50, 35.75], lonRange: [134.60, 135.00] },
};

// スポット名 → 緯度経度の既知マッピング（主要スポット）
// 未知のスポットはGeocoding APIまたは手動設定
const KNOWN_COORDS = {
  // 和歌山 - 地磯・岬
  '天神崎': [33.7258, 135.3753],
  '潮岬': [33.4372, 135.7547],
  '番所庭園': [34.1901, 135.0931],
  '日ノ御埼': [33.8914, 135.0614],
  '黒島': [33.5372, 135.5856],
  '双子島': [33.4508, 135.7211],
  '橋杭岩': [33.4694, 135.7894],
  '地ノ島': [34.0556, 135.0775],

  // 和歌山 - サーフ
  '煙樹ヶ浜': [33.8733, 135.1333],
  '磯ノ浦': [34.2697, 135.1078],
  '千里浜': [33.7450, 135.2975],
  '白良浜': [33.6753, 135.3406],
  '浪早ビーチ': [34.1800, 135.1200],
  '片男波': [34.1850, 135.1650],
  '臨海浦': [33.6614, 135.3389],
  '切目浜': [33.8006, 135.2100],

  // 和歌山 - 河口
  '紀の川河口': [34.2342, 135.1467],
  '日高川河口': [33.8814, 135.1550],
  '有田川河口': [34.0636, 135.1278],
  '富田川河口': [33.6892, 135.3753],
  '日置川河口': [33.5958, 135.4450],
  '古座川河口': [33.5250, 135.8239],
  '太田川河口': [33.6442, 135.3931],

  // 和歌山 - 波止・堤防
  '青岸': [34.2280, 135.1372],
  '小浦一文字': [33.9336, 135.0839],
  '加太大波止': [34.2708, 135.0700],

  // 和歌山 - 釣り公園
  '和歌山マリーナシティ海釣り公園': [34.1575, 135.1575],
  '由良海つり公園': [33.9586, 135.0800],
  '下津ピアーランド': [34.1003, 135.1750],
  '和歌山北港魚つり公園': [34.2400, 135.1300],

  // 大阪
  'とっとパーク小島': [34.3175, 135.1428],
  '大阪南港魚つり園': [34.6222, 135.4150],
  'りんくう公園': [34.4133, 135.2897],
  '汐見埠頭': [34.5567, 135.4278],
  '貝塚人工島': [34.4347, 135.3400],
  '岸和田一文字': [34.4594, 135.3561],
  'シーサイドコスモ': [34.6497, 135.4100],
  '舞洲': [34.6650, 135.4000],

  // 京都
  '経ヶ岬': [35.7833, 135.2547],
  '城島': [35.5622, 135.1997],
  '間人漁港': [35.7483, 135.1814],
  '浅茂川漁港': [35.7256, 135.0611],

  // 兵庫
  'アジュール舞子': [34.6250, 135.0264],
  '平磯海づり公園': [34.6431, 135.0053],
  '須磨浦海釣り公園': [34.6347, 135.1036],
  '神戸空港親水護岸': [34.6303, 135.2256],
  '西宮ケーソン': [34.7125, 135.3297],
  '南芦屋浜': [34.7111, 135.3128],
  '明石港': [34.6453, 134.9867],
  '林崎漁港': [34.6428, 134.9653],
};

// ============================================================
// HTML取得 & パース
// ============================================================

async function fetchPage(url) {
  console.log(`  Fetching: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  // Shift-JIS対応
  const buffer = await res.arrayBuffer();
  // まずUTF-8で試す
  let html = new TextDecoder('utf-8').decode(buffer);
  // 文字化け判定
  if (html.includes('Ã') || html.includes('ï¿½')) {
    try {
      html = new TextDecoder('shift_jis').decode(buffer);
    } catch {
      // shift_jis非対応なら eucjp
      try { html = new TextDecoder('euc-jp').decode(buffer); } catch {}
    }
  }
  return html;
}

/**
 * 県別トップページからサブエリアのリンクを取得
 */
function parseAreaPage(html) {
  const links = [];
  // turihiroba.com のリンクパターン: <a href="turiba7/xxx.html">
  const regex = /href="(turiba\d+\/[^"]+\.html)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    if (!links.includes(href)) links.push(href);
  }
  return links;
}

/**
 * サブエリアページからスポット名と市町村を取得
 */
function parseSubAreaPage(html, prefecture) {
  const spots = [];

  if (cheerio) {
    const $ = cheerio.load(html);
    // turihiroba.com の典型的な構造を解析
    // h2/h3がスポット名、その付近にテキストで説明
    $('h2, h3').each((_, el) => {
      const name = $(el).text().trim();
      if (name && name.length > 1 && name.length < 30) {
        // 「○○の釣り場」パターンから地名抽出
        const cleanName = name.replace(/の釣り場.*/, '').replace(/釣り場ポイント.*/, '').trim();
        if (cleanName) spots.push({ name: cleanName });
      }
    });
  } else {
    // cheerio無し：正規表現でパース
    // h2/h3タグ内のテキストを取得
    const hRegex = /<h[23][^>]*>([^<]+)<\/h[23]>/g;
    let match;
    while ((match = hRegex.exec(html)) !== null) {
      const name = match[1].trim()
        .replace(/の釣り場.*/, '').replace(/釣り場ポイント.*/, '').trim();
      if (name && name.length > 1 && name.length < 30) {
        spots.push({ name });
      }
    }
  }

  return spots;
}

/**
 * Google Maps埋め込みからスポット座標を抽出
 */
function extractCoordsFromPage(html) {
  const coords = {};
  // Google Maps embed: center=LAT,LON or q=LAT,LON or ll=LAT,LON
  const patterns = [
    /center=([0-9.]+),([0-9.]+)/g,
    /q=([0-9.]+),([0-9.]+)/g,
    /ll=([0-9.]+),([0-9.]+)/g,
    /@([0-9.]+),([0-9.]+)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (lat > 33 && lat < 36 && lon > 134 && lon < 137) {
        return { lat, lon };
      }
    }
  }
  return null;
}

// ============================================================
// 基準港自動マッピング
// ============================================================

function findRefPort(lat, lon) {
  // 最寄りの基準港ゾーンを見つける
  let bestPort = null;
  let bestDist = Infinity;

  for (const [portKey, zone] of Object.entries(REF_PORT_ZONES)) {
    const centerLat = (zone.latRange[0] + zone.latRange[1]) / 2;
    const centerLon = (zone.lonRange[0] + zone.lonRange[1]) / 2;
    const dist = Math.sqrt((lat - centerLat) ** 2 + (lon - centerLon) ** 2);
    if (dist < bestDist) {
      bestDist = dist;
      bestPort = portKey;
    }
  }

  return bestPort;
}

// ============================================================
// スポット種別推定
// ============================================================

function guessType(name) {
  if (/漁港|港(?!.*公園)/.test(name)) return 'port';
  if (/磯|岩場|岩礁|岩/.test(name) && !/海釣り|つり/.test(name)) return 'rock';
  if (/浜|ビーチ|サーフ|海岸(?!.*公園)/.test(name)) return 'surf';
  if (/河口|川(?!.*公園)/.test(name)) return 'river';
  if (/波止|堤防|防波堤|一文字|テトラ|埠頭|岸壁/.test(name)) return 'pier';
  if (/公園|パーク|施設|釣り堀|海づり|海釣り|ピアー|筏/.test(name)) return 'park';
  if (/崎|鼻|岬|島(?!.*漁港)/.test(name)) return 'rock';
  return 'rock'; // デフォルト
}

// ============================================================
// 市町村名推定（URLから）
// ============================================================

const CITY_MAP_WAKAYAMA = {
  wakayamawakayamasi: '和歌山市',
  wakayamakainansi: '海南市',
  wakayamaaridasi: '有田市',
  wakayamayuasatyou: '湯浅町',
  wakayamahirokawatyou: '広川町',
  wakayamayuratyou: '由良町',
  wakayamahidakatyou: '日高町',
  wakayamagobosi: '御坊市',
  wakayamainnamityou: '印南町',
  wakayamaminabetyou: 'みなべ町',
  wakayamatanabesi: '田辺市',
  wakayamasirahamatyou: '白浜町',
  wakayamasusamityou: 'すさみ町',
  wakayamakusimototyou: '串本町',
  wakayamakozagawatyou: '古座川町',
  wakayamanakatuurasi: '那智勝浦町',
  wakayamataijityou: '太地町',
  wakayamasingusi: '新宮市',
};

const CITY_MAP_OSAKA = {
  oosakamisakityou: '岬町',
  oosakahannannsi: '阪南市',
  oosakasennannsi: '泉南市',
  oosakatajirisi: '田尻町',
  oosakasensizukasi: '泉佐野市',
  oosakakaisizukasi: '貝塚市',
  oosakakisiwadassi: '岸和田市',
  oosakatakaisi: '高石市',
  oosakasakaisi: '堺市',
  oosakaosakasi: '大阪市',
};

// ============================================================
// メイン
// ============================================================

async function collectAllSpots() {
  const allSpots = [];

  for (const [prefecture, pagePath] of Object.entries(AREA_PAGES)) {
    console.log(`\n=== ${prefecture} ===`);

    try {
      // 1. 県別トップページ取得
      const topHtml = await fetchPage(BASE_URL + pagePath);

      // 2. サブエリアリンク取得
      const subLinks = parseAreaPage(topHtml);
      console.log(`  サブエリア: ${subLinks.length}ページ`);

      // 3. 各サブエリアのスポット取得
      for (const link of subLinks) {
        await sleep(1000); // レート制限
        try {
          const subHtml = await fetchPage(BASE_URL + '/' + link);
          const spots = parseSubAreaPage(subHtml, prefecture);

          // 市町村名推定
          const urlKey = link.replace('turiba7/', '').replace('.html', '');
          const cityMap = prefecture === '和歌山' ? CITY_MAP_WAKAYAMA :
                         prefecture === '大阪' ? CITY_MAP_OSAKA : {};
          const city = cityMap[urlKey] || '';

          // 座標取得
          const pageCords = extractCoordsFromPage(subHtml);

          for (const spot of spots) {
            // 既知座標があれば使用
            const known = KNOWN_COORDS[spot.name];
            const lat = known ? known[0] : (pageCords ? pageCords.lat : null);
            const lon = known ? known[1] : (pageCords ? pageCords.lon : null);
            const type = guessType(spot.name);
            const refPort = lat && lon ? findRefPort(lat, lon) : null;

            allSpots.push({
              name: spot.name,
              lat,
              lon,
              type,
              prefecture,
              city,
              refPort,
              source: 'turihiroba',
              needsCoords: !lat, // 座標未確定フラグ
            });
          }

          console.log(`    ${link}: ${spots.length}スポット`);
        } catch (err) {
          console.error(`    ${link}: ERROR - ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`  ${prefecture}: ERROR - ${err.message}`);
    }
  }

  return allSpots;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 座標未確定スポットをリストアップ
 */
function reportMissingCoords(spots) {
  const missing = spots.filter(s => s.needsCoords);
  if (missing.length === 0) {
    console.log('\n全スポットの座標が確定しています。');
    return;
  }

  console.log(`\n=== 座標未確定: ${missing.length}スポット ===`);
  console.log('以下のスポットは手動で座標を設定するか、Geocoding APIで取得してください:\n');

  for (const s of missing) {
    console.log(`  ${s.prefecture} ${s.city} : ${s.name} (${s.type})`);
  }

  // 座標未確定分のテンプレート出力
  const template = missing.map(s => ({
    name: s.name,
    lat: 'TODO',
    lon: 'TODO',
    type: s.type,
    prefecture: s.prefecture,
    city: s.city,
  }));

  fs.writeFileSync('./spots-needs-coords.json', JSON.stringify(template, null, 2));
  console.log('\nテンプレート出力: spots-needs-coords.json');
}

async function main() {
  console.log('釣り広場.com スポット収集スクリプト');
  console.log('='.repeat(50));

  const spots = await collectAllSpots();

  // 重複除去
  const unique = [];
  const seen = new Set();
  for (const s of spots) {
    const key = `${s.prefecture}:${s.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }

  console.log(`\n=== 収集結果 ===`);
  console.log(`総スポット: ${unique.length} (重複除去後)`);

  // 種別分布
  const typeCounts = {};
  for (const s of unique) typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  console.log('種別分布:');
  for (const [t, c] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: ${c}`);
  }

  // 県別分布
  const prefCounts = {};
  for (const s of unique) prefCounts[s.prefecture] = (prefCounts[s.prefecture] || 0) + 1;
  console.log('県別分布:');
  for (const [p, c] of Object.entries(prefCounts)) {
    console.log(`  ${p}: ${c}`);
  }

  // 出力
  fs.writeFileSync('./spots-all.json', JSON.stringify(unique, null, 2));
  console.log(`\n出力: spots-all.json`);

  // 座標確定済みのみ別途出力（すぐfacing計算に使える）
  const withCoords = unique.filter(s => !s.needsCoords);
  fs.writeFileSync('./spots-with-coords.json', JSON.stringify(withCoords, null, 2));
  console.log(`座標確定済み: spots-with-coords.json (${withCoords.length}件)`);

  // 座標未確定レポート
  reportMissingCoords(unique);
}

main().catch(console.error);
