// scrape-osaka-coords.js
// 大阪51スポットの正確な座標を tsuriba.info / 大阪湾の釣り.com / Google Maps検索からスクレイピング
// 出力: osaka-coords-scraped.csv

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const DELAY_MS = 1200;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ==================== 大阪湾の座標バウンディングボックス ====================
// 大阪湾の釣りスポットは全て以下の範囲内にある
const OSAKA_BOUNDS = {
  latMin: 34.27,  // 岬町あたり
  latMax: 34.72,  // 淀川河口あたり
  lonMin: 135.08, // 小島漁港あたり
  lonMax: 135.48  // 大阪港東側
};

function isValidOsakaCoord(lat, lon) {
  return lat >= OSAKA_BOUNDS.latMin && lat <= OSAKA_BOUNDS.latMax &&
         lon >= OSAKA_BOUNDS.lonMin && lon <= OSAKA_BOUNDS.lonMax;
}

// ==================== 対象スポット ====================
const TARGET_SPOTS = [
  '大阪港','堺泉北港','堺出島漁港','石津漁港','高石漁港','忠岡港','泉大津港',
  '岸和田漁港','貝塚港','佐野漁港','田尻漁港','岡田漁港','樽井漁港',
  '西鳥取漁港','下荘漁港','淡輪漁港','深日漁港','小島漁港',
  'かもめ大橋','シーサイドコスモ','舞洲','汐見埠頭','貝塚人工島',
  '岸和田一文字','忠岡一文字','助松埠頭','大浜埠頭','夢洲','咲洲',
  '泉佐野食品コンビナート','りんくう公園','岬公園','多奈川護岸',
  '平林貯木場','泉佐野旧港','岸和田旧港','大阪北港',
  '大阪南港魚つり園','とっとパーク小島',
  '淀川河口','大和川河口','石津川河口','大津川河口','近木川河口',
  '男里川河口','樫井川河口',
  'りんくうビーチ','二色の浜','淡輪ビーチ','箱作ビーチ','泉南マーブルビーチ'
];

// ==================== tsuriba.info ====================

// スポット名の表記揺れ対応マップ (tsuriba側名 → 自分側名)
const TSURIBA_ALIASES = {
  'かもめ大橋（大阪南港）': 'かもめ大橋',
  'かもめ大橋': 'かもめ大橋',
  'シーサイドコスモ（大阪南港）': 'シーサイドコスモ',
  'シーサイドコスモ': 'シーサイドコスモ',
  'とっとパーク': 'とっとパーク小島',
  'とっとパーク小島': 'とっとパーク小島',
  '舞洲シーサイドプロムナード': '舞洲',
  '舞洲（まいしま）': '舞洲',
  '汐見埠頭（泉大津）': '汐見埠頭',
  '汐見埠頭': '汐見埠頭',
  '助松埠頭（泉大津）': '助松埠頭',
  '助松埠頭': '助松埠頭',
  '助松ふ頭': '助松埠頭',
  '大浜埠頭（堺）': '大浜埠頭',
  '大浜埠頭': '大浜埠頭',
  '平林貯木場（大阪南港）': '平林貯木場',
  '平林貯木場': '平林貯木場',
  '大阪北港（舞洲）': '大阪北港',
  '大阪北港': '大阪北港',
  '大阪南港魚つり園護岸': '大阪南港魚つり園',
  '南港魚つり園': '大阪南港魚つり園',
  '南港魚つり園護岸': '大阪南港魚つり園',
  '大阪南港・魚つり園': '大阪南港魚つり園',
  '魚つり園護岸': '大阪南港魚つり園',
  '貝塚人工島（二色大橋）': '貝塚人工島',
  '貝塚人工島': '貝塚人工島',
  '泉佐野食品コンビナート（食コン）': '泉佐野食品コンビナート',
  '食品コンビナート': '泉佐野食品コンビナート',
  '食コン': '泉佐野食品コンビナート',
  'りんくう公園（泉佐野）': 'りんくう公園',
  'りんくう公園裏テトラ': 'りんくう公園',
  '泉佐野・りんくう公園裏テトラ': 'りんくう公園',
  '岬公園（みさき公園裏）': '岬公園',
  'みさき公園裏': '岬公園',
  '淀川河口（矢倉緑地）': '淀川河口',
  '大和川河口（堺）': '大和川河口',
  '二色の浜（貝塚）': '二色の浜',
  '泉南マーブルビーチ（りんくうタウン）': '泉南マーブルビーチ',
  'マーブルビーチ': '泉南マーブルビーチ',
  '箱作ビーチ（ぴちぴちビーチ）': '箱作ビーチ',
  'ぴちぴちビーチ': '箱作ビーチ',
  '淡輪ビーチ（ときめきビーチ）': '淡輪ビーチ',
  'ときめきビーチ': '淡輪ビーチ',
  '岸和田旧港（旧岸和田港）': '岸和田旧港',
  '岸和田旧港': '岸和田旧港',
  '旧岸和田港': '岸和田旧港',
  '咲洲（南港）': '咲洲',
  '夢洲（ゆめしま）': '夢洲',
  '堺泉北港（助松ふ頭）': '堺泉北港',
  '堺出島漁港（出島港）': '堺出島漁港',
  '出島漁港': '堺出島漁港',
  '深日港': '深日漁港',
  '深日漁港': '深日漁港',
  '泉佐野旧港（北中通漁港）': '泉佐野旧港',
  '北中通漁港': '泉佐野旧港',
  '多奈川護岸（多奈川地区）': '多奈川護岸',
  '多奈川': '多奈川護岸',
  '小島漁港（岬町）': '小島漁港',
  '忠岡旧港': '忠岡港',
  '岸和田一文字（旧一文字）': '岸和田一文字',
  '忠岡白灯': '忠岡一文字',
};

