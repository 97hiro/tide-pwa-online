# タイドグラフ Theory - 釣り総合情報PWA（オンライン版）

和歌山・大阪・京都・兵庫の全漁港（約312地点）対応。
潮汐×気圧×風×波×月齢の多変数解析による「釣り期待値スコア（Theory）」を算出・表示する釣り専用アプリ。

## 機能

### 釣り期待値スコア（Theory）
- 0〜100のスコアで釣りのコンディションを総合評価
- 潮汐（30%）、気圧（15%）、風（20%）、波浪（20%）、月齢・時間帯（15%）の重み付け合算
- 2時間刻みの時間帯別スコア + ベストタイム表示
- 3日間のスコア予測

### 潮汐グラフ
- 調和定数ベースの天文計算（オフライン動作）
- 理論潮位 + 気圧補正後の実質潮位の2本表示
- マズメタイム（日の出/入り前後1時間）ハイライト
- 満潮・干潮マーカー、現在時刻ライン

### リアルタイム気象データ
- **気圧**: 気象庁アメダス実測値 + 吸い上げ効果補正
- **風**: アメダス実測 + 予報データ
- **波浪**: NOWPHAS実測データ（Cloudflare Workers経由）
- **海水温**: 推定値（JMA取得失敗時のフォールバック付き）
- **天気**: 気象庁予報JSON

### その他
- お気に入り地点（localStorage保存）
- 日付送り（ボタン・スワイプ）
- 月齢・月相表示
- PWA対応（ホーム画面追加でフルスクリーン）
- オフラインフォールバック

## データソース

| データ | ソース | APIキー | CORS |
|--------|--------|---------|------|
| 潮汐 | 自前計算（調和定数） | N/A | N/A |
| 気圧・風 | 気象庁アメダス | 不要 | OK |
| 天気予報 | 気象庁予報JSON | 不要 | OK |
| 波浪 | NOWPHAS | 不要 | Workers経由 |
| 海水温 | 推定（フォールバック） | N/A | N/A |

## GitHub Pages でのホスティング

### 1. リポジトリ作成 & プッシュ

```bash
cd tide-pwa-online
git init
git add .
git commit -m "Initial commit: タイドグラフ Theory"
git remote add origin https://github.com/YOUR_USERNAME/tide-pwa-online.git
git branch -M main
git push -u origin main
```

### 2. GitHub Pages 有効化

1. リポジトリの **Settings** → **Pages**
2. Source: 「Deploy from a branch」
3. Branch: `main` / `/ (root)`
4. **Save**

### 3. アクセス

`https://YOUR_USERNAME.github.io/tide-pwa-online/`

### 4. iPhone PWA化

1. Safari で上記URLにアクセス
2. 共有ボタン（□↑）→「ホーム画面に追加」
3. 「追加」をタップ

## Cloudflare Workers デプロイ（NOWPHAS波浪データ用）

波浪データの取得にはCloudflare Workersのプロキシが必要です（無料枠: 10万リクエスト/日）。

### 1. Cloudflareアカウント作成

[Cloudflare](https://dash.cloudflare.com/sign-up) でアカウントを作成

### 2. Wranglerインストール

```bash
npm install -g wrangler
wrangler login
```

### 3. デプロイ

```bash
cd workers/nowphas-proxy
wrangler deploy
```

デプロイ後に表示されるURL（例: `https://nowphas-proxy.YOUR_ACCOUNT.workers.dev`）を控えます。

### 4. アプリに反映

`js/data-fetch.js` の `NOWPHAS_PROXY_URL` を実際のURLに変更：

```javascript
const NOWPHAS_PROXY_URL = 'https://nowphas-proxy.YOUR_ACCOUNT.workers.dev';
```

## ファイル構成

```
tide-pwa-online/
├── index.html              # メインHTML
├── css/
│   └── style.css           # スタイルシート
├── js/
│   ├── ports-data.js       # 漁港データ（312地点 + 基準港調和定数）
│   ├── tide-calc.js        # 潮汐計算エンジン
│   ├── data-fetch.js       # オンラインデータ取得モジュール
│   ├── theory-score.js     # 釣り期待値スコア算出エンジン
│   ├── chart.js            # Canvas描画（グラフ・月・風矢印）
│   ├── ui.js               # UI操作・イベントハンドリング
│   └── app.js              # メインアプリロジック
├── manifest.json           # PWAマニフェスト
├── sw.js                   # Service Worker（Cache First + Network First）
├── icons/
│   ├── icon-192.png        # PWAアイコン
│   └── icon-512.png        # PWAアイコン
├── workers/
│   └── nowphas-proxy/
│       ├── wrangler.toml   # Cloudflare Workers設定
│       └── src/
│           └── index.js    # NOWPHASスクレイピングプロキシ
└── README.md
```

## 技術仕様

- **フレームワーク**: なし（バニラJS + Canvas）
- **外部依存**: なし（ビルドツール不使用）
- **オフライン**: Service Worker（静的: Cache First / API: Network First）
- **データ保存**: localStorage
- **潮汐精度**: ±10〜20cm（釣り用途で十分）
