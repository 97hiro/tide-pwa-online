#!/usr/bin/env node
/**
 * scrape-d-anglers.js
 *
 * D-ANGLERS (ameblo.jp/d-anglers) から関西釣り禁止エリア情報を収集
 * → d-anglers-banned.json, d-anglers-updates.json を出力
 *
 * 使い方:
 *   node scrape-d-anglers.js
 *
 * 依存: cheerio (npm install cheerio)
 */

const fs = require('fs');

let cheerio;
try {
  cheerio = require('cheerio');
} catch {
  console.error('cheerio が必要です: npm install cheerio');
  process.exit(1);
}

// ============================================================
// 設定
// ============================================================

const BLOG_BASE = 'https://ameblo.jp/d-anglers';
const SITE_BASE = 'https://d-anglers.net';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 釣り禁止関連キーワード
const BAN_KEYWORDS = ['釣り禁止', '立入禁止', '閉鎖', '立ち入り禁止', '進入禁止', '禁止エリア', '釣禁'];

// 記事一覧ページ（最大ページ数）
const MAX_ENTRY_PAGES = 5;

// ============================================================
// HTTP取得
// ============================================================

async function fetchPage(url) {
  console.log(`  Fetching: ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.text();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// Step 1: ブログ記事一覧から全記事リンクを収集
// ============================================================

async function collectArticleList() {
  const articles = [];

  for (let page = 1; page <= MAX_ENTRY_PAGES; page++) {
    const url = page === 1
      ? `${BLOG_BASE}/entrylist.html`
      : `${BLOG_BASE}/entrylist-${page}.html`;

    try {
      const html = await fetchPage(url);
      const $ = cheerio.load(html);

      // Amebloの記事一覧構造を解析
      // タイトルリンクとタイムスタンプを取得
      let found = 0;

      // パターン1: 記事タイトルリンク（ameblo entrylist）
      $('a[href*="/d-anglers/entry-"]').each((_, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const title = $el.text().trim();
        if (title && title.length > 3 && href) {
          const fullUrl = href.startsWith('http') ? href : `https://ameblo.jp${href}`;
          // 重複チェック
          if (!articles.find(a => a.url === fullUrl)) {
            articles.push({ title, url: fullUrl, date: '' });
            found++;
          }
        }
      });

      // 日付情報の取得を試みる（time要素やテキストから）
      $('time').each((_, el) => {
        const datetime = $(el).attr('datetime') || $(el).text().trim();
        if (datetime) {
          // 直近追加された記事に日付を設定
          const lastNoDate = articles.find(a => !a.date);
          if (lastNoDate) lastNoDate.date = datetime;
        }
      });

      console.log(`  記事一覧ページ${page}: ${found}件`);

      // 次ページが存在しない場合は終了
      const hasNext = $(`a[href*="entrylist-${page + 1}.html"]`).length > 0;
      if (!hasNext && found === 0) break;

    } catch (err) {
      console.error(`  記事一覧ページ${page}: ERROR - ${err.message}`);
      break;
    }

    await sleep(1500);
  }

  return articles;
}

// ============================================================
// Step 2: 記事本文からキーワードマッチする記事を抽出
// ============================================================

async function scanArticleForBanInfo(articleUrl) {
  try {
    const html = await fetchPage(articleUrl);
    const $ = cheerio.load(html);

    // 記事本文を取得
    const bodyText = $('article').text() ||
                     $('[class*="entry"]').text() ||
                     $('main').text() ||
                     $('body').text();

    // タイトル取得
    const title = $('h1').first().text().trim() ||
                  $('h2').first().text().trim() ||
                  $('title').text().trim();

    // 日付取得
    const dateEl = $('time').first();
    const date = dateEl.attr('datetime') || dateEl.text().trim() || '';

    // キーワードマッチ
    const matchedKeywords = BAN_KEYWORDS.filter(kw => bodyText.includes(kw));

    return {
      title,
      date,
      url: articleUrl,
      bodyText,
      matchedKeywords,
      hasBanInfo: matchedKeywords.length > 0,
    };
  } catch (err) {
    console.error(`  記事スキャン失敗: ${articleUrl} - ${err.message}`);
    return { url: articleUrl, hasBanInfo: false, error: err.message };
  }
}

// ============================================================
// Step 3: 記事本文から釣り禁止スポット情報を抽出
// ============================================================

