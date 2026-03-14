#!/usr/bin/env node
/**
 * import-ports.js
 * ports-data.js の全スポットを spots テーブルにインポート
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'fishing-spots.db');
const PORTS_FILE = path.join(__dirname, 'tide-pwa-online', 'js', 'ports-data.js');

// ports-data.js を読み込んでPORTS配列を抽出
function loadPorts() {
  const src = fs.readFileSync(PORTS_FILE, 'utf-8');

  // PORTS配列を抽出（const PORTS = [...]; のブロック）
  const match = src.match(/const PORTS\s*=\s*\[([\s\S]*?)\];/);
  if (!match) throw new Error('PORTS配列が見つかりません');

  // 各行の配列リテラルを抽出
  const lines = match[1].split('\n');
  const ports = [];

  for (const line of lines) {
    const m = line.match(/^\s*\[(.+)\]\s*,?\s*$/);
    if (!m) continue;

    // CSV風に分割（文字列リテラル内のカンマを考慮）
    const fields = [];
    let current = '';
    let inStr = false;
    let strChar = '';
    for (const ch of m[1]) {
      if (inStr) {
        if (ch === strChar) { inStr = false; }
        current += ch;
      } else {
        if (ch === '"' || ch === "'") { inStr = true; strChar = ch; current += ch; }
        else if (ch === ',') { fields.push(current.trim()); current = ''; }
        else { current += ch; }
      }
    }
    fields.push(current.trim());

    // フィールド: [name, city, prefKey, lat, lon, ref1, ref2, weight, forecastArea, forecastSub, facing, shelter, type]
    if (fields.length >= 13) {
      const strip = s => s.replace(/^["']|["']$/g, '');
      const parseNum = s => { const n = parseFloat(s); return isNaN(n) ? null : n; };
      const parseStr = s => { const v = strip(s); return v === 'null' ? null : v; };

      ports.push({
        name: strip(fields[0]),
        city: strip(fields[1]),
        prefKey: strip(fields[2]),
        lat: parseNum(fields[3]),
        lon: parseNum(fields[4]),
        facing: parseNum(fields[10]),
        shelter: parseNum(fields[11]),
        type: parseStr(fields[12]),
      });
    }
  }

  return ports;
}

// prefKey → 府県名
const PREF_MAP = {
  wakayama: '和歌山県',
  osaka: '大阪府',
  kyoto: '京都府',
  hyogo: '兵庫県',
};

function importPorts() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const ports = loadPorts();
  console.log(`ports-data.js から ${ports.length} スポット読み込み`);

  const insert = db.prepare(`
    INSERT INTO spots (name, prefecture, lat, lon, spot_type, facing, shelter)
    VALUES (@name, @prefecture, @lat, @lon, @spot_type, @facing, @shelter)
  `);

  const existing = db.prepare('SELECT id FROM spots WHERE name = ? AND prefecture = ?');

  let inserted = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    for (const p of ports) {
      const prefecture = PREF_MAP[p.prefKey] || p.prefKey;

      // 重複チェック
      if (existing.get(p.name, prefecture)) {
        skipped++;
        continue;
      }

      insert.run({
        name: p.name,
        prefecture,
        lat: p.lat,
        lon: p.lon,
        spot_type: p.type,
        facing: p.facing,
        shelter: p.shelter,
      });
      inserted++;
    }
  });

  tx();

  console.log(`INSERT: ${inserted}件, スキップ（重複）: ${skipped}件`);

  // 確認
  const count = db.prepare('SELECT COUNT(*) as cnt FROM spots').get();
  console.log(`spots テーブル総件数: ${count.cnt}`);

  const byPref = db.prepare('SELECT prefecture, COUNT(*) as cnt FROM spots GROUP BY prefecture ORDER BY cnt DESC').all();
  console.log('府県別:');
  for (const r of byPref) console.log(`  ${r.prefecture}: ${r.cnt}`);

  const byType = db.prepare('SELECT spot_type, COUNT(*) as cnt FROM spots GROUP BY spot_type ORDER BY cnt DESC').all();
  console.log('種別:');
  for (const r of byType) console.log(`  ${r.spot_type}: ${r.cnt}`);

  db.close();
}

importPorts();
