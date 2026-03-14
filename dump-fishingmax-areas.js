const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.goto('https://fishingmax.co.jp/map/minamiosaka01', { waitUntil: 'networkidle2', timeout: 30000 });

  // エリアselectの全option抽出
  const options = await page.$$eval('select[name="area"] option', els =>
    els.map(el => ({
      value: el.value,
      text: el.textContent.replace(/\u00a0/g, ' ').trim(),
      level: el.className || ''
    })).filter(o => o.value)
  );

  // ports-data.js 読み込み
  const portsFile = path.join(__dirname, 'tide-pwa-online', 'js', 'ports-data.js');
  const src = fs.readFileSync(portsFile, 'utf-8');
  const m = src.match(/const PORTS\s*=\s*\[([\s\S]*?)\];/);
  const portNames = [];
  for (const line of m[1].split('\n')) {
    const r = line.match(/^\s*\["([^"]+)"/);
    if (r) portNames.push(r[1]);
  }

  // 階層表示 + ports-data.js マッチング
  let level0 = '', level1 = '';
  const unmatched = [];
  for (const o of options) {
    const indent = o.level === 'level-0' ? '' : o.level === 'level-1' ? '  ' : '    ';
    if (o.level === 'level-0') level0 = o.text;
    if (o.level === 'level-1') level1 = o.text;

    // level-2 のみスポット名としてマッチング
    if (o.level === 'level-2') {
      const name = o.text;
      const exact = portNames.find(p => p === name);
      const partial = exact ? null : portNames.find(p => p.includes(name) || name.includes(p));
      const match = exact || partial;
      const mark = match ? `→ PORTS[${portNames.indexOf(match)}] ${match}` : '★ 未登録';
      console.log(`${indent}${name} (${o.value}) ${mark}`);
      if (!match) unmatched.push({ name, value: o.value, area: level0, subArea: level1 });
    } else {
      console.log(`${indent}[${o.text}] (${o.value})`);
    }
  }

  console.log('\n========== 未登録スポット一覧 ==========');
  console.log(`${unmatched.length}件`);
  for (const u of unmatched) {
    console.log(`  ${u.area} > ${u.subArea} > ${u.name} (${u.value})`);
  }

  await browser.close();
})();
