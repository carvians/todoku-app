# syntax=docker/dockerfile:1
# =====================================================================
# Image backend TodoKu (Node.js API) - multi-stage build
#   deps    : install dependency produksi saja
#   test    : install semua dependency + jalankan unit test
#   runtime : image akhir yang kecil, non-root, dengan healthcheck
# =====================================================================
ARG NODE_VERSION=20

# ---------- Stage 1: dependency produksi ----------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Stage 2: test ----------
FROM node:${NODE_VERSION}-alpine AS test
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Unit test tidak butuh database. Integration test dijalankan terpisah
# di pipeline CI dengan service container PostgreSQL.
RUN npm run test:unit

# ---------- Stage 3: runtime ----------
FROM node:${NODE_VERSION}-alpine AS runtime
LABEL org.opencontainers.image.title="todoku-api" \
      org.opencontainers.image.description="REST API TodoKu (Express + PostgreSQL)" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/app/uploads
WORKDIR /app

# tini sebagai PID 1 agar sinyal SIGTERM diteruskan dengan benar (graceful shutdown)
RUN apk add --no-cache tini

COPY --from=deps /app/node_modules ./node_modules
# Menyalin penanda dari stage test memaksa BuildKit menjalankan test lebih dulu.
# Jika test gagal, image runtime tidak akan pernah terbentuk.
COPY --from=test /app/package*.json ./
COPY src ./src

RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node

# Versi aplikasi dikirim dari pipeline CI (berisi commit SHA)
ARG APP_VERSION=2.0.0
ENV APP_VERSION=${APP_VERSION}
LABEL org.opencontainers.image.version=${APP_VERSION}

EXPOSE 3000
VOLUME ["/app/uploads"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "src/healthcheck.js"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
