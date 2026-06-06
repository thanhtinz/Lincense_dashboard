# Build context = license-platform/  (dùng cho docker-compose, hoặc Railway khi set
# Root Directory = license-platform). Debian slim để Prisma + OpenSSL 3 chạy ổn định.
FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY apps/api/package.json ./apps/api/
COPY prisma/ ./prisma/

# Install dependencies
WORKDIR /app/apps/api
RUN npm install

# Copy source
COPY apps/api/src ./src
COPY apps/api/tsconfig.json .

# Generate Prisma client
RUN npx prisma generate --schema=/app/prisma/schema.prisma

# Build TypeScript
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Copy built files
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json .
COPY --from=builder /app/prisma ./prisma
# Source + tsconfig so the entrypoint can run the TS seed (prisma/seed.ts
# imports ../src/lib/crypto) via tsx on first boot.
COPY --from=builder /app/apps/api/src ./src
COPY --from=builder /app/apps/api/tsconfig.json ./tsconfig.json

# Run migrations and start
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]
