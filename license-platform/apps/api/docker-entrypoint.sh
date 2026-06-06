#!/bin/sh
set -e

# The repo ships no SQL migration files, so sync the schema directly to the
# database (creates/updates tables to match prisma/schema.prisma).
echo "🔧 Syncing database schema (prisma db push)..."
npx prisma db push --schema=/app/prisma/schema.prisma --skip-generate

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
