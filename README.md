# pdf2image

これは PDF ファイルを画像に変換する Discord Bot です．
Discord で PDF ファイルがプレビューできたら便利なのになー．

## 招待 URL

https://discord.com/api/oauth2/authorize?client_id=1103559284572291162&permissions=0&scope=bot%20applications.commands

## 使い方

PDF ファイルが添付されたメッセージのコンテキストメニューから アプリ > convertPDF を選択すると画像に変換されたものが返信されます．

## 注意事項

学生の個人開発ですので，あらゆる責任を負いかねます．
予告なくサービスを停止することがあります．
また，サービスの品質について保証することはできません．

## セットアップ（開発者向け）

### 必要なもの

- Node.js 18 以上
- ImageMagick
- Ghostscript

### インストール

```bash
# 依存関係のインストール
npm install

# PM2をグローバルインストール（初回のみ）
npm install -g pm2

# .envファイルを作成
cp .env.sample .env
# .envを編集してDiscordトークンなどを設定

# ビルド
npm run build

# Discordコマンドをデプロイ
npm run deploy
```

## 起動方法

```bash
# PM2で起動
npm run prod

# PM2の自動起動設定（サーバー再起動時に自動起動）
pm2 startup
pm2 save
```

## 管理

```bash
# ログ確認
pm2 logs pdf2image

# 状態確認
pm2 status

# 再起動
pm2 restart pdf2image

# 停止
pm2 stop pdf2image
```

## 更新

```bash
git pull
npm install
npm run build
npm run deploy
pm2 restart pdf2image
```

## 開発

```bash
# 開発モード（ファイル監視＆自動再起動）
npm run dev
```
