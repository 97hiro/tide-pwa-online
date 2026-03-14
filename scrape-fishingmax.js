#!/usr/bin/env node
/**
 * scrape-fishingmax.js
 *
 * fishingmax.co.jp の釣果検索セレクトボックスからスポット階層を抽出し、
 * ports-data.js の既存スポットと名寄せする。
 *
 * - マップページ（/map/*）は地図画像のみで施設情報が無いため、
 *   セレクトボックスの階層構造をスポット一覧として利用する。
 * - 座標は ports-data.js の既存データからマッチングで取得。
 *
 * 出力: spots-fishingmax-osaka.json
 *
 * 使い方:
 *   npm install puppeteer
 *   node scrape-fishingmax.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const OUT_PATH = './spots-fishingmax-osaka.json';

// 対象エリア（level-0）→ prefKey マッピング
const AREA_PREF_MAP = {
  '阪神間': 'hyogo',
  '南大阪': 'osaka',
  '和歌山': 'wakayama',
};

// level-0コード → 対象フラグ（その他・京都・奈良等は除外）
const TARGET_AREA_CODES = ['hanshin', 'minamiosaka', 'wakayama'];

// ----- ports-data.js 読み込み -----
function loadPorts() {
  const portsFile = path.join(__dirname, 'tide-pwa-online', 'js', 'ports-data.js');
  const src = fs.readFileSync(portsFile, 'utf-8');
  const m = src.match(/const PORTS\s*=\s*\[([\s\S]*?)\];/);
  const ports = [];
  if (!m) return ports;
  let idx = 0;
  for (const line of m[1].split('\n')) {
    const r = line.match(/^\s*\["([^"]+)",\s*"([^"]*)",\s*"([^"]*)",\s*([\d.]+),\s*([\d.]+)/);
    if (r) {
      ports.push({ index: idx, name: r[1], city: r[2], prefKey: r[3], lat: +r[4], lon: +r[5] });
      idx++;
    }
  }
  return ports;
}

/** 表記正規化 */
function normalize(s) {
  return s
    .replace(/海づり/g, '海釣り')
    .replace(/つり/g, '釣り')
    .replace(/\s+/g, '')
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/[()]/g, '');
}

/** 「〜周辺」等のエリア名か判定 */
function isAreaName(name) {
  return /周辺$/.test(name);
}

/** 短い名前に付ける候補サフィックス */
const SUFFIXES = ['漁港', '港', '海岸', '河口', '大橋', '一文字'];

/** スポット名で ports-data.js を検索（改良版） */
function findMatchingPorts(searchName, ports) {
  const sNorm = normalize(searchName);

  // 1. 完全一致
  const exact = ports.filter(p => p.name === searchName);
  if (exact.length > 0) return exact;

  // 2. 正規化後の完全一致
  const normExact = ports.filter(p => normalize(p.name) === sNorm);
  if (normExact.length > 0) return normExact;

  // 3. 短い名前（≤3文字）: サフィックス付きで完全一致を試す
  if (searchName.length <= 3) {
    for (const suf of SUFFIXES) {
      const withSuf = searchName + suf;
      const found = ports.filter(p => p.name === withSuf);
      if (found.length > 0) return found;
    }
    // 短い名前のprefix一致（港名の先頭がsearchNameで始まる）
    // ただし1文字は除外
    if (searchName.length >= 2) {
      const prefix = ports.filter(p => p.name.startsWith(searchName));
      if (prefix.length > 0 && prefix.length <= 3) return prefix;
    }
    return [];
  }

  // 4. 「〜周辺」→ 周辺を除いてprefix検索（複数ヒットは全返却）
  if (isAreaName(searchName)) {
    const base = searchName.replace(/周辺$/, '');
    if (base.length >= 2) {
      const areaMatches = ports.filter(p => p.name.startsWith(base) || p.name.includes(base));
      if (areaMatches.length > 0) return areaMatches;
    }
  }

  // 5. 正規化後の部分一致
  const partial = ports.filter(p => {
    const pNorm = normalize(p.name);
    return pNorm.includes(sNorm) || sNorm.includes(pNorm);
  });
  if (partial.length > 0) return partial;

  // 6. コア部分の一致（括弧内・サフィックス除去）
  const core = searchName.replace(/\(.*\)/, '').replace(/周辺$/, '');
  if (core !== searchName && core.length >= 2) {
    const coreMatches = ports.filter(p =>
      normalize(p.name).includes(normalize(core)) ||
      normalize(core).includes(normalize(p.name))
    );
    if (coreMatches.length > 0) return coreMatches;
  }

  return [];
}

function guessSpotType(name) {
  if (/ダム|湖/.test(name)) return 'dam';
  if (/釣り堀|釣堀/.test(name)) return 'pond';
  if (/沖$/.test(name)) return 'offshore';
  if (/サーフ|砂浜|ビーチ|海岸/.test(name)) return 'surf';
  if (/磯|地磯|沖磯/.test(name)) return 'rock';
  if (/公園|つり園|海づり|つり公園|釣り広場/.test(name)) return 'park';
  if (/一文字|波止|埠頭|護岸|岸壁|人工島|防波堤|堤防/.test(name)) return 'pier';
  if (/河口|川尻|運河/.test(name)) return 'river';
  if (/漁港|港/.test(name)) return 'port';
  return 'port';
}

