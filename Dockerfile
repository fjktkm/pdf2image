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

COPY config/imagemagick/policy.xml /etc/ImageMagick-6/policy.xml

WORKDIR /app

FROM base AS dependencies

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production

FROM base AS production

COPY --from=dependencies /app/node_modules ./node_modules

COPY . .

USER node

EXPOSE 3000

CMD ["npm", "run", "prod"]
