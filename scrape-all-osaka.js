/**
 * scrape-all-osaka.js
 * 大阪釣り場情報 全サイト統合スクレイパー
 *
 * 対象サイト:
 *   1. tsuriba.info        - 海の釣り場情報（大阪29件）
 *   2. 大阪湾の釣り.com    - 個人運営、設備情報密度高（24件）
 *   3. tokyo360photo.com   - 360度写真付き詳細解説
 *   4. gyogyo.jp           - 釣りメディア、設備情報詳細
 *   5. canpblog.com        - かんつり！、設備状況構造化テキスト
 *
 * 使用方法:
 *   npm install cheerio axios
 *   node scrape-all-osaka.js
 *
 * 出力: spots-all-osaka.json
 */

const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ==============================
// 共通ユーティリティ
// ==============================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchHtml(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept-Language': 'ja,en;q=0.9',
        }
      });
      return res.data;
    } catch (e) {
      console.warn(`  [WARN] fetch失敗 (${i+1}/${retries}): ${url} - ${e.message}`);
      if (i < retries - 1) await sleep(3000);
    }
  }
  return null;
}

// トイレ・駐車場のテキスト正規化
function parseToilet(text) {
  if (!text) return null;
  if (/なし|×|✕|無し|ない|トイレなし/i.test(text)) return false;
  if (/あり|○|◎|✓|有り|あります|設置|完備/i.test(text)) return true;
  return null;
}

function parseParking(text) {
  if (!text) return null;
  if (/なし|×|✕|無し|ない|駐車.*なし|駐車場.*なし/i.test(text)) return false;
  if (/あり|○|◎|✓|有り|あります|完備|横付け|無料|有料|駐車.*可/i.test(text)) return true;
  return null;
}

// ==============================
// 1. tsuriba.info
// ==============================

async function scrapeTsuribaInfo() {
  console.log('\n=== [1/5] tsuriba.info ===');
  const results = [];

  // page1, page2
  const listUrls = [
    'https://tsuriba.info/spotlist/25',
    'https://tsuriba.info/spotlist/25?page=2',
  ];

  const spotUrls = [];
  for (const listUrl of listUrls) {
    console.log(`  リスト取得: ${listUrl}`);
    const html = await fetchHtml(listUrl);
    if (!html) continue;
    const $ = cheerio.load(html);

    // スポットリンク収集
    $('a[href*="/spot/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && /^https?:\/\/tsuriba\.info\/spot\/\d+$/.test(href)) {
        if (!spotUrls.includes(href)) spotUrls.push(href);
      }
    });
    await sleep(1500);
  }

  console.log(`  スポットURL: ${spotUrls.length}件`);

  for (const url of spotUrls) {
    console.log(`  取得中: ${url}`);
    const html = await fetchHtml(url);
    if (!html) continue;
    const $ = cheerio.load(html);

    const spot = { source: 'tsuriba.info', url };

    // テーブルから情報抽出
    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;
      const key = $(cells[0]).text().trim();
      const val = $(cells[1]).text().trim();

      if (/名前/.test(key)) spot.name = val;
      if (/所在地/.test(key)) spot.address = val;
      if (/駐車/.test(key)) {
        spot.parkingText = val;
        spot.parking = parseParking(val);
      }
      if (/トイレ/.test(key)) {
        spot.toiletText = val;
        spot.toilet = parseToilet(val);
      }
      if (/交通.*車/.test(key)) spot.accessByCar = val;
      if (/注意/.test(key)) spot.notes = val;
      if (/紹介/.test(key)) spot.description = val;
    });

    // タグから魚種抽出
    const fishTags = [];
    $('a[href*="/tag/1"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text && !/駐車|トイレ|ファミリー|フェンス|護岸|釣り/.test(text)) {
        fishTags.push(text);
      }
    });
    spot.fish = [...new Set(fishTags)];

    if (spot.name) results.push(spot);
    await sleep(1500);
  }

  console.log(`  完了: ${results.length}件`);
  return results;
}