function extractBanSpots(article) {
  const spots = [];
  const text = article.bodyText || '';

  // 場所名の末尾パターン
  const placeSuffix = '(?:港|漁港|堤防|護岸|埠頭|浜|公園|パーク|ケーソン|一文字|波止|岸壁|テトラ|島|岬|裏)';
  // 禁止キーワード
  const banKw = '(?:釣り禁止|立入禁止|立ち入り禁止|閉鎖|進入禁止)';

  const patterns = [
    // 「○○港は釣り禁止」パターン - スポット名は漢字カナ英数のみ
    new RegExp(`([\\u4E00-\\u9FFF\\u30A0-\\u30FFa-zA-Z0-9ー]+${placeSuffix})[はがをも]*${banKw}`, 'g'),
    // 「釣り禁止の○○港」パターン
    new RegExp(`${banKw}[のとなった]*([\\u4E00-\\u9FFF\\u30A0-\\u30FFa-zA-Z0-9ー]+${placeSuffix})`, 'g'),
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let name = match[1].trim()
        .replace(/^[、。のはがをも注意]+/, '')
        .replace(/[、。のはがをも]+$/, '');
      // スポット名のバリデーション: 最低2文字の漢字カナを含むこと
      const kanjiKana = name.match(/[\u4E00-\u9FFF\u30A0-\u30FF]/g);
      if (name.length >= 2 && name.length <= 20 && kanjiKana && kanjiKana.length >= 2) {
        if (!spots.find(s => s.name === name)) {
          spots.push({ name, source_text: match[0].trim() });
        }
      }
    }
  }

  return spots;
}

// 府県推定
function guessPrefecture(name, context) {
  const combined = name + ' ' + (context || '');
  if (/兵庫|神戸|明石|西宮|芦屋|姫路|淡路/.test(combined)) return '兵庫';
  if (/大阪|堺|岸和田|貝塚|泉南|泉佐野|阪南|岬町|南港|舞洲/.test(combined)) return '大阪';
  if (/和歌山|海南|有田|御坊|田辺|白浜|串本|新宮/.test(combined)) return '和歌山';
  if (/京都|舞鶴|宮津|伊根|丹後/.test(combined)) return '京都';
  if (/淡路/.test(combined)) return '淡路島';
  return '';
}

// 禁止種別推定
function guessStatus(sourceText) {
  if (/立入禁止|立ち入り禁止/.test(sourceText)) return '立入禁止';
  if (/閉鎖/.test(sourceText)) return '閉鎖';
  if (/進入禁止/.test(sourceText)) return '車両進入禁止';
  if (/釣り禁止|釣禁/.test(sourceText)) return '釣り禁止';
  return '要注意';
}

// ============================================================
// Step 4: メインサイトからも情報収集を試みる
// ============================================================

async function scrapeMainSite() {
  const spots = [];
  // メインサイトのイベントページなどに禁止情報が含まれる場合がある
  const pagesToCheck = [
    `${SITE_BASE}/`,
    `${SITE_BASE}/about-us/`,
  ];

  for (const url of pagesToCheck) {
    try {
      const html = await fetchPage(url);
      const text = cheerio.load(html)('body').text();
      const hasBan = BAN_KEYWORDS.some(kw => text.includes(kw));
      if (hasBan) {
        console.log(`  メインサイトに禁止情報あり: ${url}`);
        // ここから抽出（簡易）
        const article = { bodyText: text, url };
        const extracted = extractBanSpots(article);
        for (const s of extracted) {
          s.source_url = url;
          spots.push(s);
        }
      }
    } catch (err) {
      console.error(`  メインサイト取得失敗: ${url} - ${err.message}`);
    }
    await sleep(1500);
  }

  return spots;
}

// ============================================================
// 既知の禁止エリア（記事解析から確認済み）
// ============================================================

const KNOWN_BANNED_SPOTS = [
  {
    name: '西宮ケーソン',
    prefecture: '兵庫',
    status: '釣り禁止',
    reason: 'ゴミ放置、港湾利用者とのトラブル、安全性の問題',
    source_url: 'https://ameblo.jp/d-anglers/entry-12873156556.html',
    notes: '港湾施設',
  },
  {
    name: '西宮浜西護岸',
    prefecture: '兵庫',
    status: '要注意',
    reason: '落水事故、安全性の懸念',
    source_url: 'https://ameblo.jp/d-anglers/entry-12873156556.html',
    notes: '2024年11月時点で釣りは可能だが通り抜け不可。ライフジャケット着用推奨',
  },
  {
    name: '岩屋港（一部）',
    prefecture: '兵庫',
    status: '要注意',
    reason: '釣り人による問題行為、市役所駐車場への無断駐車',
    source_url: 'https://ameblo.jp/d-anglers/entry-12873156556.html',
    notes: '問題継続で全面閉鎖の可能性。漁師の職場。淡路島',
  },
  {
    name: '郡家港',
    prefecture: '兵庫',
    status: '車両進入禁止',
    reason: '船の陸揚げや船への給油のためタンクローリー等が入る',
    source_url: 'https://ameblo.jp/d-anglers/entry-12873156556.html',
    notes: '淡路島。空地部分への車両進入禁止',
  },
  {
    name: 'オノコロ裏',
    prefecture: '兵庫',
    status: '閉鎖',
    reason: '無断侵入、進入禁止柵の破壊・海への廃棄',
    source_url: 'https://ameblo.jp/d-anglers/entry-12873156556.html',
    notes: '淡路島。警察捜査実施、現在コンクリートブロックで閉鎖',
  },
  {
    name: 'マリンパーク横',
    prefecture: '大阪',
    status: '釣り禁止',
    reason: '危険エリア',
    source_url: 'https://ameblo.jp/d-anglers/entry-12945761794.html',
    notes: '大型船舶接岸エリアも釣り禁止',
  },
];

