// ==================== NOWPHAS Proxy Worker ====================
// Cloudflare Workers: NOWPHASリアルタイム波浪データ取得プロキシ
// CORS制限回避 + HTMLスクレイピング → JSON変換
// ==============================================================

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    try {
      const url = new URL(request.url);
      const station = url.searchParams.get('station') || '';

      // NOWPHASリアルタイムデータを取得
      const data = await fetchNowphasData(station);

      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(env)
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(env)
        }
      });
    }
  }
};

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

async function fetchNowphasData(stationName) {
  // NOWPHAS リアルタイムデータページ
  // 複数のURLパターンを試行
  const urls = [
    'https://nowphas.mlit.go.jp/nowphasdata/static/sub000.htm',
    'https://nowphas.mlit.go.jp/',
    'https://www.mlit.go.jp/kowan/nowphas/'
  ];

  let html = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
      if (res.ok) {
        html = await res.text();
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (!html) {
    return { error: 'NOWPHAS data unavailable', stations: [] };
  }

  // HTMLからデータをパース
  const stations = parseNowphasHtml(html);

  // 指定地点のデータを返す
  if (stationName) {
    const match = stations.find(s =>
      s.name.includes(stationName) || stationName.includes(s.name)
    );
    if (match) return match;
    // 部分一致
    const partial = stations.find(s =>
      s.name.replace(/[沖港湾]/g, '').includes(stationName.replace(/[沖港湾]/g, ''))
    );
    if (partial) return partial;
  }

  return { stations, stationName, matched: false };
}

function parseNowphasHtml(html) {
  const stations = [];

  // パターン1: テーブル形式のデータ
  // <tr><td>地点名</td><td>波高</td><td>周期</td>...</tr>
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const cells = [];
    let cellMatch;
    const rowHtml = rowMatch[1];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    if (cells.length >= 3) {
      const name = cells[0];
      // 数値っぽいセルを探す
      for (let i = 1; i < cells.length; i++) {
        const val = parseFloat(cells[i]);
        if (!isNaN(val) && val > 0 && val < 20) {
          // 波高っぽい値を発見
          const period = i + 1 < cells.length ? parseFloat(cells[i + 1]) : null;
          stations.push({
            name,
            waveHeight: val,
            wavePeriod: !isNaN(period) && period > 0 && period < 30 ? period : null,
            source: 'nowphas',
            time: new Date().toISOString()
          });
          break;
        }
      }
    }
  }

  // パターン2: JavaScript変数に埋め込まれたデータ
  const jsDataRegex = /(?:wave|hs|height)\s*[=:]\s*([\d.]+)/gi;
  let jsMatch;
  while ((jsMatch = jsDataRegex.exec(html)) !== null) {
    const val = parseFloat(jsMatch[1]);
    if (!isNaN(val) && val > 0 && val < 20 && stations.length === 0) {
      stations.push({
        name: 'unknown',
        waveHeight: val,
        wavePeriod: null,
        source: 'nowphas-js',
        time: new Date().toISOString()
      });
    }
  }

  return stations;
}
