#!/usr/bin/env node
/**
 * generate-regulation-data.js
 *
 * fishing-spots.db から規制情報を読み込み、
 * tide-pwa-online/js/regulation-data.js を生成する。
 *
 * 使い方: node generate-regulation-data.js
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'fishing-spots.db');
const OUT_PATH = path.join(__dirname, 'tide-pwa-online', 'js', 'regulation-data.js');

function main() {
  const db = new Database(DB_PATH, { readonly: true });

  // ① 完全除外（釣り禁止/立入禁止/閉鎖 + is_active=0）
  const banned = db.prepare(`
    SELECT DISTINCT s.id
    FROM spots s
    LEFT JOIN spot_regulations r ON r.spot_id = s.id
    WHERE s.is_active = 0
       OR (r.is_current = 1
       AND r.status IN ('釣り禁止', '立入禁止', '閉鎖'))
  `).all().map(r => r.id);

  // ② 要注意（要注意/車両進入禁止）
  const caution = db.prepare(`
    SELECT DISTINCT spot_id
    FROM spot_regulations
    WHERE is_current = 1
      AND spot_id IS NOT NULL
      AND status IN ('要注意', '車両進入禁止')
  `).all().map(r => r.spot_id);

  // ③ エリア警告（大阪港湾エリアのspots）
  const areaWarning = db.prepare(`
    SELECT DISTINCT id
    FROM spots
    WHERE prefecture = '大阪府'
      AND (
        name LIKE '%夢洲%' OR name LIKE '%舞洲%' OR
        name LIKE '%南港%' OR name LIKE '%鶴浜%' OR
        name LIKE '%平林%' OR name LIKE '%咲洲%' OR
        name LIKE '%北港%'
      )
  `).all().map(r => r.id);

  // banned と重複する areaWarning / caution は除外
  const areaWarningFiltered = areaWarning.filter(id => !banned.includes(id));
  const cautionFiltered = caution.filter(id => !banned.includes(id));

  // spot名の詳細も取得して表示用
  const getNames = (ids) => {
    if (ids.length === 0) return [];
    return db.prepare(
      `SELECT id, name FROM spots WHERE id IN (${ids.join(',')})`
    ).all();
  };

  const bannedNames = getNames(banned);
  const cautionNames = getNames(cautionFiltered);
  const areaWarningNames = getNames(areaWarningFiltered);

  db.close();

  // PORTS配列のインデックス(0-based)に変換
  // spots.id は 1-based AUTOINCREMENT、PORTS配列は 0-based
  // spots.id=1 → PORTS[0] なので index = id - 1
  // ただし重複スキップで id と index がずれる可能性あるため
  // ports-data.js を読み込んで名前ベースでマッチング
  const portsFile = path.join(__dirname, 'tide-pwa-online', 'js', 'ports-data.js');
  const portsSrc = fs.readFileSync(portsFile, 'utf-8');
  const portsMatch = portsSrc.match(/const PORTS\s*=\s*\[([\s\S]*?)\];/);
  const portNames = [];
  if (portsMatch) {
    for (const line of portsMatch[1].split('\n')) {
      const m = line.match(/^\s*\["([^"]+)"/);
      if (m) portNames.push(m[1]);
    }
  }

  // spot名 → PORTSインデックス
  function nameToIndex(spotName) {
    const idx = portNames.indexOf(spotName);
    return idx >= 0 ? idx : -1;
  }

  const bannedIndices = bannedNames.map(s => nameToIndex(s.name)).filter(i => i >= 0);
  const cautionIndices = cautionNames.map(s => nameToIndex(s.name)).filter(i => i >= 0);
  const areaWarningIndices = areaWarningNames.map(s => nameToIndex(s.name)).filter(i => i >= 0);

  // JS出力
  const output = `// regulation-data.js (自動生成 - 手動編集不可)
// 生成日時: ${new Date().toISOString()}
// ソース: fishing-spots.db
//
// banned:      釣り禁止/立入禁止/閉鎖 → ランキングから除外
// caution:     要注意/車両進入禁止 → 警告マーク表示
// areaWarning: 大阪港湾エリア → 注意マーク表示
const REGULATION_DATA = {
  banned: [${bannedIndices.join(', ')}],
  caution: [${cautionIndices.join(', ')}],
  areaWarning: [${areaWarningIndices.join(', ')}]
};
`;

  fs.writeFileSync(OUT_PATH, output);
  console.log(`出力: ${OUT_PATH}`);

  // 詳細表示
  console.log('\n=== banned (完全除外) ===');
  for (const s of bannedNames) {
    const idx = nameToIndex(s.name);
    console.log(`  PORTS[${idx}] ${s.name} (spots.id=${s.id})${idx < 0 ? ' ← PORTSに未登録' : ''}`);
  }

  console.log('\n=== caution (要注意) ===');
  for (const s of cautionNames) {
    const idx = nameToIndex(s.name);
    console.log(`  PORTS[${idx}] ${s.name} (spots.id=${s.id})${idx < 0 ? ' ← PORTSに未登録' : ''}`);
  }

  console.log('\n=== areaWarning (エリア警告) ===');
  for (const s of areaWarningNames) {
    const idx = nameToIndex(s.name);
    console.log(`  PORTS[${idx}] ${s.name} (spots.id=${s.id})${idx < 0 ? ' ← PORTSに未登録' : ''}`);
  }

  console.log(`\n配列サイズ: banned=${bannedIndices.length}, caution=${cautionIndices.length}, areaWarning=${areaWarningIndices.length}`);
}

main();
