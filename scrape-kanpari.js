#!/usr/bin/env node
/**
 * scrape-kanpari.js
 *
 * fishing.ne.jp (カンパリ) から大阪エリアの釣果情報をスクレイピングする。
 *
 * 使い方:
 *   node scrape-kanpari.js [--pages N] [--area osaka]
 */

const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://fishing.ne.jp';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const WAIT_MS = 1500;

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const MAX_PAGES = parseInt(getArg('pages', '5'), 10);
const AREA = getArg('area', 'osaka');
const OUT_PATH = `./catches-kanpari-${AREA}.json`;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

/** 一覧ページから釣果リンクを抽出 */
function parseListPage(html) {
  const $ = cheerio.load(html);
  const links = [];
  $('a[href*="post_type=fishingpost&p="]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !links.includes(href)) {
      links.push(href.startsWith('http') ? href : BASE_URL + href);
    }
  });
  // 次ページ
  let nextPage = null;
  $('a').each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href');
    if (/^次\s*>?$/.test(text) && href) {
      nextPage = href.startsWith('http') ? href : BASE_URL + href;
    }
  });
  return { links, nextPage };
}

/**
 * タイトルから情報抽出
 * 形式: "{タイトル} | {府県} {スポット} {釣り方} {魚種} | 陸っぱり..."
 */
function parseTitle(rawTitle) {
  const parts = rawTitle.split('|').map(s => s.trim());
  const result = { catchTitle: parts[0] || '', prefecture: null, spot: null, method: null, fish: null };
  if (parts.length >= 2) {
    // 2番目のパート: "大阪府 淀川河口 シーバス スズキ・セイゴ"
    const info = parts[1];
    // 府県抽出
    const prefMatch = info.match(/^(大阪府|兵庫県|和歌山県|京都府|奈良県|滋賀県|三重県)/);
    if (prefMatch) {
      result.prefecture = prefMatch[1];
      const rest = info.substring(prefMatch[0].length).trim();
      // 残りをスペースで分割: "淀川河口 シーバス スズキ・セイゴ"
      const tokens = rest.split(/\s+/);
      if (tokens.length >= 1) result.spot = tokens[0];
      if (tokens.length >= 2) result.method = tokens[tokens.length > 2 ? tokens.length - 2 : 1];
      if (tokens.length >= 3) result.fish = tokens[tokens.length - 1];
      if (tokens.length === 2) { result.fish = tokens[1]; result.method = null; }
    }
  }
  return result;
}

/** 個別釣果ページをパース */
function parseCatchPage(html, url) {
  const $ = cheerio.load(html);

  // タイトルから基本情報を抽出
  const rawTitle = $('title').text().trim();
  const titleInfo = parseTitle(rawTitle);

  // 座標
  let lat = null, lon = null;
  const coordMatch = html.match(/(\d{2}\.\d{4,}),\s*(\d{3}\.\d{4,})/);
  if (coordMatch) {
    lat = parseFloat(coordMatch[1]);
    lon = parseFloat(coordMatch[2]);
  }

  // 日付: "YYYY/MM/DD UP" パターン（複数あれば最初）
  const dates = [];
  const dateRe = /(\d{4}\/\d{2}\/\d{2})\s*UP/g;
  let dm;
  while ((dm = dateRe.exec(html)) !== null) dates.push(dm[1]);
  // 釣行日
  const fishingDateMatch = html.match(/釣行日[：:\s]*(\d{4}\/\d{2}\/\d{2})/);

  // 記事本文（サイドバー除外）
  // メインコンテンツを特定: .entry-content, article, またはGoogleMapの近くのテキスト
  let bodyText = '';
  const mainContent = $('.entry-content').first();
  if (mainContent.length) {
    bodyText = mainContent.text().replace(/\s+/g, ' ').trim();
  } else {
    // h1直後のテキストブロックを探す
    const h1 = $('h1').first();
    if (h1.length) {
      bodyText = h1.parent().text().replace(/\s+/g, ' ').trim();
    }
  }

  // テーブルから詳細情報を抽出
  const tableData = {};
  $('table tr').each((_, tr) => {
    const th = $(tr).find('th').text().trim();
    const td = $(tr).find('td').text().trim();
    if (th && td && th.length < 20) {
      tableData[th] = td;
    }
  });

  // 天候・潮・時間帯をテーブルまたはテキストから取得
  const weather = tableData['天気'] || tableData['天候'] || null;
  const tide = tableData['潮'] || null;
  const timeOfDay = tableData['時間帯'] || null;
  const temp = tableData['気温'] || null;
  const size = tableData['サイズ'] || tableData['釣果'] || null;

  // 関連タグ（エリア系のみ抽出、サイドバーナビを除外）
  // スポット詳細ページのエリアリンクだけ取得
  const areaTags = [];
  $('a[href*="/fishingpost/area/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    // 大阪の子エリアのみ（osaka配下 or osakashi配下）
    if (/area\/(osaka|osakashi)/.test(href) && text.length < 30 && !areaTags.includes(text)) {
      areaTags.push(text);
    }
  });

  return {
    title: titleInfo.catchTitle,
    url,
    date: dates[0] || null,
    fishingDate: fishingDateMatch ? fishingDateMatch[1] : null,
    prefecture: titleInfo.prefecture,
    spot: titleInfo.spot,
    fish: titleInfo.fish,
    method: titleInfo.method,
    lat,
    lon,
    size,
    weather,
    tide,
    timeOfDay,
    temp,
    areaTags,
    tableData,
    bodyText: bodyText.substring(0, 200),
  };
}

