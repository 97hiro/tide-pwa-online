// apply-osaka-coords.js
// osaka-coords-scraped.csv の座標を ports-data.js に反映する
// 高信頼(tsuriba.info)はそのまま、中信頼(nominatim等)は「要確認」コメント付き

const fs = require('fs');

// CSV読み込み
const csvText = fs.readFileSync('osaka-coords-scraped.csv', 'utf8').replace(/^\uFEFF/, '');
const lines = csvText.trim().split('\n').slice(1); // ヘッダー除去

const updates = [];
for (const line of lines) {
  // CSVパース: スポット名,緯度,経度,"ソースURL"
  const m = line.match(/^([^,]+),([^,]*),([^,]*),(.*)$/);
  if (!m) continue;
  const name = m[1].trim();
  const lat = m[2].trim();
  const lon = m[3].trim();
  const source = m[4].replace(/^"|"$/g, '').trim();
  if (!lat || !lon || source === '未取得') continue;

  const trust = source.includes('tsuriba.info') ? 'high'
    : source.includes('xn--u9jwc') ? 'medium'
    : source.includes('nominatim') ? 'medium'
    : 'medium';

  updates.push({
    name,
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    source,
    trust
  });
}

console.log(`CSV から ${updates.length} 件の座標データ読み込み`);
console.log(`  高信頼(tsuriba.info): ${updates.filter(u => u.trust === 'high').length} 件`);
console.log(`  中信頼(nominatim等): ${updates.filter(u => u.trust === 'medium').length} 件\n`);

// ports-data.js 読み込み
const portsPath = 'tide-pwa-online/js/ports-data.js';
let portsData = fs.readFileSync(portsPath, 'utf8');

const unchanged = [];
const applied = [];
const notFound = [];

for (const upd of updates) {
  // ports-data.js 内でスポット名を検索
  // 形式: ["スポット名","市区町村","osaka",緯度,経度,
  // とっとパーク小島 は特殊名なので完全一致
  const escapedName = upd.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `(\\["${escapedName}","[^"]*","osaka",)(\\d+\\.\\d+),(\\d+\\.\\d+),`
  );

  const match = portsData.match(regex);
  if (!match) {
    notFound.push(upd.name);
    continue;
  }

  const oldLat = parseFloat(match[2]);
  const oldLon = parseFloat(match[3]);

  // 座標を小数点4桁に丸め (ports-data.jsの既存フォーマットに合わせる)
  const newLat = Math.round(upd.lat * 10000) / 10000;
  const newLon = Math.round(upd.lon * 10000) / 10000;

  // 変化チェック
  if (Math.abs(oldLat - newLat) < 0.0001 && Math.abs(oldLon - newLon) < 0.0001) {
    unchanged.push({ name: upd.name, lat: oldLat, lon: oldLon });
    continue;
  }

  // 置換文字列を構築
  let replacement;
  if (upd.trust === 'high') {
    replacement = `${match[1]}${newLat},${newLon},`;
  } else {
    // 中信頼: 行末に要確認コメントを追加
    // まず座標だけ置換
    replacement = `${match[1]}${newLat},${newLon},`;
  }

  portsData = portsData.replace(match[0], replacement);

  // 中信頼の場合、行全体に要確認コメントを追加
  if (upd.trust === 'medium') {
    // 該当行を見つけてコメント追加（既にコメントがなければ）
    const lineRegex = new RegExp(`(\\["${escapedName}",.+?\\]),?\\s*$`, 'm');
    const lineMatch = portsData.match(lineRegex);
    if (lineMatch && !lineMatch[0].includes('// 要確認')) {
      const origLine = lineMatch[0];
      // 行末のカンマを保持
      const hasComma = origLine.trimEnd().endsWith(',');
      const trimmed = origLine.trimEnd().replace(/,\s*$/, '');
      const newLine = trimmed + (hasComma ? ', // 要確認: 座標' : ' // 要確認: 座標');
      portsData = portsData.replace(origLine, newLine);
    }
  }

  applied.push({
    name: upd.name,
    trust: upd.trust,
    oldLat, oldLon,
    newLat, newLon,
    source: upd.source
  });
}

// ログ出力
console.log('=== 更新結果 ===\n');

if (applied.length > 0) {
  console.log(`--- 更新済み: ${applied.length} 件 ---`);
  for (const a of applied) {
    const trustLabel = a.trust === 'high' ? '✓高信頼' : '△要確認';
    const latDiff = (a.newLat - a.oldLat).toFixed(4);
    const lonDiff = (a.newLon - a.oldLon).toFixed(4);
    console.log(`  ${trustLabel} ${a.name}`);
    console.log(`    旧: ${a.oldLat}, ${a.oldLon}`);
    console.log(`    新: ${a.newLat}, ${a.newLon}  (Δlat=${latDiff}, Δlon=${lonDiff})`);
    console.log(`    出典: ${a.source}`);
  }
}

if (unchanged.length > 0) {
  console.log(`\n--- 変化なし: ${unchanged.length} 件 ---`);
  for (const u of unchanged) {
    console.log(`  ${u.name}: ${u.lat}, ${u.lon}`);
  }
}

if (notFound.length > 0) {
  console.log(`\n--- ports-data.js内に未発見: ${notFound.length} 件 ---`);
  for (const n of notFound) {
    console.log(`  ${n}`);
  }
}

// 未取得リスト
const allOsakaTarget = [
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
const updatedNames = new Set(applied.map(a => a.name).concat(unchanged.map(u => u.name)));
const remaining = allOsakaTarget.filter(n => !updatedNames.has(n));
console.log(`\n--- 未更新（CSVに座標データなし）: ${remaining.length} 件 ---`);
console.log(`  ${remaining.join(', ')}`);
console.log('  → これらは手動でGoogle Mapsから座標を確認してください');

// ファイル書き出し
fs.writeFileSync(portsPath, portsData, 'utf8');
console.log(`\n=== ${portsPath} を更新しました (${applied.length} 件変更) ===`);
