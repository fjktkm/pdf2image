FROM node:20 as development

ENV TZ=Asia/Tokyo

RUN apt-get update && \
    apt-get install -y imagemagick ghostscript && \
    rm -rf /var/lib/apt/lists/*

COPY .devcontainer/image-magick/policy.xml /etc/ImageMagick-6/policy.xml

EXPOSE 3000

WORKDIR /workspaces/pdf2image

COPY package.json package-lock.json ./

RUN npm install

COPY . .

FROM node:20-slim as production

ENV TZ=Asia/Tokyo

RUN apt-get update && \
    apt-get install -y imagemagick ghostscript && \
    rm -rf /var/lib/apt/lists/*

COPY .devcontainer/image-magick/policy.xml /etc/ImageMagick-6/policy.xml

EXPOSE 3000

WORKDIR /workspaces/pdf2image

COPY package.json package-lock.json ./

RUN npm install --only=production

COPY . .

CMD [ "node", "src/index.js" ]