// ==============================
// 2. 大阪湾の釣り.com
// ==============================

async function scrapeOsakaBayFishing() {
  console.log('\n=== [2/5] 大阪湾の釣り.com ===');
  const results = [];
  const BASE = 'https://www.xn--u9jwc554om3rqo4bwmf.com';

  // カテゴリページからスポットURL収集
  const categoryUrls = [
    `${BASE}/archive/category/%E9%87%A3%E3%82%8A%E5%A0%B4%E3%81%AB%E3%83%88%E3%82%A4%E3%83%AC%E3%81%8C%E3%81%82%E3%82%8B`,
    `${BASE}/archive/category/%E8%BB%8A%E3%81%8C%E6%A8%AA%E4%BB%98%E3%81%91%E3%81%A7%E3%81%8D%E3%82%8B%E9%87%A3%E3%82%8A%E5%A0%B4`,
    `${BASE}/`,
  ];

  const spotUrls = [];

  for (const catUrl of categoryUrls) {
    console.log(`  カテゴリ取得: ${catUrl}`);
    const html = await fetchHtml(catUrl);
    if (!html) continue;
    const $ = cheerio.load(html);

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      // 釣り場記事へのリンク（カテゴリ・タグページ以外）
      if (
        href.startsWith(BASE) &&
        !href.includes('/category/') &&
        !href.includes('/tag/') &&
        href !== BASE + '/' &&
        !spotUrls.includes(href)
      ) {
        spotUrls.push(href);
      }
    });
    await sleep(2000);
  }

  console.log(`  スポットURL: ${spotUrls.length}件`);

  for (const url of spotUrls) {
    console.log(`  取得中: ${url}`);
    const html = await fetchHtml(url);
    if (!html) continue;
    const $ = cheerio.load(html);

    const spot = { source: '大阪湾の釣り.com', url };

    // タイトル
    spot.name = $('h1').first().text().trim().replace(/の釣り場情報.*/, '').trim();

    // 本文から設備情報を抽出
    const bodyText = $('article, .entry-content, .post-content, #content').text();

    // 駐車場
    const parkingMatch = bodyText.match(/駐車場[：:　\s]*([^\n。]{1,40})/);
    if (parkingMatch) {
      spot.parkingText = parkingMatch[1].trim();
      spot.parking = parseParking(spot.parkingText);
    }

    // トイレ
    const toiletMatch = bodyText.match(/トイレ[：:　\s]*([^\n。]{1,40})/);
    if (toiletMatch) {
      spot.toiletText = toiletMatch[1].trim();
      spot.toilet = parseToilet(spot.toiletText);
    }

    // 釣り場データテーブルがある場合
    $('table tr').each((_, row) => {
      const th = $(row).find('th').text().trim();
      const td = $(row).find('td').text().trim();
      if (/駐車/.test(th)) { spot.parkingText = td; spot.parking = parseParking(td); }
      if (/トイレ/.test(th)) { spot.toiletText = td; spot.toilet = parseToilet(td); }
      if (/住所|場所/.test(th)) spot.address = td;
      if (/禁止|注意/.test(th)) spot.notes = td;
    });

    // カテゴリタグ（釣り方・禁止情報）
    const tags = [];
    $('a[rel="category tag"], .cat-links a, .tags-links a').each((_, el) => {
      tags.push($(el).text().trim());
    });
    spot.tags = tags;

    // 禁止フラグ
    if (/釣り禁止|立入禁止|禁止区域/.test(bodyText)) {
      spot.hasBanInfo = true;
    }

    if (spot.name) results.push(spot);
    await sleep(2000);
  }

  console.log(`  完了: ${results.length}件`);
  return results;
}

// ==============================
// 3. tokyo360photo.com
// ==============================

