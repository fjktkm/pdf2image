# syntax=docker/dockerfile:1

FROM node:24-slim AS base

ENV TZ=Asia/Tokyo \
    NODE_ENV=production

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        imagemagick \
        ghostscript

COPY config/policy.xml /etc/ImageMagick-6/policy.xml

WORKDIR /app

FROM base AS builder

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM base AS production

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY config ./config

USER node

EXPOSE 3000

CMD ["npm", "run", "prod"]