// スポット名からターゲット名にマッチ
function matchSpotName(tsuribaName) {
  if (TARGET_SPOTS.includes(tsuribaName)) return tsuribaName;
  if (TSURIBA_ALIASES[tsuribaName]) return TSURIBA_ALIASES[tsuribaName];
  // 括弧除去して再チェック
  const stripped = tsuribaName.replace(/[（(].+?[）)]/g, '').trim();
  if (TARGET_SPOTS.includes(stripped)) return stripped;
  if (TSURIBA_ALIASES[stripped]) return TSURIBA_ALIASES[stripped];
  // 部分一致
  for (const target of TARGET_SPOTS) {
    if (tsuribaName.includes(target)) return target;
    if (stripped.includes(target)) return target;
    if (target.includes(stripped) && stripped.length >= 3) return target;
  }
  return null;
}

async function fetchPage(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.9' },
    timeout: 15000
  });
  return res.data;
}

// tsuriba.info のスポット一覧ページから ID リストを取得
async function getTsuribaSpotList() {
  console.log('[tsuriba] スポット一覧ページを取得中...');
  const spots = [];

  for (let page = 1; page <= 5; page++) {
    const url = page === 1
      ? 'https://tsuriba.info/spotlist/25'
      : `https://tsuriba.info/spotlist/25?page=${page}`;

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
        if (name && id) {
          spots.push({ id, name, url: `https://tsuriba.info/spot/${id}` });
          found++;
        }
      });

      console.log(`  page ${page}: ${found} spots`);
      if (found === 0) break;
      await sleep(DELAY_MS);
    } catch (e) {
      console.log(`  page ${page}: エラー (${e.message})`);
      break;
    }
  }

  const seen = new Set();
  return spots.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

