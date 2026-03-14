// scrape-osaka-gmaps.js
// 未取得24件の座標を Google Maps + Puppeteer で取得
// 出力: osaka-coords-googlemaps.csv

const puppeteer = require('puppeteer');
const fs = require('fs');

const DELAY_MS = 3000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 大阪湾バウンディングボックス
const OSAKA_BOUNDS = {
  latMin: 34.27, latMax: 34.72,
  lonMin: 135.08, lonMax: 135.48
};

function isValid(lat, lon) {
  return lat >= OSAKA_BOUNDS.latMin && lat <= OSAKA_BOUNDS.latMax &&
         lon >= OSAKA_BOUNDS.lonMin && lon <= OSAKA_BOUNDS.lonMax;
}

// 検索クエリをスポットごとにカスタマイズ（精度向上）
const SEARCH_QUERIES = {
  '大阪港': '大阪港 天保山 釣り',
  '堺泉北港': '堺泉北港 釣り',
  '堺出島漁港': '堺出島漁港 釣り',
  '石津漁港': '石津漁港 堺市 釣り',
  '高石漁港': '高石漁港 高石市',
  '岡田漁港': '岡田漁港 泉南市',
  'シーサイドコスモ': 'シーサイドコスモ 大阪南港 釣り',
  '汐見埠頭': '汐見埠頭 泉大津 釣り',
  '岸和田一文字': '岸和田一文字 旧一文字 釣り',
  '忠岡一文字': '忠岡一文字 釣り',
  '助松埠頭': '助松埠頭 泉大津 釣り',
  '大浜埠頭': '大浜埠頭 堺市 釣り',
  '咲洲': '咲洲 南港 釣り',
  '多奈川護岸': '多奈川護岸 岬町 釣り',
  '平林貯木場': '平林貯木場 釣り',
  '泉佐野旧港': '泉佐野旧港 北中通 釣り',
  '淀川河口': '淀川河口 矢倉緑地 釣り',
  '大和川河口': '大和川河口 堺 釣り',
  '石津川河口': '石津川河口 堺市 釣り',
  '近木川河口': '近木川河口 貝塚 釣り',
  '男里川河口': '男里川河口 泉南 釣り',
  '樫井川河口': '樫井川河口 泉佐野 釣り',
  'りんくうビーチ': 'りんくうビーチ タルイサザンビーチ 泉南',
  '泉南マーブルビーチ': 'マーブルビーチ りんくう南浜 泉南',
};

const TARGET_SPOTS = Object.keys(SEARCH_QUERIES);

async function extractCoordsFromPage(page) {
  // 方法1: URLから @lat,lon を抽出
  const url = page.url();
  const urlMatch = url.match(/@(-?[\d.]+),(-?[\d.]+)/);
  if (urlMatch) {
    const lat = parseFloat(urlMatch[1]);
    const lon = parseFloat(urlMatch[2]);
    if (lat && lon) return { lat, lon, method: 'url' };
  }

  // 方法2: ページ内のmeta/link要素から座標を抽出
  const coords = await page.evaluate(() => {
    // og:url や canonical URL
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      const m = ogUrl.content.match(/@(-?[\d.]+),(-?[\d.]+)/);
      if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
    }

    // ページ内テキストから座標パターン検索
    const body = document.body.innerText || '';
    // 「34.xxxx, 135.xxxx」パターン
    const m2 = body.match(/(34\.\d{3,8})[,\s]+(135\.\d{3,8})/);
    if (m2) return { lat: parseFloat(m2[1]), lon: parseFloat(m2[2]) };

    return null;
  });

  if (coords) return { ...coords, method: 'meta' };

  // 方法3: Google Mapsのリダイレクト先URLを再チェック
  await sleep(1000);
  const url2 = page.url();
  const urlMatch2 = url2.match(/@(-?[\d.]+),(-?[\d.]+)/);
  if (urlMatch2) {
    return { lat: parseFloat(urlMatch2[1]), lon: parseFloat(urlMatch2[2]), method: 'url-retry' };
  }

  return null;
}

async function main() {
  console.log('=== Google Maps 座標スクレイピング (Puppeteer) ===\n');
  console.log(`対象: ${TARGET_SPOTS.length} スポット\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--lang=ja-JP'
    ]
  });

  const results = new Map();

  for (const name of TARGET_SPOTS) {
    const query = SEARCH_QUERIES[name];
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    console.log(`[${results.size + 1}/${TARGET_SPOTS.length}] ${name}`);
    console.log(`  検索: ${query}`);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });

    try {
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Google Mapsがリダイレクト/レンダリングするまで待機
      await sleep(2000);

      // 検索結果の最初のスポットをクリック（リスト表示の場合）
      try {
        const firstResult = await page.$('a[href*="/maps/place/"]');
        if (firstResult) {
          await firstResult.click();
          await sleep(2000);
        }
      } catch (e) { /* クリックできなくても続行 */ }

      const coords = await extractCoordsFromPage(page);

      if (coords && isValid(coords.lat, coords.lon)) {
        results.set(name, {
          lat: Math.round(coords.lat * 10000) / 10000,
          lon: Math.round(coords.lon * 10000) / 10000,
          source: searchUrl
        });
        console.log(`  → ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)} ✓ (${coords.method})`);
      } else if (coords) {
        console.log(`  → ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)} ✗ 大阪湾外 (${coords.method})`);
        console.log(`  → URL: ${page.url()}`);
      } else {
        console.log(`  → 座標取得失敗`);
        console.log(`  → URL: ${page.url()}`);
      }
    } catch (e) {
      console.log(`  → エラー: ${e.message}`);
    } finally {
      await page.close();
    }

    await sleep(DELAY_MS);
  }

  await browser.close();

  // CSV出力
  const csvLines = ['スポット名,緯度,経度,検索URL'];
  for (const name of TARGET_SPOTS) {
    const r = results.get(name);
    if (r) {
      csvLines.push(`${name},${r.lat},${r.lon},"${r.source}"`);
    } else {
      csvLines.push(`${name},,,未取得`);
    }
  }

  const csvPath = 'osaka-coords-googlemaps.csv';
  fs.writeFileSync(csvPath, '\uFEFF' + csvLines.join('\n'), 'utf8');

  console.log(`\n=== 完了: ${csvPath} (${results.size}/${TARGET_SPOTS.length} 取得) ===`);

  const missing = TARGET_SPOTS.filter(n => !results.has(n));
  if (missing.length > 0) {
    console.log(`\n未取得: ${missing.join(', ')}`);
  }
}

main().catch(e => {
  console.error('致命的エラー:', e);
  process.exit(1);
});
