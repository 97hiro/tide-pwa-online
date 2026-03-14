#!/usr/bin/env node
/**
 * import-regulations.js
 * d-anglers-banned.json を spot_regulations テーブルにインポート
 * spots テーブルとの名寄せも実施
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'fishing-spots.db');
const BANNED_FILE = path.join(__dirname, 'd-anglers-banned.json');

function importRegulations() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // d-anglers-banned.json 読み込み
  const data = JSON.parse(fs.readFileSync(BANNED_FILE, 'utf-8'));
  console.log(`d-anglers-banned.json: ${data.spots.length}件`);

  const insertReg = db.prepare(`
    INSERT INTO spot_regulations
      (spot_id, spot_name, prefecture, status, reason, source_url, source_name, reliability, confirmed_at, is_current)
    VALUES
      (@spot_id, @spot_name, @prefecture, @status, @reason, @source_url, @source_name, @reliability, @confirmed_at, @is_current)
  `);

  // 重複チェック
  const existingReg = db.prepare(
    'SELECT id FROM spot_regulations WHERE spot_name = ? AND source_url = ?'
  );

  // spots テーブルとの名寄せ（部分一致・前方一致）
  const findSpot = db.prepare(
    'SELECT id, name FROM spots WHERE name = ? OR name LIKE ? LIMIT 1'
  );

  const insertLog = db.prepare(`
    INSERT INTO scraping_logs (source, url, status, records_found, records_new)
    VALUES (@source, @url, @status, @records_found, @records_new)
  `);

  let inserted = 0;
  let skipped = 0;
  let matched = 0;

  const tx = db.transaction(() => {
    for (const spot of data.spots) {
      // 重複チェック
      if (existingReg.get(spot.name, spot.source_url)) {
        skipped++;
        continue;
      }

      // spots テーブルとの名寄せ
      // 「岩屋港（一部）」→「岩屋港」のように括弧を除去して検索
      const cleanName = spot.name.replace(/[（(][^）)]*[）)]/g, '').trim();
      const matchedSpot = findSpot.get(cleanName, cleanName + '%');
      const spotId = matchedSpot ? matchedSpot.id : null;

      if (matchedSpot) {
        console.log(`  名寄せ: ${spot.name} → spots.${matchedSpot.name} (id=${matchedSpot.id})`);
        matched++;
      } else {
        console.log(`  未マッチ: ${spot.name} (spot_id=NULL)`);
      }

      // 府県名を正規化（「兵庫」→「兵庫県」等）
      let prefecture = spot.prefecture || '';
      if (prefecture && !prefecture.endsWith('県') && !prefecture.endsWith('府') && !prefecture.endsWith('島')) {
        if (prefecture === '大阪') prefecture = '大阪府';
        else if (prefecture === '京都') prefecture = '京都府';
        else prefecture += '県';
      }

      insertReg.run({
        spot_id: spotId,
        spot_name: spot.name,
        prefecture,
        status: spot.status,
        reason: spot.reason || null,
        source_url: spot.source_url || null,
        source_name: 'D-ANGLERS',
        reliability: '高',
        confirmed_at: spot.scraped_at || null,
        is_current: 1,
      });
      inserted++;
    }

    // スクレイピングログ記録
    insertLog.run({
      source: 'D-ANGLERS',
      url: 'https://ameblo.jp/d-anglers/',
      status: 'success',
      records_found: data.spots.length,
      records_new: inserted,
    });
  });

  tx();

  console.log(`\nINSERT: ${inserted}件, スキップ（重複）: ${skipped}件, 名寄せ成功: ${matched}件`);

  // ===== 動作確認クエリ =====
  console.log('\n===== 動作確認 =====');

  // 現在釣り禁止のスポット一覧
  console.log('\n--- 現在規制中のスポット ---');
  const regulated = db.prepare(`
    SELECT s.name AS spot_name, s.prefecture AS spot_pref,
           r.spot_name AS reg_name, r.prefecture AS reg_pref,
           r.status, r.reason, r.confirmed_at
    FROM spot_regulations r
    LEFT JOIN spots s ON s.id = r.spot_id
    WHERE r.is_current = 1 AND r.status != '解禁'
    ORDER BY r.confirmed_at DESC
  `).all();

  for (const r of regulated) {
    const name = r.spot_name || r.reg_name;
    const pref = r.spot_pref || r.reg_pref;
    console.log(`  [${r.status}] ${pref} ${name}`);
    if (r.reason) console.log(`    理由: ${r.reason}`);
  }

  // 規制履歴があるスポット数
  const regCount = db.prepare('SELECT COUNT(DISTINCT spot_id) as cnt FROM spot_regulations WHERE spot_id IS NOT NULL').get();
  console.log(`\n規制履歴のあるスポット数（名寄せ済み）: ${regCount.cnt}`);

  // spots テーブルの総件数
  const spotsCount = db.prepare('SELECT COUNT(*) as cnt FROM spots').get();
  console.log(`spots テーブル総件数: ${spotsCount.cnt}`);

  // spot_regulations 総件数
  const regsTotal = db.prepare('SELECT COUNT(*) as cnt FROM spot_regulations').get();
  console.log(`spot_regulations 総件数: ${regsTotal.cnt}`);

  db.close();
}

importRegulations();