// ============================================================
// メイン処理
// ============================================================

async function main() {
  console.log('D-ANGLERS 釣り禁止エリア収集スクリプト');
  console.log('='.repeat(50));

  const scrapedAt = new Date().toISOString();
  const allSpots = [];
  const allUpdates = [];

  // ---- Part 1: 既知の禁止スポットを登録 ----
  console.log('\n=== 既知の禁止エリア登録 ===');
  for (const spot of KNOWN_BANNED_SPOTS) {
    allSpots.push({
      ...spot,
      scraped_at: scrapedAt,
    });
    console.log(`  ✓ ${spot.prefecture} ${spot.name} (${spot.status})`);
  }

  // ---- Part 2: メインサイトスキャン ----
  console.log('\n=== メインサイトスキャン ===');
  try {
    const mainSpots = await scrapeMainSite();
    for (const s of mainSpots) {
      if (!allSpots.find(existing => existing.name === s.name)) {
        allSpots.push({
          name: s.name,
          prefecture: guessPrefecture(s.name, s.source_text),
          status: guessStatus(s.source_text || ''),
          reason: '',
          source_url: s.source_url,
          scraped_at: scrapedAt,
          notes: `自動抽出: ${s.source_text || ''}`,
        });
        console.log(`  + ${s.name} (自動抽出)`);
      }
    }
  } catch (err) {
    console.error(`  メインサイトスキャン失敗: ${err.message}`);
  }

  // ---- Part 3: ブログ記事スキャン ----
  console.log('\n=== ブログ記事一覧取得 ===');
  const articles = await collectArticleList();
  console.log(`  合計: ${articles.length}記事`);

  console.log('\n=== ブログ記事スキャン（禁止情報検索） ===');
  for (const article of articles) {
    await sleep(1500); // レート制限

    const result = await scanArticleForBanInfo(article.url);

    if (result.hasBanInfo) {
      console.log(`  ★ 禁止情報あり: ${result.title}`);
      console.log(`    キーワード: ${result.matchedKeywords.join(', ')}`);

      // 更新情報として記録
      allUpdates.push({
        title: result.title,
        date: result.date,
        url: result.url,
        matched_keywords: result.matchedKeywords,
        scraped_at: scrapedAt,
      });

      // スポット自動抽出
      const extracted = extractBanSpots(result);
      for (const s of extracted) {
        if (!allSpots.find(existing => existing.name === s.name)) {
          const spot = {
            name: s.name,
            prefecture: guessPrefecture(s.name, result.bodyText),
            status: guessStatus(s.source_text),
            reason: '',
            source_url: result.url,
            scraped_at: scrapedAt,
            notes: `自動抽出: ${s.source_text}`,
          };
          allSpots.push(spot);
          console.log(`    + ${spot.name} (${spot.status})`);
        }
      }
    } else {
      console.log(`    ${result.title || article.title || article.url}: 禁止情報なし`);
    }
  }

  // ---- 出力 ----
  console.log('\n=== 結果 ===');

  // d-anglers-banned.json
  const bannedOutput = {
    spots: allSpots,
    total: allSpots.length,
    scraped_at: scrapedAt,
    sources: [
      { name: 'D-ANGLERS メインサイト', url: SITE_BASE },
      { name: 'D-ANGLERS ブログ', url: BLOG_BASE },
    ],
  };

  fs.writeFileSync('./d-anglers-banned.json', JSON.stringify(bannedOutput, null, 2));
  console.log(`出力: d-anglers-banned.json (${allSpots.length}件)`);

  // 禁止スポット一覧表示
  console.log('\n--- 禁止スポット一覧 ---');
  for (const s of allSpots) {
    console.log(`  [${s.status}] ${s.prefecture} ${s.name}`);
    if (s.notes) console.log(`         備考: ${s.notes}`);
  }

  // d-anglers-updates.json
  const updatesOutput = {
    articles: allUpdates,
    total: allUpdates.length,
    scraped_at: scrapedAt,
    keywords_used: BAN_KEYWORDS,
  };

  fs.writeFileSync('./d-anglers-updates.json', JSON.stringify(updatesOutput, null, 2));
  console.log(`\n出力: d-anglers-updates.json (${allUpdates.length}件の関連記事)`);

  // 関連記事一覧表示
  if (allUpdates.length > 0) {
    console.log('\n--- 禁止関連記事 ---');
    for (const u of allUpdates) {
      console.log(`  ${u.date || '日付不明'} ${u.title}`);
      console.log(`    → ${u.url}`);
    }
  }

  console.log('\n完了');
}

main().catch(console.error);