async function scrapeTokyo360() {
  console.log('\n=== [3/5] tokyo360photo.com ===');
  const results = [];

  // 大阪釣り場まとめページからリンク収集
  const indexUrl = 'https://tokyo360photo.com/osaka-fishing-spot';
  console.log(`  インデックス取得: ${indexUrl}`);
  const indexHtml = await fetchHtml(indexUrl);
  if (!indexHtml) return results;

  const $idx = cheerio.load(indexHtml);
  const spotUrls = [];

  $idx('a[href]').each((_, el) => {
    const href = $idx(el).attr('href');
    if (
      href &&
      href.includes('tokyo360photo.com') &&
      href.includes('-fishing') &&
      !spotUrls.includes(href)
    ) {
      spotUrls.push(href);
    }
  });

  console.log(`  スポットURL: ${spotUrls.length}件`);

  for (const url of spotUrls) {
    console.log(`  取得中: ${url}`);
    const html = await fetchHtml(url);
    if (!html) continue;
    const $ = cheerio.load(html);

    const spot = { source: 'tokyo360photo.com', url };

    spot.name = $('h1').first().text().replace(/の釣り場.*|を.*紹介.*/, '').trim();

    const bodyText = $('.entry-content, article').text();

    // トイレ・駐車場
    const toiletMatch = bodyText.match(/トイレ[はも]?[、は]?(.{1,60}?)[。\n]/);
    if (toiletMatch) {
      spot.toiletText = toiletMatch[1].trim();
      spot.toilet = parseToilet(spot.toiletText);
    }
    const parkMatch = bodyText.match(/駐車場[はも]?[、は]?(.{1,60}?)[。\n]/);
    if (parkMatch) {
      spot.parkingText = parkMatch[1].trim();
      spot.parking = parseParking(spot.parkingText);
    }

    // 住所
    const addrMatch = bodyText.match(/住所[：:\s]+([^\n]{5,50})/);
    if (addrMatch) spot.address = addrMatch[1].trim();

    // 釣れる魚種（h2/h3セクション名から）
    const fish = [];
    $('h2, h3').each((_, el) => {
      const text = $(el).text();
      if (/釣れる魚|魚種/.test(text)) {
        // 次のul/olから魚種取得
        $(el).next('ul, ol').find('li').each((_, li) => {
          fish.push($(li).text().trim());
        });
      }
    });
    spot.fish = fish;

    if (spot.name) results.push(spot);
    await sleep(2000);
  }

  console.log(`  完了: ${results.length}件`);
  return results;
}

// ==============================
// 4. gyogyo.jp
// ==============================

async function scrapeGyogyo() {
  console.log('\n=== [4/5] gyogyo.jp ===');
  const results = [];

  // 大阪の釣り場カテゴリページ
  const listUrls = [
    'https://gyogyo.jp/category/fishing-spot/osaka',
    'https://gyogyo.jp/category/fishing-spot/osaka/page/2',
    'https://gyogyo.jp/category/fishing-spot/osaka/page/3',
  ];

  const spotUrls = [];
  for (const listUrl of listUrls) {
    console.log(`  リスト取得: ${listUrl}`);
    const html = await fetchHtml(listUrl);
    if (!html) continue;
    const $ = cheerio.load(html);

    $('article a[href], .post-title a, h2 a, h3 a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('gyogyo.jp') && href.includes('/archives/') && !spotUrls.includes(href)) {
        spotUrls.push(href);
      }
    });
    await sleep(1500);
  }

  console.log(`  スポットURL: ${spotUrls.length}件`);

  for (const url of spotUrls) {
    console.log(`  取得中: ${url}`);
    const html = await fetchHtml(url);
    if (!html) continue;
    const $ = cheerio.load(html);

    const spot = { source: 'gyogyo.jp', url };

    spot.name = $('h1').first().text().replace(/～.*～|【.*】|\s*[-－].*/, '').trim();

    const bodyText = $('.entry-content, article').text();

    // gyogyo.jpは詳細な設備情報テキストが豊富
    const toiletMatch = bodyText.match(/トイレ[はも]?[：:\s、]*(.{1,80}?)[。\n]/);
    if (toiletMatch) {
      spot.toiletText = toiletMatch[1].trim();
      spot.toilet = parseToilet(spot.toiletText);
    }
    const parkMatch = bodyText.match(/駐車場[はも]?[：:\s、]*(.{1,80}?)[。\n]/);
    if (parkMatch) {
      spot.parkingText = parkMatch[1].trim();
      spot.parking = parseParking(spot.parkingText);
    }

    // 住所
    const addrMatch = bodyText.match(/〒[\d\-]+\s*([^\n]{5,60})/);
    if (addrMatch) spot.address = addrMatch[1].trim();

    if (spot.name && spot.name.length > 1) results.push(spot);
    await sleep(2000);
  }

  console.log(`  完了: ${results.length}件`);
  return results;
}