// tsuriba.info の個別スポットページから座標を取得
async function getTsuribaCoords(spotUrl) {
  const html = await fetchPage(spotUrl);

  // VIEW_SPOTS_PROFILE から座標抽出
  const match = html.match(/VIEW_SPOTS_PROFILE\s*=\s*(\{[\s\S]*?\});/);
  if (match) {
    try {
      const obj = JSON.parse(match[1]);
      if (obj.spot && obj.spot.x && obj.spot.y) {
        return { lat: obj.spot.y, lon: obj.spot.x };
      }
    } catch (e) { /* parse error */ }
  }

  // Google Maps iframe
  const $ = cheerio.load(html);
  const iframe = $('iframe[src*="google.com/maps"]').attr('src') || '';
  const iframeMatch = iframe.match(/q=([\d.]+),([\d.]+)/);
  if (iframeMatch) {
    return { lat: parseFloat(iframeMatch[1]), lon: parseFloat(iframeMatch[2]) };
  }

  return null;
}

// tsuriba.info をスポット名で個別検索 (スポット一覧にない場合)
async function searchTsuriba(spotName) {
  const url = `https://tsuriba.info/search?q=${encodeURIComponent(spotName)}&pref=25`;
  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);
    const firstLink = $('a[href*="/spot/"]').first();
    if (firstLink.length) {
      const href = firstLink.attr('href');
      const m = href.match(/\/spot\/(\d+)/);
      if (m) {
        const spotUrl = `https://tsuriba.info/spot/${m[1]}`;
        return spotUrl;
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

// ==================== 大阪湾の釣り.com ====================
const OSAKAWAN_DOMAIN = 'https://www.xn--u9jwc554om3rqo4bwmf.com';

// サイトマップまたはエントリ一覧からスポットURLを収集
async function getOsakawanEntryList() {
  const entries = new Map();
  try {
    // トップページやカテゴリページからエントリリンクを取得
    const html = await fetchPage(OSAKAWAN_DOMAIN);
    const $ = cheerio.load(html);
    $('a[href*="/entry/"]').each((_, el) => {
      const href = $(el).attr('href');
      const name = $(el).text().trim();
      if (href && name) {
        const fullUrl = href.startsWith('http') ? href : OSAKAWAN_DOMAIN + href;
        entries.set(name, fullUrl);
      }
    });
  } catch (e) { /* ignore */ }
  return entries;
}

// 個別エントリから座標取得
async function getOsakawanCoords(spotName) {
  // 複数の名前バリエーションで試行
  const variants = [spotName];
  if (spotName === '汐見埠頭') variants.push('汐見埠頭（泉大津）', '汐見公園');
  if (spotName === '助松埠頭') variants.push('助松埠頭（泉大津）', '助松ふ頭');
  if (spotName === 'かもめ大橋') variants.push('かもめ大橋（大阪南港）');
  if (spotName === '大阪北港') variants.push('大阪北港（舞洲）');
  if (spotName === '平林貯木場') variants.push('平林貯木場（大阪南港）');
  if (spotName === '大浜埠頭') variants.push('大浜埠頭（堺）');

  for (const name of variants) {
    const encodedName = encodeURIComponent(name);
    const url = `${OSAKAWAN_DOMAIN}/entry/${encodedName}`;

    try {
      const html = await fetchPage(url);
      const $ = cheerio.load(html);

      // Apple Maps リンクから住所抽出
      let address = null;
      $('a[href*="maps.apple.com"]').each((_, el) => {
        const href = $(el).attr('href');
        const qMatch = href.match(/q=([^&]+)/);
        if (qMatch) address = decodeURIComponent(qMatch[1]);
      });

      // Google Maps リンク / iframe から座標
      let coords = null;
      $('a[href*="google.com/maps"], a[href*="goo.gl/maps"]').each((_, el) => {
        const href = $(el).attr('href');
        const m = href.match(/@([\d.]+),([\d.]+)/);
        if (m) coords = { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
        const m2 = href.match(/q=([\d.]+),([\d.]+)/);
        if (m2) coords = { lat: parseFloat(m2[1]), lon: parseFloat(m2[2]) };
      });
      if (coords && isValidOsakaCoord(coords.lat, coords.lon)) {
        return { coords, source: url };
      }

      $('iframe[src*="google.com/maps"]').each((_, el) => {
        const src = $(el).attr('src') || '';
        const m = src.match(/q=([\d.]+),([\d.]+)/);
        if (m) coords = { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
        const m2 = src.match(/!2d([\d.]+)!3d([\d.]+)/);
        if (m2) coords = { lat: parseFloat(m2[2]), lon: parseFloat(m2[1]) };
      });
      if (coords && isValidOsakaCoord(coords.lat, coords.lon)) {
        return { coords, source: url };
      }

      // 住所 → Nominatim ジオコーディング
      if (address) {
        await sleep(DELAY_MS);
        const geo = await geocodeAddress(address);
        if (geo && isValidOsakaCoord(geo.lat, geo.lon)) {
          return { coords: geo, source: `${url} (address: ${address})` };
        }
      }
    } catch (e) { /* 404 or timeout, try next variant */ }
    await sleep(500);
  }
  return null;
}

// ==================== Nominatim ジオコーディング ====================
async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=jp&limit=1`;
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'TideGraphApp/1.0 (fishing spot research)' },
      timeout: 10000
    });
    if (res.data && res.data.length > 0) {
      return { lat: parseFloat(res.data[0].lat), lon: parseFloat(res.data[0].lon) };
    }
  } catch (e) { /* ignore */ }
  return null;
}

// ==================== Phase 3: t-port.com ====================
// t-port.com: 個別スポットページにGoogleMaps iframeが埋め込まれている

const TPORT_SLUGS = {
  'かもめ大橋': 'kamomeoohashi',
  'シーサイドコスモ': 'seasidecosmo',
  '舞洲': 'maishima',
  '汐見埠頭': 'shiomifutou',
  '助松埠頭': 'sukematsufutou',
  '大浜埠頭': 'oohamafutou',
  '夢洲': 'yumeshima',
  '咲洲': 'sakishima',
  '平林貯木場': 'hirabayashi',
  '大阪北港': 'osakahokkoo',
  '岸和田一文字': 'kishiwadaichimonji',
  '忠岡一文字': 'tadaokaichimonji',
  '大阪港': 'osakakou',
  '堺泉北港': 'sakaisen',
  '堺出島漁港': 'dejima',
  '石津漁港': 'ishidu',
  '高石漁港': 'takaishi',
  '忠岡港': 'tadaokakou',
  '泉大津港': 'izumiootsukou',
  '岸和田漁港': 'kishiwada',
  '貝塚港': 'kaizukakou',
  '佐野漁港': 'sanogyokou',
  '田尻漁港': 'tajiri',
  '岡田漁港': 'okada',
  '泉佐野旧港': 'izumisanokyuukou',
  '岸和田旧港': 'kishiwadakyuukou',
  '淀川河口': 'yodogawa',
  '大和川河口': 'yamatogawa',
  '石津川河口': 'ishizugawa',
  '大津川河口': 'ootsugawa',
  '近木川河口': 'kogigawa',
  '男里川河口': 'onosatogawa',
  '樫井川河口': 'kashiigawa',
  '多奈川護岸': 'tanagawa',
  '二色の浜': 'nishikinohama',
  'りんくうビーチ': 'rinkuubeach',
  '淡輪ビーチ': 'tannowa',
  '箱作ビーチ': 'hakosaku',
  '泉南マーブルビーチ': 'marblebeach',
  '貝塚人工島': 'kaizukajinkoutou',
  '泉佐野食品コンビナート': 'shokuhincombinato',
  'りんくう公園': 'rinkuukouen',
};

async function getTportCoords(spotName) {
  const slug = TPORT_SLUGS[spotName];
  if (!slug) return null;

  const url = `https://t-port.com/map/${slug}/`;
  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    // Google Maps iframe: !2d[lon]!3d[lat] or q=lat,lon
    let coords = null;
    $('iframe[src*="google.com/maps"]').each((_, el) => {
      const src = $(el).attr('src') || '';
      // embed format: !2d135.xxx!3d34.xxx
      const m = src.match(/!2d([\d.]+)!3d([\d.]+)/);
      if (m) {
        coords = { lat: parseFloat(m[2]), lon: parseFloat(m[1]) };
      }
      const m2 = src.match(/q=([\d.]+),([\d.]+)/);
      if (m2) {
        coords = { lat: parseFloat(m2[1]), lon: parseFloat(m2[2]) };
      }
    });

    // Google Mapsのリンク
    if (!coords) {
      $('a[href*="google.com/maps"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/@([\d.]+),([\d.]+)/);
        if (m) coords = { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
        const m2 = href.match(/q=([\d.]+),([\d.]+)/);
        if (m2) coords = { lat: parseFloat(m2[1]), lon: parseFloat(m2[2]) };
      });
    }

    // ページ内のJSON-LDやmicrodata
    if (!coords) {
      const latMatch = html.match(/"latitude"\s*:\s*([\d.]+)/);
      const lonMatch = html.match(/"longitude"\s*:\s*([\d.]+)/);
      if (latMatch && lonMatch) {
        coords = { lat: parseFloat(latMatch[1]), lon: parseFloat(lonMatch[1]) };
      }
    }

    if (coords && isValidOsakaCoord(coords.lat, coords.lon)) {
      return { coords, source: url };
    }
  } catch (e) { /* 404 */ }
  return null;
}

// ==================== メイン処理 ====================
async function main() {
  console.log('=== 大阪スポット座標スクレイピング ===\n');

  const results = new Map(); // spotName → { lat, lon, source }

  // ---- Phase 1: tsuriba.info (スポット一覧 + 個別検索) ----
  console.log('--- Phase 1: tsuriba.info ---');
  const tsuribaSpots = await getTsuribaSpotList();
  console.log(`  一覧から ${tsuribaSpots.length} スポット取得\n`);

  // ログ: 一覧で見つかった全スポット名
  console.log('  一覧のスポット名:');
  for (const ts of tsuribaSpots) {
    const target = matchSpotName(ts.name);
    console.log(`    ${ts.name} (id=${ts.id}) → ${target || '(マッチなし)'}`);
  }
  console.log();

  // マッチしたスポットの座標取得
  const matched = [];
  const matchedSet = new Set();
  for (const ts of tsuribaSpots) {
    const target = matchSpotName(ts.name);
    if (target && !matchedSet.has(target)) {
      matched.push({ target, id: ts.id, url: ts.url, tsuribaName: ts.name });
      matchedSet.add(target);
    }
  }

  for (const m of matched) {
    console.log(`  [tsuriba] ${m.target} (${m.tsuribaName}, id=${m.id})...`);
    try {
      const coords = await getTsuribaCoords(m.url);
      if (coords && isValidOsakaCoord(coords.lat, coords.lon)) {
        results.set(m.target, { lat: coords.lat, lon: coords.lon, source: m.url });
        console.log(`    → ${coords.lat}, ${coords.lon} ✓`);
      } else if (coords) {
        console.log(`    → ${coords.lat}, ${coords.lon} ✗ (大阪湾外)`);
      } else {
        console.log(`    → 座標なし`);
      }
    } catch (e) {
      console.log(`    → エラー: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  // 未取得のスポットを tsuriba.info で検索
  let remaining1 = TARGET_SPOTS.filter(t => !results.has(t));
  if (remaining1.length > 0) {
    console.log(`\n  tsuriba.info 検索で追加取得 (残り ${remaining1.length})...`);
    for (const name of remaining1) {
      console.log(`  [tsuriba-search] ${name}...`);
      try {
        const spotUrl = await searchTsuriba(name);
        if (spotUrl) {
          await sleep(DELAY_MS);
          const coords = await getTsuribaCoords(spotUrl);
          if (coords && isValidOsakaCoord(coords.lat, coords.lon)) {
            results.set(name, { lat: coords.lat, lon: coords.lon, source: spotUrl });
            console.log(`    → ${coords.lat}, ${coords.lon} ✓`);
          } else if (coords) {
            console.log(`    → ${coords.lat}, ${coords.lon} ✗ (大阪湾外)`);
          } else {
            console.log(`    → 座標なし`);
          }
        } else {
          console.log(`    → 検索結果なし`);
        }
      } catch (e) {
        console.log(`    → エラー: ${e.message}`);
      }
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n  Phase 1 完了: ${results.size} / ${TARGET_SPOTS.length} 取得\n`);

  // ---- Phase 2: 大阪湾の釣り.com ----
  const remaining2 = TARGET_SPOTS.filter(t => !results.has(t));
  if (remaining2.length > 0) {
    console.log(`--- Phase 2: 大阪湾の釣り.com (残り ${remaining2.length} スポット) ---`);
    for (const name of remaining2) {
      console.log(`  [osakawan] ${name}...`);
      try {
        const result = await getOsakawanCoords(name);
        if (result && result.coords) {
          const { lat, lon } = result.coords;
          results.set(name, { lat, lon, source: result.source });
          console.log(`    → ${lat}, ${lon} ✓`);
        } else {
          console.log(`    → 取得失敗`);
        }
      } catch (e) {
        console.log(`    → エラー: ${e.message}`);
      }
      await sleep(DELAY_MS);
    }
    console.log(`\n  Phase 2 完了: ${results.size} / ${TARGET_SPOTS.length} 取得\n`);
  }

  // ---- Phase 3: t-port.com ----
  const remaining3 = TARGET_SPOTS.filter(t => !results.has(t));
  if (remaining3.length > 0) {
    console.log(`--- Phase 3: t-port.com (残り ${remaining3.length} スポット) ---`);
    for (const name of remaining3) {
      if (!TPORT_SLUGS[name]) {
        console.log(`  [t-port] ${name}... スラッグなし`);
        continue;
      }
      console.log(`  [t-port] ${name}...`);
      try {
        const result = await getTportCoords(name);
        if (result && result.coords) {
          const { lat, lon } = result.coords;
          results.set(name, { lat, lon, source: result.source });
          console.log(`    → ${lat}, ${lon} ✓`);
        } else {
          console.log(`    → 取得失敗`);
        }
      } catch (e) {
        console.log(`    → エラー: ${e.message}`);
      }
      await sleep(DELAY_MS);
    }
    console.log(`\n  Phase 3 完了: ${results.size} / ${TARGET_SPOTS.length} 取得\n`);
  }

  // ---- Phase 4: Nominatim (住所で検索) ----
  // Nominatimは釣り場名では精度が低いので、住所付きで検索
  const NOMINATIM_QUERIES = {
    '大阪港': '大阪市港区 天保山 波止場',
    '堺泉北港': '堺市堺区 堺泉北港',
    '堺出島漁港': '堺市堺区 出島漁港',
    '石津漁港': '堺市西区 浜寺石津町 漁港',
    '高石漁港': '高石市 高砂 漁港',
    '忠岡港': '忠岡町 忠岡港',
    '泉大津港': '泉大津市 汐見町 港',
    '岸和田漁港': '岸和田市 地蔵浜町 漁港',
    '貝塚港': '貝塚市 港 二色南町',
    '佐野漁港': '泉佐野市 新町 佐野漁港',
    '田尻漁港': '田尻町 りんくうポート北',
    '岡田漁港': '泉南市 岡田 漁港',
    'かもめ大橋': '大阪市住之江区 南港南 かもめ大橋',
    'シーサイドコスモ': '大阪市住之江区 南港北 シーサイドコスモ',
    '舞洲': '大阪市此花区 北港緑地 舞洲',
    '汐見埠頭': '泉大津市 汐見町 埠頭',
    '岸和田一文字': '岸和田市 地蔵浜町 一文字',
    '忠岡一文字': '忠岡町 忠岡 一文字',
    '助松埠頭': '泉大津市 小津島町 助松埠頭',
    '大浜埠頭': '堺市堺区 大浜北町 埠頭',
    '夢洲': '大阪市此花区 夢洲',
    '咲洲': '大阪市住之江区 南港中 咲洲',
    '多奈川護岸': '岬町 多奈川谷川 護岸',
    '平林貯木場': '大阪市住之江区 平林南 貯木場',
    '泉佐野旧港': '泉佐野市 新町 旧港',
    '岸和田旧港': '岸和田市 港緑町 旧港',
    '大阪北港': '大阪市此花区 常吉 北港',
    '淀川河口': '大阪市西淀川区 矢倉緑地 淀川河口',
    '大和川河口': '堺市堺区 匠町 大和川河口',
    '石津川河口': '堺市西区 石津川河口',
    '大津川河口': '泉大津市 大津川河口',
    '近木川河口': '貝塚市 近木川河口',
    '男里川河口': '泉南市 男里川河口',
    '樫井川河口': '泉佐野市 樫井川河口',
    'りんくうビーチ': '田尻町 りんくうビーチ',
    '二色の浜': '貝塚市 二色の浜 海水浴場',
    '淡輪ビーチ': '岬町 淡輪 ときめきビーチ',
    '箱作ビーチ': '阪南市 箱作 ぴちぴちビーチ',
    '泉南マーブルビーチ': '泉南市 りんくう南浜 マーブルビーチ',
  };

  const remaining4 = TARGET_SPOTS.filter(t => !results.has(t));
  if (remaining4.length > 0) {
    console.log(`--- Phase 4: Nominatim 住所検索 (残り ${remaining4.length} スポット) ---`);
    for (const name of remaining4) {
      const query = NOMINATIM_QUERIES[name] || `${name} 大阪府 釣り`;
      console.log(`  [nominatim] ${name} → "${query}"...`);
      const coords = await geocodeAddress(query);
      if (coords && isValidOsakaCoord(coords.lat, coords.lon)) {
        results.set(name, { lat: coords.lat, lon: coords.lon, source: `nominatim: ${query}` });
        console.log(`    → ${coords.lat}, ${coords.lon} ✓`);
      } else if (coords) {
        console.log(`    → ${coords.lat}, ${coords.lon} ✗ (大阪湾外: lat ${OSAKA_BOUNDS.latMin}-${OSAKA_BOUNDS.latMax}, lon ${OSAKA_BOUNDS.lonMin}-${OSAKA_BOUNDS.lonMax})`);
      } else {
        console.log(`    → 取得失敗`);
      }
      await sleep(DELAY_MS);
    }
    console.log(`\n  Phase 4 完了: ${results.size} / ${TARGET_SPOTS.length} 取得\n`);
  }

  // ---- CSV出力 ----
  const csvLines = ['スポット名,緯度,経度,ソースURL'];
  for (const name of TARGET_SPOTS) {
    const r = results.get(name);
    if (r) {
      csvLines.push(`${name},${r.lat},${r.lon},"${r.source}"`);
    } else {
      csvLines.push(`${name},,,未取得`);
    }
  }

  const csvPath = 'osaka-coords-scraped.csv';
  fs.writeFileSync(csvPath, '\uFEFF' + csvLines.join('\n'), 'utf8');

  // サマリー
  console.log(`=== 完了: ${csvPath} (${results.size}/${TARGET_SPOTS.length} 取得) ===`);

  const missing = TARGET_SPOTS.filter(t => !results.has(t));
  if (missing.length > 0) {
    console.log(`\n未取得 (${missing.length}): ${missing.join(', ')}`);
    console.log('→ 手動でGoogle Mapsから座標を確認してください');
  }

  // 信頼度別サマリー
  console.log('\n--- ソース別集計 ---');
  let tsuriba = 0, osakawan = 0, tport = 0, nominatim = 0;
  for (const [, v] of results) {
    if (v.source.includes('tsuriba.info')) tsuriba++;
    else if (v.source.includes('xn--u9jwc')) osakawan++;
    else if (v.source.includes('t-port')) tport++;
    else if (v.source.includes('nominatim')) nominatim++;
  }
  console.log(`  tsuriba.info: ${tsuriba} (高信頼)`);
  console.log(`  大阪湾の釣り.com: ${osakawan}`);
  console.log(`  t-port.com: ${tport}`);
  console.log(`  Nominatim: ${nominatim} (要手動確認)`);
}

main().catch(e => {
  console.error('致命的エラー:', e);
  process.exit(1);
});
