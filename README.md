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
# 起動
npm start
```

## 更新

```bash
git pull
npm install
npm run build
npm run deploy
npm start
```

## 開発

```bash
# 開発モード（ファイル監視＆自動再起動）
npm run dev
```
