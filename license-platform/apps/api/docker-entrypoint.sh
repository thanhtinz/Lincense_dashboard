#!/bin/sh
set -e

echo "🔧 Running database migrations..."
npx prisma migrate deploy --schema=/app/prisma/schema.prisma

echo "🌱 Running database seed..."
node -e "
const { execSync } = require('child_process');
try {
  execSync('npx tsx /app/prisma/seed.ts', { stdio: 'inherit' });
} catch (e) {
  console.log('Seed skipped (already seeded or error):', e.message);
}
"

echo "🚀 Starting License Platform API..."
exec node dist/index.js
