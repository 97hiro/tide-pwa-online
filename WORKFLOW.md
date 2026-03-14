# Facing / Shelter 半自動計算ワークフロー

## 概要

海岸線のベクトル解析によって、各釣りスポットの `facing`（開口方向）と `shelter`（遮蔽度）を自動計算する。

### アルゴリズム

#### Facing（開口方向）計算
```
OSMルール: 海岸線wayの進行方向に対して「左=陸、右=海」

1. Overpass APIで対象エリアの海岸線(natural=coastline)を取得
2. スポット座標から最寄りの海岸線セグメントを特定
3. セグメントの進行方向(A→B)を計算
4. 進行方向の右90度回転 = 海に面する方向 = facing

  海岸線: A ────→ B （進行方向）
  
  陸（左側）  │
              │ 
  ────────────┼────── 海岸線
              │
  海（右側）  ↓ facing = 進行方向 + 90°
```

安定化のため、半径200m以内の全セグメントの加重円平均を使用。
重み = セグメント長 / (距離 + 10m)

#### Shelter（遮蔽度）計算
```
1. スポットから12方位（30度刻み）にレイを放射
2. 半径500m以内で海岸線または構造物にレイが当たるかチェック
3. 遮蔽されたセクター数 / 12 = shelter基本値

  例: 3方向のみ開放（海側）の入り江
  
  ████████         blocked (陸/山)
  ████ spot ░░░░   open (海)
  ████████         blocked (陸/山)
  
  → 9/12 = 0.75 shelter

4. スポット種別による補正
   - 地磯: max(0.25) → 露出度が高い場所は0.25上限
   - サーフ: max(0.15) → ほぼ完全露出
   - 河口: min(0.3) → 最低0.3
   - 釣り公園: min(0.4) → 施設の遮蔽あり
```

## ファイル構成

```
calc-facing-shelter.js   ... メイン計算スクリプト
scrape-turihiroba.js     ... 釣り広場.comスクレイパー
spots-all.json           ... 全スポット（座標未確定含む）
spots-with-coords.json   ... 座標確定済みスポット
spots-needs-coords.json  ... 座標未確定スポット一覧
facing-shelter-output.json      ... 計算結果（デバッグ情報付き）
facing-shelter-output-review.csv ... レビュー用CSV
facing-shelter-output-ports-data-append.js ... ports-data.js追加用
```

## 実行手順

### Step 1: スポット収集（釣り広場.comスクレイピング）

```bash
# 依存インストール
npm install cheerio

# スクレイピング実行
node scrape-turihiroba.js
```

出力:
- `spots-all.json` : 全スポット
- `spots-with-coords.json` : 座標確定済み
- `spots-needs-coords.json` : 座標未確定（手動設定が必要）

### Step 2: 座標未確定スポットの座標設定

`spots-needs-coords.json` のTODOを手動で緯度経度に置換する。

方法1: Google Mapsで検索して緯度経度をコピー
方法2: Nominatim APIで自動取得

```bash
# Nominatim APIで自動補完するヘルパースクリプト
node -e "
const fs = require('fs');
const spots = JSON.parse(fs.readFileSync('./spots-needs-coords.json'));
(async () => {
  for (const s of spots) {
    const q = encodeURIComponent(s.name + ' ' + s.city + ' ' + s.prefecture);
    const url = 'https://nominatim.openstreetmap.org/search?q=' + q + '&format=json&limit=1';
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data[0]) {
        s.lat = parseFloat(data[0].lat);
        s.lon = parseFloat(data[0].lon);
        console.log(s.name + ': ' + s.lat + ', ' + s.lon);
      } else {
        console.log(s.name + ': NOT FOUND');
      }
    } catch (e) { console.error(s.name + ': ERROR'); }
    await new Promise(r => setTimeout(r, 1100)); // Nominatimレート制限
  }
  fs.writeFileSync('./spots-geocoded.json', JSON.stringify(spots, null, 2));
})();
"
```

### Step 3: 全スポットを結合

```bash
node -e "
const fs = require('fs');
const withCoords = JSON.parse(fs.readFileSync('./spots-with-coords.json'));
const geocoded = JSON.parse(fs.readFileSync('./spots-geocoded.json'));
const merged = [...withCoords, ...geocoded.filter(s => s.lat && s.lon)];
fs.writeFileSync('./spots-final.json', JSON.stringify(merged, null, 2));
console.log('Total: ' + merged.length);
"
```

### Step 4: Facing/Shelter計算

