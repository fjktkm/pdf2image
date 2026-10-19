# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:26-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:26-slim AS production

LABEL org.opencontainers.image.source="https://github.com/fjktkm/pdf2image" \
      org.opencontainers.image.description="Discord bot that converts PDF attachments to images" \
      org.opencontainers.image.licenses="MIT"

ENV TZ=Asia/Tokyo \
    NODE_ENV=production

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends libvips-tools

WORKDIR /app

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

COPY --chown=1000:1000 --from=builder /app/dist ./dist

USER 1000:1000

CMD ["node", "dist/index.js"]
