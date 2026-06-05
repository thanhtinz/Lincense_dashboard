FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY apps/api/package.json ./apps/api/
COPY prisma/ ./prisma/

# Install dependencies
WORKDIR /app/apps/api
RUN npm install --frozen-lockfile

# Copy source
COPY apps/api/src ./src
COPY apps/api/tsconfig.json .

# Generate Prisma client
RUN npx prisma generate --schema=/app/prisma/schema.prisma

# Build TypeScript
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy built files
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json .
COPY --from=builder /app/prisma ./prisma

# Run migrations and start
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]