```bash
# 全エリア一括
node calc-facing-shelter.js --spots spots-final.json --area all --output facing-shelter-output.json

# またはエリア別（APIリクエスト量を減らす）
node calc-facing-shelter.js --spots spots-wakayama.json --area wakayama --output output-wakayama.json
node calc-facing-shelter.js --spots spots-osaka.json --area osaka --output output-osaka.json
node calc-facing-shelter.js --spots spots-kyoto.json --area kyoto --output output-kyoto.json
node calc-facing-shelter.js --spots spots-hyogo.json --area hyogo --output output-hyogo.json
```

### Step 5: 結果レビュー

`facing-shelter-output-review.csv` をスプレッドシートで開き、以下を確認:

1. **facing方向が地理的に妥当か**
   - 南向きの海岸のスポットが facing ≈ 180 になっているか
   - 西向きの海岸なら facing ≈ 270 か

2. **shelter値が直感と合っているか**
   - 入り江の奥: 0.6〜0.9
   - 半島の先端: 0.0〜0.2
   - 開放的なサーフ: 0.0〜0.15

3. **海岸線からの距離(coastline_dist)が適切か**
   - 500m以上の場合、座標がズレている可能性

### Step 6: 手動修正（必要に応じて）

```bash
# 修正用JSONを手動編集
# facing-shelter-output.json の特定スポットを修正

# 例: 潮岬は先端の磯で完全露出だがshelterが高く出た場合
# → shelter: 0.05 に手動修正
```

### Step 7: ports-data.jsに反映

```bash
# 生成された ports-data-append.js の内容を
# tide-pwa-online/js/ports-data.js の適切な配列に追加
cat facing-shelter-output-ports-data-append.js
```

## Claude Codeに渡すプロンプト

```
tide-pwa-online に新しい釣りスポットを追加する。

以下の3つのスクリプトを使って作業を進める:

1. scrape-turihiroba.js: 釣り広場.comから全スポットを収集
2. calc-facing-shelter.js: OSM海岸線データからfacing/shelterを自動計算
3. 手動で結果をレビュー・修正

実行手順:
1. `npm install cheerio` してから `node scrape-turihiroba.js`
2. 座標未確定スポットをNominatim APIで補完
3. `node calc-facing-shelter.js --spots spots-final.json --area all`
4. 出力CSVをレビュー
5. ports-data.jsに結果を反映
6. UIにスポット種別アイコンを追加
7. ランキングに新スポットが反映されることを確認

デバッグルール:
- 外部APIはfetch→console.logで確認後パーサー実装
- Workers等追加インフラ不要な標準HTTP優先
- データ取得失敗時のフォールバック最初から実装
- 各Phase完了時にブラウザ実動作確認し問題修正後に次Phase
```

## 技術詳細

### Overpass APIクエリ

海岸線:
```
[out:json][timeout:120];
way["natural"="coastline"](33.4,134.5,35.9,136.1);
out body; >; out skel qt;
```

防波堤・構造物:
```
[out:json][timeout:120];
(
  way["man_made"="breakwater"](33.4,134.5,35.9,136.1);
  way["man_made"="groyne"](33.4,134.5,35.9,136.1);
  way["man_made"="pier"](33.4,134.5,35.9,136.1);
);
out body; >; out skel qt;
```

### 座標系

- WGS84 (EPSG:4326)
- 距離計算: Haversine式
- 方位計算: 初期方位角（great circle bearing）
- 近距離の平面近似: cos(lat)補正

### パフォーマンス

- 海岸線データ: 和歌山〜兵庫で約2000〜5000 ways
- 1スポットあたり計算時間: 〜100ms
- 200スポット全計算: 〜20秒
- Overpass APIリクエスト: 2回（海岸線+構造物）

---

## 2026-03-10 完了作業

### DB構築完了
- spots: 311件（312件-重複1件+新規2件）
- is_active カラム追加済み
  - is_active=0: 西宮ケーソン(231)・オノコロ裏(310)

### spot_regulations: 40件
| ソース | 件数 | spot_id紐付 |
|--------|------|------------|
| D-ANGLERS | 8件 | 8件 |
| 大阪市港湾局 | 29件 | 5件 |
| 大阪府水産課 | 1件 | 1件 |
| 残NULL | - | 26件 |

### regulation-data.js 自動生成済み
- banned: [150,157,231,233,279] 5件
- caution: [283] 1件
- areaWarning: [131,158,163,166,167] 5件

### ranking.js 組み込み済み
- bannedはランキング除外
- cautionは⚠️表示
- areaWarningは🔍表示
- generate-regulation-data.js で再生成可能

### 次のアクション
1. フィッシングマックス スクレイピング
2. カンパリ・つりそく スクレイピング
3. ランキング本番動作確認
