#!/usr/bin/env node
/**
 * scrape-tsurisoku.js
 *
 * tsurisoku.com「写真で見る堤防釣り場」シリーズから
 * 大阪エリアの釣り場情報（トイレ・駐車場・アクセス・禁止情報）を取得する。
 *
 * 使い方: node scrape-tsurisoku.js
 * 出力: spots-tsurisoku-osaka.json
 */

const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const WAIT_MS = 2000;
const OUT_PATH = './spots-tsurisoku-osaka.json';

// 「写真で見る堤防釣り場」大阪エリア記事URL一覧（検索結果から確認済み）
const ARTICLE_URLS = [
  'https://www.tsurisoku.com/news/46935/',   // 南港 魚つり園
  'https://www.tsurisoku.com/news/24786/',   // 泉南 深日港
  'https://www.tsurisoku.com/news/31347/',   // 南港 シーサイドコスモ
  'https://www.tsurisoku.com/news/66853/',   // 淀川尻
  'https://www.tsurisoku.com/news/72737/',   // 泉大津 汐見ふ頭
  'https://www.tsurisoku.com/news/42841/',   // 泉南 みさき公園裏
  'https://www.tsurisoku.com/news/67145/',   // 泉南 田尻漁港
  'https://www.tsurisoku.com/news/80568/',   // 南港大橋下
  'https://www.tsurisoku.com/news/70135/',   // 泉大津 助松埠頭
  'https://www.tsurisoku.com/news/53679/',   // 泉大津 なぎさ公園
  'https://www.tsurisoku.com/news/61420/',   // 岸和田 阪南港ベランダ
  'https://www.tsurisoku.com/news/78222/',   // 大正区 鶴浜緑地
  'https://www.tsurisoku.com/news/85954/',   // 泉南 谷川漁港
  'https://www.tsurisoku.com/news/93845/',   // 泉南 下荘漁港
  'https://www.tsurisoku.com/news/36814/',   // 堺泉北港
  'https://www.tsurisoku.com/news/58922/',   // 高石 浜寺水路
  'https://www.tsurisoku.com/news/72751/',   // 堺 海釣りテラス
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

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

/** スポット名でPORTS検索 */
function findPort(name, ports) {
  // 表記正規化
  const norm = s => s.replace(/海づり/g, '海釣り').replace(/つり/g, '釣り')
    .replace(/ふ頭/g, '埠頭').replace(/\s+/g, '');
  const nn = norm(name);

  const exact = ports.find(p => norm(p.name) === nn);
  if (exact) return exact;

  // 部分一致
  const partial = ports.find(p => norm(p.name).includes(nn) || nn.includes(norm(p.name)));
  if (partial) return partial;

  // コア名で検索（「公園」「漁港」等を除いた部分）
  const core = name.replace(/(漁港|港|埠頭|ふ頭|公園|ベランダ|テラス|水路|開放区|緑地)$/g, '').trim();
  if (core.length >= 2 && core !== name) {
    const coreMatch = ports.find(p => norm(p.name).includes(norm(core)));
    if (coreMatch) return coreMatch;
  }

  return null;
}

/** 記事本文からキーワードベースで情報を抽出 */
function extractInfo(text) {
  const info = {
    toilet: null,
    parking: null,
    access: null,
    banned: null,
    fish: null,
    hours: null,
    fee: null,
    notes: [],
  };

  const lines = text.split(/\n/);

  // トイレ
  for (const line of lines) {
    if (/トイレ|お手洗い|WC/.test(line)) {
      if (/なし|ない|無い/.test(line)) {
        info.toilet = 'なし';
      } else if (/あり|完備|設置|利用/.test(line)) {
        info.toilet = 'あり';
      } else {
        info.toilet = line.trim().substring(0, 100);
      }
      break;
    }
  }
  if (!info.toilet) {
    if (/トイレ.{0,10}(完備|あり|設置)/.test(text)) info.toilet = 'あり';
    else if (/トイレ.{0,10}(なし|ない|無)/.test(text)) info.toilet = 'なし';
  }

  // 駐車場
  const parkingPatterns = [
    /駐車場[：:\s]*(.{5,80})/,
    /駐車.{0,20}(無料|有料|[\d,]+円|なし|あり|台)/,
    /(\d[\d,]*円.{0,20}駐車)/,
    /(駐車スペース.{0,50})/,
  ];
  for (const re of parkingPatterns) {
    const m = text.match(re);
    if (m) {
      info.parking = m[0].trim().substring(0, 150);
      break;
    }
  }

  // アクセス
  const accessPatterns = [
    /(最寄.{0,5}駅.{0,50})/,
    /((阪神高速|阪和道|南阪奈|臨海道路).{0,80})/,
    /(電車.{0,60})/,
    /(車.{0,10}(分|で到着|で行ける|でアクセス).{0,40})/,
  ];
  for (const re of accessPatterns) {
    const m = text.match(re);
    if (m) {
      info.access = (info.access ? info.access + ' / ' : '') + m[0].trim().substring(0, 100);
    }
  }

  // 釣り禁止・立入禁止
  const bannedPatterns = [
    /(立入禁止.{0,60})/,
    /(釣り禁止.{0,60})/,
    /(フェンス.{0,30}(禁止|立入|侵入).{0,30})/,
    /(進入禁止.{0,60})/,
  ];
  const bannedParts = [];
  for (const re of bannedPatterns) {
    const m = text.match(re);
    if (m) bannedParts.push(m[0].trim().substring(0, 100));
  }
  if (bannedParts.length > 0) info.banned = bannedParts.join(' / ');

  // 魚種
  const fishNames = [
    'アジ', 'サバ', 'イワシ', 'チヌ', 'クロダイ', 'ハネ', 'スズキ', 'シーバス',
    'メバル', 'ガシラ', 'カサゴ', 'タチウオ', 'サヨリ', 'キス', 'カレイ',
    'タコ', 'アオリイカ', 'ヒイカ', 'サワラ', 'ブリ', 'メジロ', 'ハマチ',
    'ツバス', 'グレ', 'メジナ', 'カワハギ', 'ヒラメ', 'マゴチ', 'アイゴ',
    'ガッチョ', 'キビレ', 'ボラ', 'コノシロ', 'アナゴ',
  ];
  const foundFish = fishNames.filter(f => text.includes(f));
  if (foundFish.length > 0) info.fish = [...new Set(foundFish)];

  // 営業時間
  const hoursMatch = text.match(/(\d{1,2}[時:：]\d{0,2}\s*[～〜~ー\-]\s*\d{1,2}[時:：]\d{0,2})/);
  if (hoursMatch) info.hours = hoursMatch[0];

  // 料金
  const feeMatch = text.match(/(無料|入場料[：:\s]*[\d,]+円|釣り料[金]*[：:\s]*[\d,]+円)/);
  if (feeMatch) info.fee = feeMatch[0];

  return info;
}

/** 記事ページをパース */
function parseArticle(html, url) {
  const $ = cheerio.load(html);

  // タイトルからスポット名を抽出
  // 形式: "気になるポイントが丸分かり!! 写真で見る堤防釣り場【大阪・南港 魚つり園】"
  const rawTitle = $('title').text().trim();
  let spotName = '';
  const bracketMatch = rawTitle.match(/【(.+?)】/);
  if (bracketMatch) {
    // 「大阪・南港 魚つり園」→ 「南港 魚つり園」「魚つり園」
    spotName = bracketMatch[1]
      .replace(/^大阪[・\s]*/g, '')
      .replace(/^(南港|泉南|泉大津|岸和田|大正区|高石|堺)\s*/g, (_, area) => {
        // エリア名は保持して区切り
        return area + ' ';
      })
      .trim();
  }

  // 記事本文を取得（複数のセレクタを試す）
  let articleText = '';
  const contentSelectors = [
    '.entry-content',
    '.post-content',
    '.article-body',
    'article',
    '.single-content',
    '.content',
    '#content',
  ];
  for (const sel of contentSelectors) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 100) {
      articleText = el.text().trim();
      break;
    }
  }
  if (!articleText) {
    // フォールバック: body全体
    articleText = $('body').text().replace(/\s+/g, ' ').trim();
  }

  // 情報抽出
  const info = extractInfo(articleText);

  return {
    spotName,
    rawTitle: rawTitle.replace(/\s*\|.*$/, '').trim(),
    sourceUrl: url,
    ...info,
  };
}

