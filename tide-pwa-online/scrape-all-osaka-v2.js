/**
 * scrape-all-osaka-v2.js
 * 大阪釣り場情報 統合スクレイパー v2
 * ソース:
 *   - 大阪湾の釣り.com: URLデコードでスポット名取得、403時もURLデコード名で登録
 *   - tsuriba.info: テーブルから施設情報抽出
 * 削除済み（IPブロック）: gyogyo.jp, canpblog.com, tokyo360photo.com
 */

const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchHtml(url, timeout = 20000) {
  for (let i = 0; i < 2; i++) {
    try {
      const res = await axios.get(url, {
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja-JP,ja;q=0.9',
        }
      });
      return res.data;
    } catch(e) {
      console.warn(`  [WARN] (${i+1}/2): ${url.slice(-60)} - ${e.message}`);
      if (i < 1) await sleep(3000);
    }
  }
  return null;
}

// ==============================
// 1. 大阪湾の釣り.com
// ==============================
async function scrapeOsakaBay() {
  console.log('\n=== [1] 大阪湾の釣り.com ===');
  const results = [];
  const BASE = 'https://www.xn--u9jwc554om3rqo4bwmf.com';
  const entryUrls = new Set();

  // カテゴリページとトップから /entry/ URLのみ収集
  const pages = [
    BASE,
    `${BASE}/archive/category/%E9%87%A3%E3%82%8A%E5%A0%B4%E3%81%AB%E3%83%88%E3%82%A4%E3%83%AC%E3%81%8C%E3%81%82%E3%82%8B`,
    `${BASE}/archive/category/%E8%BB%8A%E3%81%8C%E6%A8%AA%E4%BB%98%E3%81%91%E3%81%A7%E3%81%8D%E3%82%8B%E9%87%A3%E3%82%8A%E5%A0%B4`,
    `${BASE}/archive/category/%E6%B3%89%E5%A4%A7%E6%B4%A5`,
    `${BASE}/archive/category/%E5%A4%A7%E9%98%AA%E5%8D%97%E6%B8%AF`,
    `${BASE}/archive/category/%E5%A0%BA%E3%81%95%E3%81%8B%E3%81%84`,
    `${BASE}/archive/category/%E5%B2%B8%E5%92%8C%E7%94%B0`,
    `${BASE}/archive/category/%E9%98%AA%E7%A5%9E%E9%96%93`,
  ];

  for (const page of pages) {
    const html = await fetchHtml(page);
    if (!html) continue;
    const $ = cheerio.load(html);
    $('a[href]').each((_, el) => {
      const h = $(el).attr('href') || '';
      // /entry/ だけ、/top /about /プライバシー /お問い合わせ を除外
      if (h.includes('/entry/') && !/top|about|%E3%83%97%E3%83%A9|%E3%81%8A%E5%95%8F/.test(h)) {
        entryUrls.add(h.startsWith('http') ? h : BASE + h);
      }
    });
    await sleep(1500);
  }

  console.log(`  スポットURL: ${entryUrls.size}件`);

  for (const url of entryUrls) {
    const spot = { source: '大阪湾の釣り.com', url, toilet: null, parking: null };

    // URLの /entry/ 以降をデコードしてスポット名を取得
    const entryMatch = url.match(/\/entry\/(.+)$/);
    const urlName = entryMatch ? decodeURIComponent(entryMatch[1]).replace(/\+/g, ' ').trim() : '';
    spot.name = urlName;

    const html = await fetchHtml(url);
    if (html) {
      const $ = cheerio.load(html);

      // h1テキストで上書き（ただしサイト名が含まれる場合はURLデコード名を優先）
      const h1link = $('h1 a').first().text().trim();
      const h1text = $('h1').first().text().trim();
      const h1name = (h1link || h1text).replace(/\s*[-－–].*/,'').replace(/\s*～.*/,'').trim();
      if (h1name && !h1name.includes('大阪湾の釣り') && h1name.length > 1) {
        spot.name = h1name;
      }

      // 本文テキストから「釣り場データ」セクションを抽出
      const body = $('.entry-content, .hatena-section').text();

      // 「釣り場データ」の構造化データからトイレ・駐車場・柵・横付けを抽出
      // 形式: "トイレ　　有り" / "駐車場　　無し（路上駐車）" / "車の横付け　不可"
      const toiletM = body.match(/トイレ[\s　]+([^\n]{1,30})/);
      if (toiletM) {
        const v = toiletM[1].trim();
        spot.toilet = /有り|有|あり/.test(v) ? true : /無し|無|なし/.test(v) ? false : null;
        spot.toiletText = v;
      }

      const parkingM = body.match(/駐車場[\s　]+([^\n]{1,60})/);
      if (parkingM) {
        const v = parkingM[1].trim();
        spot.parking = /有り|有|あり|無料|有料|\d+円/.test(v) ? true : /無し|無|なし/.test(v) ? false : null;
        spot.parkingText = v;
      }

      const yokoM = body.match(/車の横付け[\s　]+([^\n]{1,30})/);
      if (yokoM) {
        spot.carAccess = /可|できる|OK/.test(yokoM[1].trim());
      }

      // 柵
      const fenceM = body.match(/柵[\s　]+([^\n]{1,30})/);
      if (fenceM) spot.fence = fenceM[1].trim();

      // 記事カテゴリ（サイドバーの件数付きを除外）
      const cats = [];
      $('a[href*="/category/"]').each((_, el) => {
        const t = $(el).text().trim();
        if (!/\(\d+\)/.test(t) && t.length > 1) cats.push(t);
      });
      spot.fish = cats.filter(c => !/トイレ|駐車|横付け|禁止|ファミリー|フィッシング|チョイ|ウキ|エビ|サビキ|タチウオ|タコ|投げ|カテゴリ|柵|泉大津|大阪南港|堺|岸和田|貝塚|泉佐野|泉南|和歌山|阪神|神戸|最適/.test(c)).join(',');
      spot.hasBanInfo = cats.some(c => /禁止/.test(c));

      console.log(`  OK: ${spot.name} | トイレ:${spot.toilet} 駐車:${spot.parking}`);
    } else {
      console.log(`  403/ERR: ${spot.name} (URLデコード名で登録)`);
    }

    if (spot.name && spot.name.length > 1) {
      results.push(spot);
    }
    await sleep(1500);
  }
  console.log(`  完了: ${results.length}件`);
  return results;
}