// ==============================
// 5. canpblog.com (かんつり！)
// ==============================

async function scrapeCanpBlog() {
  console.log('\n=== [5/5] canpblog.com (かんつり！) ===');
  const results = [];

  // 大阪釣り場カテゴリ
  const listUrls = [
    'https://canpblog.com/category/osaka-fishing/',
    'https://canpblog.com/category/osaka-fishing/page/2/',
    'https://canpblog.com/',  // トップから大阪記事収集
  ];

  const spotUrls = [];
  for (const listUrl of listUrls) {
    console.log(`  リスト取得: ${listUrl}`);
    const html = await fetchHtml(listUrl);
    if (!html) continue;
    const $ = cheerio.load(html);

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (
        href &&
        href.includes('canpblog.com') &&
        !href.includes('/category/') &&
        !href.includes('/tag/') &&
        !href.includes('/page/') &&
        href !== 'https://canpblog.com/' &&
        !spotUrls.includes(href) &&
        // 大阪・釣り場関連キーワード
        /osaka|大阪|釣り場|釣り|漁港|埠頭|護岸|公園/.test(href)
      ) {
        spotUrls.push(href);
      }
    });
    await sleep(1500);
  }

  console.log(`  スポットURL: ${spotUrls.length}件`);

  for (const url of spotUrls) {
    console.log(`  取得中: ${url}`);
    const html = await fetchHtml(url);
    if (!html) continue;
    const $ = cheerio.load(html);

    const spot = { source: 'canpblog.com', url };

    spot.name = $('h1').first().text()
      .replace(/【.*?】|〜.*〜|～.*～|\s*[-－].*|の釣り.*/, '').trim();

    const bodyText = $('.entry-content, article, .post').text();

    // canpblog.comは「設備状況：トイレ◎ / 柵✕ / 駐車料金 無料」形式
    const facilityMatch = bodyText.match(/設備状況[：:\s]*([^\n]{5,120})/);
    if (facilityMatch) {
      spot.facilityText = facilityMatch[1].trim();
      spot.toilet = parseToilet(spot.facilityText);
      spot.parking = parseParking(spot.facilityText);

      // 駐車料金
      const feeMatch = spot.facilityText.match(/駐車料金\s*([^\s/]{1,30})/);
      if (feeMatch) spot.parkingFee = feeMatch[1].trim();
    }

    // 個別トイレ・駐車場
    const toiletMatch = bodyText.match(/トイレ[：:\s]*([^\n/]{1,60})/);
    if (toiletMatch && !spot.toilet) {
      spot.toiletText = toiletMatch[1].trim();
      spot.toilet = parseToilet(spot.toiletText);
    }

    const parkMatch = bodyText.match(/駐車[場料金：:\s]*([^\n/]{1,60})/);
    if (parkMatch && spot.parking === undefined) {
      spot.parkingText = parkMatch[1].trim();
      spot.parking = parseParking(spot.parkingText);
    }

    // 住所
    const addrMatch = bodyText.match(/(?:住所|所在地)[：:\s]+([^\n]{5,50})/);
    if (addrMatch) spot.address = addrMatch[1].trim();

    // 禁止情報
    if (/釣り禁止|立入禁止/.test(bodyText)) spot.hasBanInfo = true;

    if (spot.name && spot.name.length > 1) results.push(spot);
    await sleep(2000);
  }

  console.log(`  完了: ${results.length}件`);
  return results;
}

