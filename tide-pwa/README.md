# タイドグラフ PWA - 潮汐情報アプリ

和歌山・大阪・京都の全漁港（約150地点）に対応した潮汐情報PWAアプリです。

## 機能

- **潮汐グラフ**: 24時間の潮位変化をCanvasでグラフ表示
- **満潮・干潮時刻**: 時刻と潮位をカード形式で表示
- **次の潮汐カウントダウン**: リアルタイム更新
- **潮名表示**: 大潮・中潮・小潮・長潮・若潮を月齢から判定
- **日の出・日の入り**: 天文計算で算出、グラフ背景に明暗表示
- **月齢・月の形**: 数値とアイコンで視覚的に表示
- **お気に入り**: よく使う地点を保存
- **オフライン対応**: Service Workerでキャッシュ
- **PWA対応**: ホーム画面に追加してネイティブアプリのように使用可能

## 対応エリア

| エリア | 漁港数 |
|--------|--------|
| 和歌山県 | 94漁港 |
| 大阪府 | 13漁港 + 5港湾 |
| 京都府 | 37漁港 + 2港湾 |

## 潮汐計算

- 調和定数ベースの天文計算（外部API不要）
- 主要8分潮（M2, S2, K1, O1, N2, SA, K2, P1）を使用
- 13の基準港の調和定数を定義し、各漁港は最寄り基準港の定数を割り当て・補間
- 精度: 釣り用途で十分なレベル（±10〜20cm程度の誤差は許容）

## GitHub Pages でのホスティング手順

### 1. リポジトリを作成

```bash
cd tide-pwa
git init
git add .
git commit -m "Initial commit"
```

### 2. GitHubにプッシュ

```bash
git remote add origin https://github.com/YOUR_USERNAME/tide-pwa.git
git branch -M main
git push -u origin main
```

### 3. GitHub Pages を有効化

1. GitHubリポジトリの **Settings** を開く
2. 左メニューから **Pages** を選択
3. **Source** で「Deploy from a branch」を選択
4. **Branch** で `main` / `/ (root)` を選択
5. **Save** をクリック

### 4. アクセス

数分後に `https://YOUR_USERNAME.github.io/tide-pwa/` でアクセス可能になります。

### 5. iPhoneでPWAとして使う

1. Safari で上記URLにアクセス
2. 共有ボタン（□↑）をタップ
3. 「ホーム画面に追加」を選択
4. 「追加」をタップ

## ファイル構成

```
tide-pwa/
├── index.html          # メインHTML（CSS/JSインライン）
├── manifest.json       # PWAマニフェスト
├── sw.js              # Service Worker
├── icons/
│   ├── icon-192.png   # PWAアイコン (192x192)
│   └── icon-512.png   # PWAアイコン (512x512)
└── README.md          # このファイル
```

## 技術仕様

- **構成**: シングルHTML + インラインCSS/JS
- **フレームワーク**: なし（バニラJS + Canvas）
- **外部依存**: なし（APIキー不要）
- **オフライン**: Service Worker (Cache First戦略)
- **データ保存**: localStorage（お気に入り・最終選択地点）