// ==============================
// 2. tsuriba.info
// ==============================
async function scrapeTsuribaInfo() {
  console.log('\n=== [2] tsuriba.info ===');
  const results = [];

  // スポット一覧ページの構造確認
  const html = await fetchHtml('https://tsuriba.info/spotlist/25');
  if (!html) return results;
  const $ = cheerio.load(html);

  const spotUrls = new Set();
  $('a').each((_, el) => {
    const h = $(el).attr('href') || '';
    if (/tsuriba\.info\/spot\/\d+/.test(h)) spotUrls.add(h);
    else if (/^\/spot\/\d+/.test(h)) spotUrls.add(`https://tsuriba.info${h}`);
  });

  if (spotUrls.size === 0) {
    // 構造確認のため一部出力
    console.log('  URL取得失敗。HTML構造の一部:');
    const links = [];
    $('a[href]').each((_, el) => {
      const h = $(el).attr('href') || '';
      if (h && h !== '#' && !h.includes('javascript')) links.push(h);
    });
    console.log('  リンク一覧(先頭20件):', links.slice(0,20));
  }

  console.log(`  スポットURL: ${spotUrls.size}件`);

  for (const url of spotUrls) {
    const html2 = await fetchHtml(url);
    if (!html2) continue;
    const $2 = cheerio.load(html2);
    const spot = { source: 'tsuriba.info', url };

    $2('tr').each((_, row) => {
      const cells = $2(row).find('th, td');
      if (cells.length < 2) return;
      const k = $2(cells[0]).text().trim();
      const v = $2(cells[1]).text().trim();
      if (/^名前|^釣り場名/.test(k)) spot.name = v;
      if (/住所|所在地/.test(k)) spot.address = v;
      if (/駐車/.test(k)) { spot.parkingText = v; spot.parking = !/なし/.test(v); }
      if (/トイレ/.test(k)) { spot.toiletText = v; spot.toilet = !/なし/.test(v); }
      if (/注意|禁止/.test(k)) spot.notes = v;
    });

    if (!spot.name) spot.name = $2('h1').first().text().replace(/の釣り.*|釣り場.*紹介/,'').trim();

    if (spot.name) {
      results.push(spot);
      console.log(`  OK: ${spot.name}`);
    }
    await sleep(2000);
  }
  console.log(`  完了: ${results.length}件`);
  return results;
}

