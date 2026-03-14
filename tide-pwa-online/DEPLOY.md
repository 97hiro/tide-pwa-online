# Cloudflare Workers デプロイ手順（Overpass APIプロキシ）

## 1. Wranglerインストール

```bash
npm install -g wrangler
```

## 2. Cloudflareログイン

```bash
wrangler login
```

ブラウザが開くのでCloudflareアカウントで認証する。

## 3. デプロイ

```bash
cd tide-pwa-online
wrangler deploy
```

デプロイ成功後、以下のようなURLが表示される：
```
https://overpass-proxy.YOUR_ACCOUNT.workers.dev
```

## 4. nearby.jsのエンドポイント変更

`js/nearby.js` の `OVERPASS_ENDPOINT` を変更：

```js
// 変更前
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

// 変更後（YOUR_ACCOUNTを自分のサブドメインに置き換え）
const OVERPASS_ENDPOINT = 'https://overpass-proxy.YOUR_ACCOUNT.workers.dev';
```

## 5. 動作確認

1. ブラウザでアプリを開く
2. 任意のスポットを選択して周辺施設ボタンを押す
3. F12 → Network タブで `overpass-proxy.YOUR_ACCOUNT.workers.dev` へのPOSTリクエストを確認
4. 施設が正常に表示されることを確認

## Cloudflare Workers 無料枠

- 1日10万リクエストまで無料
- レスポンスサイズ制限なし
- クレジットカード不要
