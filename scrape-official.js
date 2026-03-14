#!/usr/bin/env node
/**
 * scrape-official.js
 *
 * 府県公式サイトから釣り禁止・立入禁止区域情報を取得し
 * fishing-spots.db の spot_regulations に追記する。
 *
 * 使い方: node scrape-official.js
 * 依存: cheerio, better-sqlite3
 */

const cheerio = require('cheerio');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'fishing-spots.db');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const RATE_LIMIT_MS = 1500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url) {
  console.log(`  Fetching: ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.text();
}

// ============================================================
// 1. 大阪市 港湾施設 立入禁止区域
// ============================================================

async function scrapeOsakaCity() {
  const url = 'https://www.city.osaka.lg.jp/port/page/0000062374.html';
  const sourceName = '大阪市港湾局';
  const spots = [];

  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);
    const text = $('body').text();

    // 本文からスポット名を抽出
    // パターン: 施設種別 + 名前 + (所在地)
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    // 具体的な施設名を正規表現で抽出
    const facilityPatterns = [
      // 「○○防波堤」「○○波除堤」「○○護岸」パターン
      /([^\s（()、,]+(?:防波堤|波除堤|護岸|埋立護岸)(?:の一部)?)/g,
    ];

    const seen = new Set();
    for (const line of lines) {
      for (const pattern of facilityPatterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(line)) !== null) {
          let name = match[1].trim();
          // ノイズ除去
          if (name.length < 3 || name.length > 30) continue;
          if (/施設条例|^港湾|^立入/.test(name)) continue;
          // 重複チェック
          if (seen.has(name)) continue;
          seen.add(name);

          // 所在地抽出（同じ行内の括弧内）
          const locMatch = line.match(/[（(]([^）)]+区[^）)]*)[）)]/);
          const location = locMatch ? locMatch[1] : '';

          spots.push({
            name,
            prefecture: '大阪府',
            status: '立入禁止',
            reason: '大阪市港湾施設条例第10条第1項第4号',
            source_url: url,
            source_name: sourceName,
            notes: location ? `所在地: ${location}` : '',
          });
        }
      }
    }

    // テーブル要素からも抽出を試みる
    $('table tr').each((_, row) => {
      const cells = $(row).find('td, th');
      if (cells.length >= 1) {
        const cellText = cells.first().text().trim();
        for (const pattern of facilityPatterns) {
          let match;
          pattern.lastIndex = 0;
          while ((match = pattern.exec(cellText)) !== null) {
            const name = match[1].trim();
            if (name.length >= 3 && name.length <= 30 && !seen.has(name)) {
              if (/施設条例|^港湾|^立入/.test(name)) continue;
              seen.add(name);
              const locCell = cells.length >= 2 ? cells.eq(1).text().trim() : '';
              spots.push({
                name,
                prefecture: '大阪府',
                status: '立入禁止',
                reason: '大阪市港湾施設条例第10条第1項第4号',
                source_url: url,
                source_name: sourceName,
                notes: locCell ? `所在地: ${locCell}` : '',
              });
            }
          }
        }
      }
    });

    // リスト要素からも抽出
    $('li, dt, dd').each((_, el) => {
      const elText = $(el).text().trim();
      for (const pattern of facilityPatterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(elText)) !== null) {
          const name = match[1].trim();
          if (name.length >= 3 && name.length <= 30 && !seen.has(name)) {
            if (/施設条例|^港湾|^立入/.test(name)) continue;
            seen.add(name);
            spots.push({
              name,
              prefecture: '大阪府',
              status: '立入禁止',
              reason: '大阪市港湾施設条例第10条第1項第4号',
              source_url: url,
              source_name: sourceName,
              notes: '',
            });
          }
        }
      }
    });

    console.log(`  → ${spots.length}件の施設を抽出`);
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }

  return { url, sourceName, spots };
}

// ============================================================
// 2. 大阪府 採捕禁止区域（関西国際空港周辺）
// ============================================================

async function scrapeOsakaPref() {
  const url = 'https://www.pref.osaka.lg.jp/o120130/suisan/ru-ru/kuiki.html';
  const sourceName = '大阪府水産課';
  const spots = [];

  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);
    const text = $('body').text();

    // 関西国際空港周辺の採捕禁止区域
    if (text.includes('関西国際空港') || text.includes('採捕禁止')) {
      spots.push({
        name: '関西国際空港島周辺海域',
        prefecture: '大阪府',
        status: '釣り禁止',
        reason: '大阪府漁業調整規則による採捕禁止区域',
        source_url: url,
        source_name: sourceName,
        notes: '9座標点で囲まれた海域全域。違反時は6ヶ月以下の懲役または10万円以下の罰金',
      });
      console.log(`  → 関西国際空港島周辺海域を抽出`);
    } else {
      console.log(`  → 採捕禁止区域の記載なし`);
    }
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }

  return { url, sourceName, spots };
}

// ============================================================
// 3. 兵庫県 遊漁ルール
// ============================================================

async function scrapeHyogo() {
  const url = 'https://web.pref.hyogo.lg.jp/nk16/af18_000000002.html';
  const sourceName = '兵庫県水産漁港課';
  const spots = [];

  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);
    const text = $('body').text();

    // 具体的な場所名を含む禁止情報を検索
    const banPatterns = [
      /(?:立入禁止|釣り禁止|閉鎖)[^。]*?([^\s、。]+(?:港|漁港|堤防|護岸|埠頭|浜))/g,
      /([^\s、。]+(?:港|漁港|堤防|護岸|埠頭|浜))[^。]*?(?:立入禁止|釣り禁止|閉鎖)/g,
    ];

    for (const pattern of banPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1].trim();
        if (name.length >= 2 && name.length <= 20) {
          spots.push({
            name,
            prefecture: '兵庫県',
            status: '釣り禁止',
            reason: '',
            source_url: url,
            source_name: sourceName,
            notes: '',
          });
        }
      }
    }

    console.log(`  → ${spots.length}件（具体的な場所名の記載${spots.length === 0 ? 'なし' : 'あり'}）`);
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }

  return { url, sourceName, spots };
}

// ============================================================
// 4. 和歌山県 遊漁ルール
// ============================================================

async function scrapeWakayama() {
  const url = 'https://www.pref.wakayama.lg.jp/prefg/071500/yuugyo/sensuiki/ru-ru.html';
  const sourceName = '和歌山県資源管理課';
  const spots = [];

  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);
    const text = $('body').text();

    const banPatterns = [
      /(?:立入禁止|釣り禁止|閉鎖)[^。]*?([^\s、。]+(?:港|漁港|堤防|護岸|埠頭|浜))/g,
      /([^\s、。]+(?:港|漁港|堤防|護岸|埠頭|浜))[^。]*?(?:立入禁止|釣り禁止|閉鎖)/g,
    ];

    for (const pattern of banPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1].trim();
        if (name.length >= 2 && name.length <= 20) {
          spots.push({
            name,
            prefecture: '和歌山県',
            status: '釣り禁止',
            reason: '',
            source_url: url,
            source_name: sourceName,
            notes: '',
          });
        }
      }
    }

    console.log(`  → ${spots.length}件（具体的な場所名の記載${spots.length === 0 ? 'なし' : 'あり'}）`);
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }

  return { url, sourceName, spots };
}

// ============================================================
// 5. 京都府 魚釣りのルール
// ============================================================

async function scrapeKyoto() {
  const url = 'https://www.pref.kyoto.jp/suiji/12400023.html';
  const sourceName = '京都府水産課';
  const spots = [];

  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);
    const text = $('body').text();

    const banPatterns = [
      /(?:立入禁止|釣り禁止|閉鎖)[^。]*?([^\s、。]+(?:港|漁港|堤防|護岸|埠頭|浜))/g,
      /([^\s、。]+(?:港|漁港|堤防|護岸|埠頭|浜))[^。]*?(?:立入禁止|釣り禁止|閉鎖)/g,
    ];

    for (const pattern of banPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1].trim();
        if (name.length >= 2 && name.length <= 20) {
          spots.push({
            name,
            prefecture: '京都府',
            status: '釣り禁止',
            reason: '',
            source_url: url,
            source_name: sourceName,
            notes: '',
          });
        }
      }
    }

    console.log(`  → ${spots.length}件（具体的な場所名の記載${spots.length === 0 ? 'なし' : 'あり'}）`);
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }

  return { url, sourceName, spots };
}

// ============================================================
// DB追記
// ============================================================

function insertToDb(results, scrapedAt) {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const findDup = db.prepare(
    'SELECT id FROM spot_regulations WHERE spot_name = ? AND status = ? AND source_name = ?'
  );
  const findSpot = db.prepare(
    'SELECT id, name FROM spots WHERE name = ? OR name LIKE ? LIMIT 1'
  );
  const insertReg = db.prepare(`
    INSERT INTO spot_regulations
      (spot_id, spot_name, prefecture, status, reason, source_url, source_name, reliability, confirmed_at, is_current)
    VALUES (@spot_id, @spot_name, @prefecture, @status, @reason, @source_url, @source_name, @reliability, @confirmed_at, @is_current)
  `);
  const insertLog = db.prepare(`
    INSERT INTO scraping_logs (source, url, status, records_found, records_new, scraped_at)
    VALUES (@source, @url, @status, @records_found, @records_new, @scraped_at)
  `);

  let totalNew = 0;
  let totalSkipped = 0;

  const tx = db.transaction(() => {
    for (const result of results) {
      let newCount = 0;
      let skipped = 0;

      for (const s of result.spots) {
        // 重複チェック
        if (findDup.get(s.name, s.status, s.source_name)) {
          skipped++;
          continue;
        }

        // 名寄せ
        const cleanName = s.name.replace(/[（(][^）)]*[）)]/g, '').trim();
        const matched = findSpot.get(cleanName, cleanName + '%');
        const spotId = matched ? matched.id : null;

        insertReg.run({
          spot_id: spotId,
          spot_name: s.name,
          prefecture: s.prefecture,
          status: s.status,
          reason: s.reason || null,
          source_url: s.source_url,
          source_name: s.source_name,
          reliability: '確定',
          confirmed_at: scrapedAt,
          is_current: 1,
        });
        newCount++;

        const matchInfo = matched ? ` → spots.${matched.name}` : '';
        console.log(`  INSERT: ${s.name} [${s.status}]${matchInfo}`);
      }

      // ログ記録
      insertLog.run({
        source: result.sourceName,
        url: result.url,
        status: result.spots.length > 0 ? 'success' : 'skip',
        records_found: result.spots.length,
        records_new: newCount,
        scraped_at: scrapedAt,
      });

      totalNew += newCount;
      totalSkipped += skipped;
      console.log(`  ${result.sourceName}: ${newCount}件INSERT, ${skipped}件スキップ`);
    }
  });

  tx();

  // 最終確認
  const totalRegs = db.prepare('SELECT COUNT(*) as cnt FROM spot_regulations').get().cnt;
  const currentRegs = db.prepare('SELECT COUNT(*) as cnt FROM spot_regulations WHERE is_current = 1').get().cnt;

  console.log(`\n--- spot_regulations ---`);
  console.log(`  総レコード数: ${totalRegs}`);
  console.log(`  is_current=1: ${currentRegs}`);

  // is_current=1 の一覧
  const allCurrent = db.prepare(`
    SELECT r.spot_name, r.prefecture, r.status, r.source_name, r.reliability,
           s.name AS matched_spot
    FROM spot_regulations r
    LEFT JOIN spots s ON s.id = r.spot_id
    WHERE r.is_current = 1
    ORDER BY r.source_name, r.prefecture, r.spot_name
  `).all();

  console.log(`\n--- 現在有効な規制一覧 (is_current=1) ---`);
  let lastSource = '';
  for (const r of allCurrent) {
    if (r.source_name !== lastSource) {
      console.log(`\n  [${r.source_name}] (信頼度: ${r.reliability})`);
      lastSource = r.source_name;
    }
    const match = r.matched_spot ? ` → spots.${r.matched_spot}` : '';
    console.log(`    [${r.status}] ${r.prefecture} ${r.spot_name}${match}`);
  }

  db.close();
  return { totalNew, totalSkipped };
}

// ============================================================
// メイン
// ============================================================

async function main() {
  console.log('府県公式サイト スクレイピング');
  console.log('='.repeat(50));

  const scrapedAt = new Date().toISOString();
  const results = [];

  // 各サイトをスクレイピング
  const scrapers = [
    { name: '大阪市港湾局', fn: scrapeOsakaCity },
    { name: '大阪府水産課', fn: scrapeOsakaPref },
    { name: '兵庫県水産漁港課', fn: scrapeHyogo },
    { name: '和歌山県資源管理課', fn: scrapeWakayama },
    { name: '京都府水産課', fn: scrapeKyoto },
  ];

  for (const s of scrapers) {
    console.log(`\n=== ${s.name} ===`);
    const result = await s.fn();
    results.push(result);
    await sleep(RATE_LIMIT_MS);
  }

  // DB追記
  console.log('\n=== DB追記 ===');
  const { totalNew, totalSkipped } = insertToDb(results, scrapedAt);

  // サマリー
  console.log('\n' + '='.repeat(50));
  console.log('=== サマリー ===');
  for (const r of results) {
    console.log(`  ${r.sourceName}: ${r.spots.length}件抽出`);
  }
  console.log(`  新規INSERT合計: ${totalNew}`);
  console.log(`  重複スキップ: ${totalSkipped}`);

  console.log('\n完了');
}

main().catch(console.error);
