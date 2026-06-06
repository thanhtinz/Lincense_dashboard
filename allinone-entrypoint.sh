#!/bin/sh
# All-in-one launcher: API (Express, internal :3001) + Web (Next.js, public $PORT).
set -e

echo "[allinone] Syncing database schema (prisma db push)..."
( cd /app/api && npx prisma db push --schema=/app/api/prisma/schema.prisma --skip-generate )

echo "[allinone] Seeding database..."
( cd /app/api && npx tsx /app/api/prisma/seed.ts ) || echo "[allinone] Seed skipped (already seeded or error)"

echo "[allinone] Starting API on 127.0.0.1:3001..."
( cd /app/api && PORT=3001 node dist/index.js ) &

echo "[allinone] Starting Web on port ${PORT:-3000}..."
cd /app/web
exec node server.js
