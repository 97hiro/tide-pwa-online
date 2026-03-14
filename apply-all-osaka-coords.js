// apply-all-osaka-coords.js
// 2つのCSV + 手動座標を統合して ports-data.js の大阪51件を更新
// 優先順位: tsuriba.info > Google Maps > Nominatim

const fs = require('fs');

// ==================== CSV読み込み ====================
function parseCSV(path) {
  const text = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const entries = new Map();
  for (const line of text.trim().split('\n').slice(1)) {
    const m = line.match(/^([^,]+),([^,]*),([^,]*),(.*)$/);
    if (!m) continue;
    const name = m[1].trim();
    const lat = m[2].trim();
    const lon = m[3].trim();
    const source = m[4].replace(/^"|"$/g, '').trim();
    if (!lat || !lon || source === '未取得') continue;
    entries.set(name, { lat: parseFloat(lat), lon: parseFloat(lon), source });
  }
  return entries;
}

const scraped = parseCSV('osaka-coords-scraped.csv');
const gmaps = parseCSV('osaka-coords-googlemaps.csv');

// ==================== 信頼度判定 ====================
function getTrust(source) {
  if (source.includes('tsuriba.info')) return 'high';
  if (source.includes('google.com/maps')) return 'high';
  if (source.includes('xn--u9jwc')) return 'medium';
  if (source.includes('nominatim')) return 'low';
  return 'medium';
}

// ==================== 統合: 優先順位付きマージ ====================
const merged = new Map();

// 手動指定（最優先で上書きされない特殊ケース）
const MANUAL = {
  '大和川河口':  { lat: 34.5950, lon: 135.4680, source: '手動指定', trust: 'manual' },
  '咲洲':        { lat: 34.6300, lon: 135.4200, source: '手動指定（GMaps座標が不正確）', trust: 'manual' },
};

// 1. まず Nominatim（低優先）を入れる
for (const [name, data] of scraped) {
  const trust = getTrust(data.source);
  merged.set(name, { ...data, trust });
}

// 2. Google Maps で上書き（tsuriba.info 以外）
for (const [name, data] of gmaps) {
  const existing = merged.get(name);
  if (!existing || existing.trust !== 'high') {
    merged.set(name, { ...data, trust: 'high' });
  }
}

// 3. tsuriba.info は最優先で上書き
for (const [name, data] of scraped) {
  if (data.source.includes('tsuriba.info')) {
    merged.set(name, { ...data, trust: 'high' });
  }
}

// 4. 手動指定で最終上書き
for (const [name, data] of Object.entries(MANUAL)) {
  merged.set(name, data);
}

// ==================== 統計 ====================
let highCount = 0, lowCount = 0, manualCount = 0;
for (const [, v] of merged) {
  if (v.trust === 'manual') manualCount++;
  else if (v.trust === 'high') highCount++;
  else lowCount++;
}
console.log(`=== 統合結果: ${merged.size} 件 ===`);
console.log(`  高信頼 (tsuriba/GMaps): ${highCount}`);
console.log(`  低信頼 (Nominatim): ${lowCount}`);
console.log(`  手動指定: ${manualCount}\n`);

// ==================== ports-data.js 更新 ====================
const portsPath = 'tide-pwa-online/js/ports-data.js';
let portsData = fs.readFileSync(portsPath, 'utf8');

// まず既存の「// 要確認: 座標」コメントを全て除去（再付与するため）
portsData = portsData.replace(/ *\/\/ 要確認: 座標/g, '');

const applied = [];
const notFound = [];

for (const [name, upd] of merged) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `(\\["${escapedName}","[^"]*","osaka",)(\\d+\\.\\d+),(\\d+\\.\\d+),`
  );
  const match = portsData.match(regex);
  if (!match) {
    notFound.push(name);
    continue;
  }

  const oldLat = parseFloat(match[2]);
  const oldLon = parseFloat(match[3]);
  const newLat = Math.round(upd.lat * 10000) / 10000;
  const newLon = Math.round(upd.lon * 10000) / 10000;

  // 座標置換
  portsData = portsData.replace(match[0], `${match[1]}${newLat},${newLon},`);

  // 低信頼は行末に要確認コメント追加
  if (upd.trust === 'low') {
    const lineRegex = new RegExp(`(\\["${escapedName}",[^\\n]+?)\\s*$`, 'm');
    const lineMatch = portsData.match(lineRegex);
    if (lineMatch && !lineMatch[0].includes('// 要確認')) {
      portsData = portsData.replace(lineMatch[0], lineMatch[1] + ' // 要確認: 座標');
    }
  }

  applied.push({
    name, trust: upd.trust, source: upd.source,
    oldLat, oldLon, newLat, newLon
  });
}

// ==================== ログ出力 ====================
console.log('--- 更新ログ ---\n');

const trustLabels = { high: '✓高信頼', low: '△要確認', manual: '★手動', medium: '○中信頼' };

for (const a of applied) {
  const label = trustLabels[a.trust] || '?';
  const changed = (a.oldLat !== a.newLat || a.oldLon !== a.newLon);
  const tag = changed ? '' : ' (変化なし)';
  const latD = (a.newLat - a.oldLat).toFixed(4);
  const lonD = (a.newLon - a.oldLon).toFixed(4);
  console.log(`${label} ${a.name}${tag}`);
  console.log(`  旧: ${a.oldLat}, ${a.oldLon}  →  新: ${a.newLat}, ${a.newLon}  (Δ${latD}, Δ${lonD})`);
  console.log(`  出典: ${a.source}`);
}

if (notFound.length > 0) {
  console.log(`\n--- ports-data.js に未発見: ${notFound.length} 件 ---`);
  notFound.forEach(n => console.log(`  ${n}`));
}

// 未更新チェック
const ALL_TARGETS = [
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
const updatedNames = new Set(applied.map(a => a.name));
const remaining = ALL_TARGETS.filter(n => !updatedNames.has(n));
if (remaining.length > 0) {
  console.log(`\n--- 未更新: ${remaining.length} 件 ---`);
  remaining.forEach(n => console.log(`  ${n}`));
}

// 書き出し
fs.writeFileSync(portsPath, portsData, 'utf8');
console.log(`\n=== ${portsPath} を更新 (${applied.length}/${ALL_TARGETS.length} 件) ===`);
