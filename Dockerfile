# Node.jsのLTSバージョンをベースにする
FROM node:18

# タイムゾーンの設定（必要に応じて変更）
ENV TZ=Asia/Tokyo

# Imagemagickとpdfinfoのインストール
RUN apt-get update && \
    apt-get install -y imagemagick poppler-utils ghostscript && \
    rm -rf /var/lib/apt/lists/*

# ImageMagickのポリシーファイルのコピー（ルートディレクトリにpolicy.xmlがある場合）
COPY ./docker/policy.xml /etc/ImageMagick-6/policy.xml

# アプリケーションディレクトリを作成
WORKDIR /usr/src/app

# アプリケーションの依存関係の定義ファイルをコピー
COPY package*.json ./

# 依存関係のインストール
RUN npm install

# アプリケーションのソースをコピー
COPY . .

# アプリケーションがリッスンするポートを公開
EXPOSE 3000

# アプリケーションの起動コマンド
CMD [ "npm", "start" ]

