// scrape-osaka-gmaps-retry.js
// 未取得4件をクエリ変更して再取得

const puppeteer = require('puppeteer');
const fs = require('fs');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const OSAKA_BOUNDS = {
  latMin: 34.27, latMax: 34.72,
  lonMin: 135.08, lonMax: 135.48
};

function isValid(lat, lon) {
  return lat >= OSAKA_BOUNDS.latMin && lat <= OSAKA_BOUNDS.latMax &&
         lon >= OSAKA_BOUNDS.lonMin && lon <= OSAKA_BOUNDS.lonMax;
}

// 各スポットに複数のクエリ候補を用意
const RETRY_SPOTS = {
  '岡田漁港': [
    '岡田浦漁港 泉南市',
    '岡田浦港 泉南',
    '岡田漁港 大阪府泉南市',
  ],
  '平林貯木場': [
    '平林貯木場 大阪市住之江区',
    '平林貯木場 南港',
    '平林 貯木場 大阪 住之江',
  ],
  '大和川河口': [
    '大和川 河口 堺市堺区 匠町',
    '大和川河口 大阪 堺',
    '大和川 河口 釣り 大阪',
  ],
  '泉南マーブルビーチ': [
    'SENNAN LONG PARK マーブルビーチ',
    'りんくう南浜海水浴場 泉南',
    '泉南マーブルビーチ 大阪',
  ],
};

async function extractCoords(page) {
  const url = page.url();
  const m = url.match(/@(-?[\d.]+),(-?[\d.]+)/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };

  await sleep(1500);
  const url2 = page.url();
  const m2 = url2.match(/@(-?[\d.]+),(-?[\d.]+)/);
  if (m2) return { lat: parseFloat(m2[1]), lon: parseFloat(m2[2]) };

  return null;
}

async function main() {
  console.log('=== Google Maps リトライ (4件) ===\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=ja-JP']
  });

  const results = new Map();

  for (const [name, queries] of Object.entries(RETRY_SPOTS)) {
    console.log(`[${name}]`);
    let found = false;

    for (const query of queries) {
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      console.log(`  試行: ${query}`);

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');

      try {
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(2500);

        // リスト表示なら最初の結果をクリック
        try {
          const firstResult = await page.$('a[href*="/maps/place/"]');
          if (firstResult) {
            await firstResult.click();
            await sleep(2500);
          }
        } catch (e) { /* ignore */ }

        const coords = await extractCoords(page);
        if (coords && isValid(coords.lat, coords.lon)) {
          results.set(name, {
            lat: Math.round(coords.lat * 10000) / 10000,
            lon: Math.round(coords.lon * 10000) / 10000,
            source: searchUrl
          });
          console.log(`  → ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)} ✓`);
          found = true;
          await page.close();
          break;
        } else if (coords) {
          console.log(`  → ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)} ✗ 範囲外`);
        } else {
          console.log(`  → 座標なし`);
        }
      } catch (e) {
        console.log(`  → エラー: ${e.message}`);
      }

      await page.close();
      await sleep(3000);
    }

    if (!found) console.log(`  → 全クエリ失敗`);
    await sleep(3000);
  }

  await browser.close();

  // 既存CSVに追記
  const csvPath = 'osaka-coords-googlemaps.csv';
  let csvText = fs.readFileSync(csvPath, 'utf8');

  for (const [name, r] of results) {
    // 未取得行を置換
    csvText = csvText.replace(
      `${name},,,未取得`,
      `${name},${r.lat},${r.lon},"${r.source}"`
    );
  }

  fs.writeFileSync(csvPath, csvText, 'utf8');

  console.log(`\n=== リトライ完了: ${results.size}/4 追加取得 ===`);
  console.log(`${csvPath} を更新しました`);

  const still = Object.keys(RETRY_SPOTS).filter(n => !results.has(n));
  if (still.length > 0) {
    console.log(`\nまだ未取得: ${still.join(', ')}`);
  }
}

main().catch(e => {
  console.error('致命的エラー:', e);
  process.exit(1);
});