async function main() {
  const ports = loadPorts();
  console.log(`ports-data.js: ${ports.length} スポット読み込み\n`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent(UA);

  // 任意のページからセレクトボックスを取得（全ページ同じサイドバー）
  console.log('セレクトボックス取得中: https://fishingmax.co.jp/map');
  await page.goto('https://fishingmax.co.jp/map', { waitUntil: 'networkidle2', timeout: 30000 });

  const options = await page.$$eval('select[name="area"] option', els =>
    els.map(el => ({
      value: el.value,
      text: el.textContent.replace(/\u00a0/g, ' ').trim(),
      level: el.className || ''
    })).filter(o => o.value)
  );

  // マップページのリンクも取得（地図画像URL用）
  const mapLinks = await page.$$eval('a[href*="/map/"]', els =>
    els.map(a => ({ href: a.href, text: a.textContent.trim() }))
      .filter(a => /\/map\/(minamiosaka|hanshin|wakayama)\d+/.test(a.href))
  );

  await browser.close();

  console.log(`  セレクトボックス: ${options.length} 件のオプション`);
  console.log(`  マップページリンク: ${mapLinks.length} 件\n`);

  // 階層パース
  let currentArea = '';     // level-0 (阪神間, 南大阪, 和歌山, その他)
  let currentAreaCode = ''; // level-0 value
  let currentSubArea = '';  // level-1 (芦屋～武庫川方面, 泉大津～泉南, etc.)

  const allSpots = [];

  for (const o of options) {
    if (o.level === 'level-0') {
      currentArea = o.text;
      currentAreaCode = o.value;
      continue;
    }
    if (o.level === 'level-1') {
      currentSubArea = o.text;
      continue;
    }
    if (o.level !== 'level-2') continue;

    // level-2 = 個別スポット
    const name = o.text;
    const prefKey = AREA_PREF_MAP[currentArea];
    const isTarget = TARGET_AREA_CODES.includes(currentAreaCode);

    // 対象エリア外はスキップ（ただし記録はする）
    // → 京都・その他エリアのスポットも含めたい場合はここを変更

    // ports-data.js との名寄せ（全portsから検索、prefKey一致を優先）
    let matches = [];
    if (prefKey) {
      const samePref = ports.filter(p => p.prefKey === prefKey);
      matches = findMatchingPorts(name, samePref);
    }
    if (matches.length === 0) {
      matches = findMatchingPorts(name, ports);
    }

    const lat = matches.length > 0 ? matches[0].lat : null;
    const lon = matches.length > 0 ? matches[0].lon : null;

    const spot = {
      name,
      fmCode: o.value,
      area: currentArea,
      subArea: currentSubArea,
      prefKey: prefKey || null,
      lat,
      lon,
      spotType: guessSpotType(name),
      matchedPorts: matches.map(m => ({
        index: m.index,
        name: m.name,
      })),
      isTarget,
      needsReview: lat === null,
    };

    allSpots.push(spot);
  }

  // マップページの地図画像URLをマッチング
  for (const spot of allSpots) {
    const link = mapLinks.find(l =>
      l.text.includes(spot.name) || spot.name.includes(l.text)
    );
    if (link) spot.mapPageUrl = link.href;
  }

  // 出力
  fs.writeFileSync(OUT_PATH, JSON.stringify(allSpots, null, 2));

  // ----- サマリー -----
  const targetSpots = allSpots.filter(s => s.isTarget);
  const matched = targetSpots.filter(s => s.matchedPorts.length > 0);
  const unmatched = targetSpots.filter(s => s.matchedPorts.length === 0);
  const offshore = unmatched.filter(s => s.spotType === 'offshore');
  const landSpots = unmatched.filter(s => s.spotType !== 'offshore');

  // 除外カテゴリ
  const EXCLUDE_TYPES = ['dam', 'pond', 'offshore'];
  const EXCLUDE_AREA_NAMES = ['北淡', '南淡', '西浦', '東浦', '堺周辺', '泉佐野～阪南周辺'];

  const newCandidates = landSpots.filter(s =>
    !EXCLUDE_TYPES.includes(s.spotType) &&
    !EXCLUDE_AREA_NAMES.includes(s.name)
  );
  const excluded = landSpots.filter(s =>
    EXCLUDE_TYPES.includes(s.spotType) ||
    EXCLUDE_AREA_NAMES.includes(s.name)
  );

  console.log('\n========== サマリー ==========');
  console.log(`全スポット: ${allSpots.length}件`);
  console.log(`対象エリア(阪神/南大阪/和歌山): ${targetSpots.length}件`);
  console.log(`  PORTS登録済み: ${matched.length}件`);
  console.log(`  未登録: ${unmatched.length}件`);
  console.log(`    沖釣り(除外): ${offshore.length}件`);
  console.log(`    ダム/釣堀/広域名(除外): ${excluded.length}件`);
  console.log(`    ★ 純粋新規: ${newCandidates.length}件`);

  // 確定リスト出力
  const NEW_LIST_PATH = './spots-fishingmax-new.json';
  const newList = newCandidates.map((s, i) => ({
    id: i + 1,
    name: s.name,
    fmCode: s.fmCode,
    area: s.area,
    subArea: s.subArea,
    prefKey: s.prefKey,
    spotType: s.spotType,
  }));
  fs.writeFileSync(NEW_LIST_PATH, JSON.stringify(newList, null, 2));

  console.log(`\n========== 純粋新規スポット確定リスト (${newCandidates.length}件) ==========`);
  for (const s of newCandidates) {
    console.log(`  ${s.area} > ${s.subArea} > ${s.name} [${s.spotType}]`);
  }

  if (excluded.length > 0) {
    console.log(`\n--- 除外 (${excluded.length}件) ---`);
    for (const s of excluded) {
      const reason = EXCLUDE_TYPES.includes(s.spotType) ? s.spotType : '広域名';
      console.log(`  ${s.name} [${reason}]`);
    }
  }

  console.log(`\n出力: ${OUT_PATH}`);
  console.log(`新規リスト: ${NEW_LIST_PATH}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
