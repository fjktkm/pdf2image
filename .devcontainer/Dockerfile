FROM node:20 as development

ENV TZ=Asia/Tokyo

RUN apt-get update && \
    apt-get install -y libvips-tools && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 3000

WORKDIR /workspaces/pdf2image

COPY package.json package-lock.json ./

RUN npm install

COPY . .

FROM node:20-slim as production

ENV TZ=Asia/Tokyo

RUN apt-get update && \
    apt-get install -y libvips-tools && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 3000

WORKDIR /workspaces/pdf2image

COPY package.json package-lock.json ./

RUN npm install --only=production

COPY . .

CMD [ "npm", "run", "prod"]
