# Node.jsのLTSバージョンをベースにする
FROM node:18

# タイムゾーンの設定（必要に応じて変更）
ENV TZ=Asia/Tokyo

# Imagemagickとpdfinfoのインストール
RUN apt-get update && \
    apt-get install -y imagemagick ghostscript && \
    rm -rf /var/lib/apt/lists/*

# ImageMagickのポリシーファイルのコピー（ルートディレクトリにpolicy.xmlがある場合）
COPY .devcontainer/image-magick/policy.xml /etc/ImageMagick-6/policy.xml

# アプリケーションがリッスンするポートを公開
EXPOSE 3000

# アプリケーションディレクトリを作成
WORKDIR /usr/src/app

# アプリケーションの依存関係の定義ファイルをコピー
COPY package*.json ./

# 依存関係のインストール
RUN npm install

# PM2のインストール
RUN npm install pm2 -g

# アプリケーションのソースをコピー
COPY . .

# アプリケーションの起動コマンド（PM2で管理）
CMD [ "pm2-runtime", "start", "index.js" ]