// gyogyo.jp, canpblog.com, tokyo360photo.com は
// 全てタイムアウト（IPブロック）のため削除済み

// ==============================
// メイン
// ==============================
async function main() {
  console.log('================================');
  console.log('大阪釣り場 統合スクレイパー v2');
  console.log('================================');

  const all = [];
  for (const fn of [scrapeOsakaBay, scrapeTsuribaInfo]) {
    try { all.push(...await fn()); }
    catch(e) { console.error(`ERROR: ${e.message}`); }
    await sleep(2000);
  }

  // 重複マージ
  const norm = s => (s || '')
    .replace(/[　\s（）()【】「」『』〔〕・]/g, '')
    .replace(/の釣り.*/,'')
    .replace(/釣り場.*/,'')
    .toLowerCase();

  const seen = new Map();
  const out = [];

  for (const s of all) {
    const k = norm(s.name);
    if (!k || k.length < 2) continue;
    if (seen.has(k)) {
      const e = seen.get(k);
      if (s.toilet !== null && e.toilet === null) e.toilet = s.toilet;
      if (s.parking !== null && e.parking === null) e.parking = s.parking;
      if (!e.address && s.address) e.address = s.address;
      if (!e.fish && s.fish) e.fish = s.fish;
      if (!e.notes && s.notes) e.notes = s.notes;
      if (!e.fence && s.fence) e.fence = s.fence;
      if (s.hasBanInfo) e.hasBanInfo = true;
      e.sources.push(s.source);
    } else {
      s.sources = [s.source];
      seen.set(k, s);
      out.push(s);
    }
  }

  console.log('\n================================');
  console.log(`総件数: ${out.length}件`);
  console.log(`トイレ情報あり: ${out.filter(s => s.toilet !== null).length}件`);
  console.log(`駐車場情報あり: ${out.filter(s => s.parking !== null).length}件`);
  console.log(`住所あり: ${out.filter(s => s.address).length}件`);
  console.log('================================');

  fs.writeFileSync('spots-all-osaka.json', JSON.stringify(out, null, 2), 'utf-8');
  console.log('\n-> spots-all-osaka.json');

  const csv = ['name,toilet,parking,address,fish,hasBanInfo,sources,url'];
  for (const s of out) {
    csv.push([
      (s.name||'').replace(/,/g,'、'),
      s.toilet===true?'あり':s.toilet===false?'なし':'不明',
      s.parking===true?'あり':s.parking===false?'なし':'不明',
      (s.address||'').replace(/,/g,'、'),
      (s.fish||'').replace(/,/g,'・'),
      s.hasBanInfo?'禁止情報あり':'',
      (s.sources||[]).join('|'),
      s.url||'',
    ].join(','));
  }
  fs.writeFileSync('spots-all-osaka.csv', csv.join('\n'), 'utf-8');
  console.log('-> spots-all-osaka.csv');
}

main().catch(console.error);