// ==============================
// メイン処理 & マージ
// ==============================

async function main() {
  console.log('==============================');
  console.log('大阪釣り場 全サイト統合スクレイパー');
  console.log('==============================');

  const allSpots = [];

  // 各サイトのスクレイパーを順番に実行
  const scrapers = [
    scrapeTsuribaInfo,
    scrapeOsakaBayFishing,
    scrapeTokyo360,
    scrapeGyogyo,
    scrapeCanpBlog,
  ];

  for (const scraper of scrapers) {
    try {
      const spots = await scraper();
      allSpots.push(...spots);
    } catch (e) {
      console.error(`スクレイパーエラー: ${e.message}`);
    }
  }

  // 重複除去（名前ベースで正規化）
  const normalize = (name) => name
    .replace(/[　\s]/g, '')
    .replace(/（.*?）|\(.*?\)/g, '')
    .replace(/の釣り場.*/, '')
    .toLowerCase();

  const seen = new Map();
  const deduped = [];

  for (const spot of allSpots) {
    const key = normalize(spot.name || '');
    if (!key) continue;

    if (seen.has(key)) {
      // マージ: 既存エントリに情報を補完
      const existing = seen.get(key);
      if (spot.toilet !== null && existing.toilet === null) existing.toilet = spot.toilet;
      if (spot.parking !== null && existing.parking === null) existing.parking = spot.parking;
      if (!existing.address && spot.address) existing.address = spot.address;
      if (!existing.fish && spot.fish) existing.fish = spot.fish;
      if (!existing.notes && spot.notes) existing.notes = spot.notes;
      if (!existing.hasBanInfo && spot.hasBanInfo) existing.hasBanInfo = true;
      existing.sources = [...(existing.sources || [existing.source]), spot.source];
    } else {
      spot.sources = [spot.source];
      seen.set(key, spot);
      deduped.push(spot);
    }
  }

  // 統計
  const withToilet = deduped.filter(s => s.toilet !== null).length;
  const withParking = deduped.filter(s => s.parking !== null).length;
  const withAddress = deduped.filter(s => s.address).length;

  console.log('\n==============================');
  console.log(`総件数 (重複除去後): ${deduped.length}件`);
  console.log(`  トイレ情報あり: ${withToilet}件`);
  console.log(`  駐車場情報あり: ${withParking}件`);
  console.log(`  住所あり: ${withAddress}件`);
  console.log('==============================');

  // 出力
  const outPath = path.join(__dirname, 'spots-all-osaka.json');
  fs.writeFileSync(outPath, JSON.stringify(deduped, null, 2), 'utf-8');
  console.log(`\n出力完了: ${outPath}`);

  // サマリCSVも出力
  const csvLines = ['name,toilet,parking,address,hasBanInfo,sources'];
  for (const s of deduped) {
    const cols = [
      (s.name || '').replace(/,/g, '、'),
      s.toilet === true ? 'あり' : s.toilet === false ? 'なし' : '不明',
      s.parking === true ? 'あり' : s.parking === false ? 'なし' : '不明',
      (s.address || '').replace(/,/g, '、'),
      s.hasBanInfo ? '禁止情報あり' : '',
      (s.sources || [s.source]).join('|'),
    ];
    csvLines.push(cols.join(','));
  }
  const csvPath = path.join(__dirname, 'spots-all-osaka.csv');
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');
  console.log(`CSV出力完了: ${csvPath}`);
}

main().catch(console.error);
