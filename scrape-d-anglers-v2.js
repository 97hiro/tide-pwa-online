#!/usr/bin/env node
/**
 * scrape-d-anglers-v2.js
 *
 * D-ANGLERS ブログ全記事を網羅スキャンし、
 * 釣り禁止情報を fishing-spots.db に追記する。
 *
 * 使い方:
 *   node scrape-d-anglers-v2.js
 *
 * 依存: cheerio, better-sqlite3
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const Database = require('better-sqlite3');

// ============================================================
// 設定
// ============================================================

const BLOG_BASE = 'https://ameblo.jp/d-anglers';
const DB_PATH = path.join(__dirname, 'fishing-spots.db');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const BAN_KEYWORDS = [
  '釣り禁止', '立入禁止', '閉鎖', '通行禁止',
  'ハザードマップ', '釣り場マップ', '禁止エリア', '解禁',
  '立ち入り禁止', '進入禁止', '釣禁',
];

const RATE_LIMIT_MS = 1500;

// ============================================================
// HTTP
// ============================================================

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.text();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// Step 1: 全記事URL収集（entrylist + ブログページネーション併用）
// ============================================================

async function collectAllArticles() {
  const articles = new Map(); // url → { title, date }

  // --- entrylist ページネーション ---
  console.log('\n=== entrylist ページネーション ===');
  for (let page = 1; page <= 20; page++) {
    const url = page === 1
      ? `${BLOG_BASE}/entrylist.html`
      : `${BLOG_BASE}/entrylist-${page}.html`;

    try {
      const html = await fetchPage(url);
      const $ = cheerio.load(html);
      let found = 0;

      $('a[href*="/d-anglers/entry-"]').each((_, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim();
        if (title && title.length > 3 && href) {
          const fullUrl = href.startsWith('http') ? href : `https://ameblo.jp${href}`;
          if (!articles.has(fullUrl)) {
            articles.set(fullUrl, { title, date: '' });
            found++;
          }
        }
      });

      console.log(`  entrylist-${page}: ${found}件`);
      if (found === 0) break;
    } catch (err) {
      // 404等でページが存在しない場合は終了
      console.log(`  entrylist-${page}: 終了 (${err.message})`);
      break;
    }
    await sleep(RATE_LIMIT_MS);
  }

  // --- ブログページネーション（追加収集） ---
  console.log('\n=== ブログページネーション ===');
  for (let page = 1; page <= 50; page++) {
    const url = page === 1
      ? `${BLOG_BASE}/`
      : `${BLOG_BASE}/page-${page}.html`;

    try {
      const html = await fetchPage(url);
      const $ = cheerio.load(html);
      let found = 0;

      $('a[href*="/d-anglers/entry-"]').each((_, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim();
        if (title && title.length > 3 && href) {
          const fullUrl = href.startsWith('http') ? href : `https://ameblo.jp${href}`;
          if (!articles.has(fullUrl)) {
            articles.set(fullUrl, { title, date: '' });
            found++;
          }
        }
      });

      // 次ページリンクが無ければ終了
      const hasNext = $(`a[href*="/d-anglers/page-${page + 1}.html"]`).length > 0;
      if (found > 0) {
        console.log(`  page-${page}: +${found}件 (新規)`);
      }
      if (!hasNext) {
        console.log(`  page-${page}: 最終ページ`);
        break;
      }
    } catch (err) {
      console.log(`  page-${page}: 終了 (${err.message})`);
      break;
    }
    await sleep(RATE_LIMIT_MS);
  }

  console.log(`\n総記事数: ${articles.size}`);
  return articles;
}

// ============================================================
// Step 2: 記事本文スキャン
// ============================================================

async function scanArticle(url) {
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  // 記事本文
  const bodyText = $('article').text() ||
                   $('[class*="entry"]').text() ||
                   $('main').text() ||
                   $('body').text();

  // タイトル
  const title = $('h1').first().text().trim() ||
                $('h2').first().text().trim() ||
                $('title').text().trim();

  // 日付（entry_created_datetime属性またはtime要素）
  let date = '';
  // Ameblo の data 属性から
  const scriptTexts = $('script').text();
  const dateMatch = scriptTexts.match(/"entry_created_datetime"\s*:\s*"([^"]+)"/);
  if (dateMatch) {
    date = dateMatch[1];
  } else {
    const timeEl = $('time').first();
    date = timeEl.attr('datetime') || timeEl.text().trim() || '';
  }
  // 日付テキストからも試行（2024年10月30日 のパターン）
  if (!date) {
    const dateTextMatch = bodyText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (dateTextMatch) {
      const [, y, m, d] = dateTextMatch;
      date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  // キーワードマッチ
  const matchedKeywords = BAN_KEYWORDS.filter(kw => bodyText.includes(kw));

  return { title, date, url, bodyText, matchedKeywords, hasBanInfo: matchedKeywords.length > 0 };
}

// ============================================================
// Step 3: 構造化データ抽出（強化版）
// ============================================================

function extractSpots(article) {
  const spots = [];
  const text = article.bodyText || '';

  // --- パターン群 ---
  const placeSuffix = '(?:港|漁港|堤防|護岸|埠頭|浜|公園|パーク|ケーソン|一文字|波止|岸壁|テトラ|島|岬|裏|テラス|突堤|桟橋|マリーナ|新波止)';
  const banKw = '(?:釣り禁止|立入禁止|立ち入り禁止|閉鎖|進入禁止|通行禁止|釣禁)';
  const openKw = '(?:解禁|オープン|再開|釣り可能|開放)';
  const CJK = '[\\u4E00-\\u9FFF\\u30A0-\\u30FFa-zA-Z0-9ー]';

  const patterns = [
    // 「〇〇港は釣り禁止」
    { re: new RegExp(`(${CJK}+${placeSuffix})[はがをも]*${banKw}`, 'g'), type: 'ban' },
    // 「釣り禁止の〇〇港」
    { re: new RegExp(`${banKw}[のとなった]*(${CJK}+${placeSuffix})`, 'g'), type: 'ban' },
    // 「〇〇港が解禁」
    { re: new RegExp(`(${CJK}+${placeSuffix})[はがをも]*${openKw}`, 'g'), type: 'open' },
    // 「解禁の〇〇港」
    { re: new RegExp(`${openKw}[のとなった]*(${CJK}+${placeSuffix})`, 'g'), type: 'open' },
    // 箇条書き: 「・〇〇港」「- 〇〇漁港」行頭のスポット名
    { re: new RegExp(`(?:^|\\n)[・\\-\\*●■]\\s*(${CJK}+${placeSuffix})`, 'gm'), type: 'list' },
  ];

  for (const { re, type } of patterns) {
    let match;
    while ((match = re.exec(text)) !== null) {
      let name = match[1].trim()
        .replace(/^[、。のはがをも注意]+/, '')
        .replace(/[、。のはがをも]+$/, '');

      const kanjiKana = name.match(/[\u4E00-\u9FFF\u30A0-\u30FF]/g);
      if (name.length < 2 || name.length > 20 || !kanjiKana || kanjiKana.length < 2) continue;
      if (spots.find(s => s.name === name)) continue;

      let status;
      if (type === 'open') {
        status = '解禁';
      } else if (type === 'list') {
        // 箇条書きの場合、前後の文脈からステータス推定
        const surrounding = text.substring(
          Math.max(0, match.index - 100),
          Math.min(text.length, match.index + match[0].length + 100)
        );
        status = guessStatusFromContext(surrounding);
      } else {
        status = guessStatus(match[0]);
      }

      spots.push({
        name,
        status,
        source_text: match[0].trim(),
        source_url: article.url,
        confirmed_at: article.date || null,
      });
    }
  }

  return spots;
}

function guessStatus(text) {
  if (/解禁|オープン|再開|釣り可能|開放/.test(text)) return '解禁';
  if (/立入禁止|立ち入り禁止/.test(text)) return '立入禁止';
  if (/閉鎖/.test(text)) return '閉鎖';
  if (/通行禁止|進入禁止/.test(text)) return '車両進入禁止';
  if (/釣り禁止|釣禁/.test(text)) return '釣り禁止';
  return '要注意';
}

function guessStatusFromContext(context) {
  // 箇条書きスポットの周辺文脈からステータス推定
  return guessStatus(context);
}

function guessPrefecture(name, context) {
  const combined = name + ' ' + (context || '');
  if (/淡路/.test(combined)) return '兵庫県';
  if (/兵庫|神戸|明石|西宮|芦屋|姫路|加古川|高砂|赤穂|相生|たつの|洲本|南あわじ/.test(combined)) return '兵庫県';
  if (/大阪|堺|岸和田|貝塚|泉南|泉佐野|阪南|岬町|南港|舞洲|りんくう/.test(combined)) return '大阪府';
  if (/和歌山|海南|有田|御坊|田辺|白浜|串本|新宮|勝浦|太地/.test(combined)) return '和歌山県';
  if (/京都|舞鶴|宮津|伊根|丹後|天橋立/.test(combined)) return '京都府';
  return '';
}

// ============================================================
// Step 4: DB追記
// ============================================================

function insertToDb(spots, scrapedAt) {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // prepared statements
  const findExisting = db.prepare(
    'SELECT id, status, confirmed_at FROM spot_regulations WHERE spot_name = ? AND status = ?'
  );
  const findByName = db.prepare(
    'SELECT id, status, confirmed_at FROM spot_regulations WHERE spot_name = ?'
  );
  const markOld = db.prepare(
    'UPDATE spot_regulations SET is_current = 0 WHERE spot_name = ? AND is_current = 1'
  );
  const insertReg = db.prepare(`
    INSERT INTO spot_regulations
      (spot_id, spot_name, prefecture, status, reason, source_url, source_name, reliability, confirmed_at, is_current)
    VALUES (@spot_id, @spot_name, @prefecture, @status, @reason, @source_url, @source_name, @reliability, @confirmed_at, @is_current)
  `);
  const findSpot = db.prepare(
    'SELECT id, name FROM spots WHERE name = ? OR name LIKE ? LIMIT 1'
  );
  const insertLog = db.prepare(`
    INSERT INTO scraping_logs (source, url, status, records_found, records_new, scraped_at)
    VALUES (@source, @url, @status, @records_found, @records_new, @scraped_at)
  `);

  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  const tx = db.transaction(() => {
    for (const s of spots) {
      // 重複チェック: 同じ spot_name + status
      const dup = findExisting.get(s.name, s.status);
      if (dup) {
        skippedCount++;
        continue;
      }

      // 状態変化チェック: 同スポットで別ステータスがある場合
      const prev = findByName.get(s.name);
      if (prev && prev.status !== s.status) {
        // 古いレコードを is_current=0 に
        markOld.run(s.name);
        updatedCount++;
      }

      // spots テーブルとの名寄せ
      const cleanName = s.name.replace(/[（(][^）)]*[）)]/g, '').trim();
      const matchedSpot = findSpot.get(cleanName, cleanName + '%');
      const spotId = matchedSpot ? matchedSpot.id : null;

      const prefecture = s.prefecture || guessPrefecture(s.name, s.source_text || '');

      insertReg.run({
        spot_id: spotId,
        spot_name: s.name,
        prefecture,
        status: s.status,
        reason: s.reason || null,
        source_url: s.source_url || null,
        source_name: 'D-ANGLERS',
        reliability: '高',
        confirmed_at: s.confirmed_at || null,
        is_current: 1,
      });
      newCount++;

      if (matchedSpot) {
        console.log(`    DB: ${s.name} → spots.${matchedSpot.name} (id=${matchedSpot.id}) [${s.status}]`);
      } else {
        console.log(`    DB: ${s.name} [${s.status}] (spot_id=NULL)`);
      }
    }

    // スクレイピングログ
    insertLog.run({
      source: 'D-ANGLERS-v2',
      url: BLOG_BASE,
      status: 'success',
      records_found: spots.length,
      records_new: newCount,
      scraped_at: scrapedAt,
    });
  });

  tx();

  // 結果サマリー
  const result = { newCount, updatedCount, skippedCount };

  // 現在の規制一覧
  const currentRegs = db.prepare(`
    SELECT r.spot_name, r.prefecture, r.status, r.reason, r.confirmed_at, r.source_url,
           s.name AS matched_spot
    FROM spot_regulations r
    LEFT JOIN spots s ON s.id = r.spot_id
    WHERE r.is_current = 1
    ORDER BY r.status, r.spot_name
  `).all();

  result.currentRegs = currentRegs;

  const totalRegs = db.prepare('SELECT COUNT(*) as cnt FROM spot_regulations').get().cnt;
  const currentCount = db.prepare('SELECT COUNT(*) as cnt FROM spot_regulations WHERE is_current = 1').get().cnt;
  result.totalRegs = totalRegs;
  result.currentCount = currentCount;

  db.close();
  return result;
}

// ============================================================
// メイン
// ============================================================

async function main() {
  console.log('D-ANGLERS スクレイピング v2（全記事網羅スキャン）');
  console.log('='.repeat(55));

  const scrapedAt = new Date().toISOString();

  // Step 1: 全記事URL収集
  const articlesMap = await collectAllArticles();
  const totalArticles = articlesMap.size;

  // Step 2 & 3: 各記事をスキャンしてスポット抽出
  console.log('\n=== 記事スキャン ===');
  const allSpots = [];
  const relatedArticles = [];
  let scanned = 0;
  let errors = 0;

  for (const [url, meta] of articlesMap) {
    scanned++;
    try {
      await sleep(RATE_LIMIT_MS);
      const result = await scanArticle(url);

      if (result.hasBanInfo) {
        console.log(`  [${scanned}/${totalArticles}] ★ ${result.title}`);
        console.log(`    キーワード: ${result.matchedKeywords.join(', ')}`);
        relatedArticles.push({
          title: result.title,
          date: result.date,
          url: result.url,
          keywords: result.matchedKeywords,
        });

        // スポット抽出
        const extracted = extractSpots(result);
        for (const s of extracted) {
          s.prefecture = guessPrefecture(s.name, result.bodyText);
          // 全体での重複チェック
          if (!allSpots.find(x => x.name === s.name && x.status === s.status)) {
            allSpots.push(s);
            console.log(`    → ${s.name} [${s.status}]`);
          }
        }
      } else {
        console.log(`  [${scanned}/${totalArticles}]   ${result.title || meta.title}: -`);
      }
    } catch (err) {
      console.error(`  [${scanned}/${totalArticles}] ERROR: ${url} - ${err.message}`);
      errors++;
    }
  }

  // Step 4: DB追記
  console.log('\n=== DB追記 ===');
  const dbResult = insertToDb(allSpots, scrapedAt);

  // Step 5: 結果出力
  console.log('\n' + '='.repeat(55));
  console.log('=== 結果サマリー ===');
  console.log(`  総記事数:           ${totalArticles}`);
  console.log(`  関連記事数:         ${relatedArticles.length}`);
  console.log(`  エラー数:           ${errors}`);
  console.log(`  抽出スポット数:     ${allSpots.length}`);
  console.log(`  新規INSERT:         ${dbResult.newCount}`);
  console.log(`  状態変化UPDATE:     ${dbResult.updatedCount}`);
  console.log(`  重複スキップ:       ${dbResult.skippedCount}`);
  console.log(`  spot_regulations計: ${dbResult.totalRegs}`);

  console.log(`\n--- 現在の規制スポット一覧 (is_current=1: ${dbResult.currentCount}件) ---`);
  for (const r of dbResult.currentRegs) {
    const matched = r.matched_spot ? ` → spots.${r.matched_spot}` : '';
    const date = r.confirmed_at ? ` (${r.confirmed_at.slice(0, 10)})` : '';
    console.log(`  [${r.status}] ${r.prefecture || '?'} ${r.spot_name}${matched}${date}`);
    if (r.reason) console.log(`    理由: ${r.reason}`);
  }

  console.log('\n--- 関連記事一覧 ---');
  for (const a of relatedArticles) {
    console.log(`  ${a.date ? a.date.slice(0, 10) : '?'} ${a.title}`);
    console.log(`    ${a.url}`);
  }

  // d-anglers-updates.json も更新
  const updatesOutput = {
    articles: relatedArticles,
    total: relatedArticles.length,
    scraped_at: scrapedAt,
    keywords_used: BAN_KEYWORDS,
  };
  fs.writeFileSync('./d-anglers-updates.json', JSON.stringify(updatesOutput, null, 2));
  console.log(`\n出力: d-anglers-updates.json (${relatedArticles.length}件)`);

  console.log('\n完了');
}

main().catch(console.error);