async function main() {
  console.log(`カンパリ釣果スクレイピング: ${AREA}`);
  console.log(`最大ページ数: ${MAX_PAGES}\n`);

  // Step 1: 一覧ページからリンク収集
  const firstUrl = `${BASE_URL}/fishingpost/area/${AREA}`;
  console.log(`[デバッグ] 一覧ページ: ${firstUrl}`);
  const listHtml = await fetchPage(firstUrl);
  const firstParse = parseListPage(listHtml);
  console.log(`  リンク: ${firstParse.links.length}件, 次ページ: ${firstParse.nextPage ? 'あり' : 'なし'}`);

  if (firstParse.links.length === 0) {
    console.error('リンク抽出失敗');
    process.exit(1);
  }

  // Step 2: デバッグ - 最初の1件を詳細確認
  console.log(`\n[デバッグ] 個別ページ: ${firstParse.links[0]}`);
  await sleep(WAIT_MS);
  const debugHtml = await fetchPage(firstParse.links[0]);
  const debugResult = parseCatchPage(debugHtml, firstParse.links[0]);
  console.log(JSON.stringify(debugResult, null, 2));

  // Step 3: 全ページのリンク収集
  console.log('\n--- リンク収集 ---');
  const allLinks = [];
  let currentUrl = firstUrl;
  let pageNum = 0;

  while (currentUrl && pageNum < MAX_PAGES) {
    pageNum++;
    console.log(`[${pageNum}/${MAX_PAGES}] ${currentUrl}`);
    try {
      const html = pageNum === 1 ? listHtml : await fetchPage(currentUrl);
      const { links, nextPage } = parseListPage(html);
      for (const link of links) {
        if (!allLinks.includes(link)) allLinks.push(link);
      }
      console.log(`  +${links.length}件 (累計: ${allLinks.length}件)`);
      currentUrl = nextPage;
    } catch (e) {
      console.log(`  エラー: ${e.message}`);
      break;
    }
    if (pageNum < MAX_PAGES) await sleep(WAIT_MS);
  }

  // Step 4: 各釣果ページを取得・パース
  console.log(`\n--- 釣果取得 (${allLinks.length}件) ---`);
  const catches = [];
  for (let i = 0; i < allLinks.length; i++) {
    console.log(`[${i + 1}/${allLinks.length}] ${allLinks[i]}`);
    try {
      await sleep(WAIT_MS);
      const html = await fetchPage(allLinks[i]);
      const c = parseCatchPage(html, allLinks[i]);
      catches.push(c);
      console.log(`  → ${c.spot || '?'} / ${c.fish || '?'} (${c.date || '?'})`);
    } catch (e) {
      console.log(`  → エラー: ${e.message}`);
    }
  }

  // 出力
  fs.writeFileSync(OUT_PATH, JSON.stringify(catches, null, 2));

  // サマリー
  const spotCounts = {};
  const fishCounts = {};
  for (const c of catches) {
    const s = c.spot || '不明';
    spotCounts[s] = (spotCounts[s] || 0) + 1;
    const f = c.fish || '不明';
    fishCounts[f] = (fishCounts[f] || 0) + 1;
  }

  console.log('\n========== サマリー ==========');
  console.log(`取得釣果: ${catches.length}件`);
  console.log(`座標あり: ${catches.filter(c => c.lat).length}件`);

  console.log('\nスポット別:');
  Object.entries(spotCounts).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([name, n]) => console.log(`  ${name}: ${n}件`));

  console.log('\n魚種別:');
  Object.entries(fishCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .forEach(([name, n]) => console.log(`  ${name}: ${n}件`));

  console.log(`\n出力: ${OUT_PATH}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