async function main() {
  const ports = loadPorts();
  console.log(`ports-data.js: ${ports.length} スポット読み込み`);
  console.log(`対象記事: ${ARTICLE_URLS.length}件\n`);

  // デバッグ: 最初の1件のHTML構造を確認
  console.log('[デバッグ] 1件目のHTML構造を確認...');
  const debugHtml = await fetchPage(ARTICLE_URLS[0]);
  const $d = cheerio.load(debugHtml);

  // コンテンツセレクタの探索
  const selectors = ['.entry-content', '.post-content', '.article-body', 'article',
    '.single-content', '.content', '#content', '.post_content', '.entry_content',
    '.main-content', '#main', 'main'];
  for (const sel of selectors) {
    const el = $d(sel).first();
    if (el.length) {
      const len = el.text().trim().length;
      console.log(`  ${sel}: ${len}文字`);
    }
  }

  // h1, h2構造
  $d('h1, h2, h3').each((i, el) => {
    if (i < 8) console.log(`  ${el.tagName}: ${$d(el).text().trim().substring(0, 60)}`);
  });

  // 最初の1件のパース結果
  const debugResult = parseArticle(debugHtml, ARTICLE_URLS[0]);
  console.log('\n[デバッグ] パース結果:');
  console.log(JSON.stringify(debugResult, null, 2));

  // 全記事を取得・パース
  console.log('\n--- 全記事取得 ---');
  const results = [];
  for (let i = 0; i < ARTICLE_URLS.length; i++) {
    const url = ARTICLE_URLS[i];
    console.log(`[${i + 1}/${ARTICLE_URLS.length}] ${url}`);

    try {
      const html = i === 0 ? debugHtml : await fetchPage(url);
      const result = parseArticle(html, url);

      // PORTS名寄せ
      const port = findPort(result.spotName, ports);
      if (port) {
        result.portIndex = port.index;
        result.portName = port.name;
        result.lat = port.lat;
        result.lon = port.lon;
      }

      results.push(result);

      const toiletStr = result.toilet || '不明';
      const parkingStr = result.parking ? '有' : '不明';
      const portStr = port ? `→ PORTS[${port.index}] ${port.name}` : '★ 未登録';
      console.log(`  ${result.spotName} | トイレ:${toiletStr} | 駐車場:${parkingStr} | ${portStr}`);

    } catch (e) {
      console.log(`  エラー: ${e.message}`);
    }

    if (i < ARTICLE_URLS.length - 1) await sleep(WAIT_MS);
  }

  // 出力
  fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

  // サマリー
  console.log('\n========== サマリー ==========');
  console.log(`取得: ${results.length}件`);
  console.log(`トイレ情報あり: ${results.filter(r => r.toilet).length}件`);
  console.log(`駐車場情報あり: ${results.filter(r => r.parking).length}件`);
  console.log(`アクセス情報あり: ${results.filter(r => r.access).length}件`);
  console.log(`禁止情報あり: ${results.filter(r => r.banned).length}件`);
  console.log(`魚種情報あり: ${results.filter(r => r.fish && r.fish.length > 0).length}件`);
  console.log(`PORTS登録済み: ${results.filter(r => r.portIndex !== undefined).length}件`);
  console.log(`出力: ${OUT_PATH}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
