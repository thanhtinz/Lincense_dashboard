#!/usr/bin/env node
/**
 * License Platform Setup Script
 * Generates RSA keys, AES master key, and creates .env from .env.example
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

console.log('\n🔐 License Platform — Initial Setup\n');
console.log('=' .repeat(50));

// ── Check if .env already exists ─────────────────────────────────────────
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  console.log('\n⚠️  .env already exists. Delete it first to re-run setup.\n');
  process.exit(0);
}

// ── Generate secrets ──────────────────────────────────────────────────────
console.log('\n📝 Generating secrets...');

const jwtSecret = crypto.randomBytes(64).toString('hex');
const aesMasterKey = crypto.randomBytes(32).toString('hex');

// Generate RSA 2048-bit keypair
let rsaPrivate, rsaPublic;
try {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  rsaPrivate = privateKey.replace(/\n/g, '\\n');
  rsaPublic = publicKey.replace(/\n/g, '\\n');
  console.log('  ✅ RSA 2048-bit keypair generated');
} catch (err) {
  console.error('  ❌ RSA generation failed:', err.message);
  process.exit(1);
}

console.log('  ✅ JWT secret generated (128 hex chars)');
console.log('  ✅ AES-256 master key generated (64 hex chars)');

// ── Read .env.example and fill in values ─────────────────────────────────
const examplePath = path.join(ROOT, '.env.example');
let envContent = fs.readFileSync(examplePath, 'utf8');

envContent = envContent
  .replace('CHANGE_ME_generate_with_crypto_randomBytes_64', jwtSecret)
  .replace('CHANGE_ME_64_hex_chars_here', aesMasterKey)
  .replace('"-----BEGIN RSA PRIVATE KEY-----\\nPASTE_YOUR_KEY_HERE\\n-----END RSA PRIVATE KEY-----"', `"${rsaPrivate}"`)
  .replace('"-----BEGIN PUBLIC KEY-----\\nPASTE_YOUR_KEY_HERE\\n-----END PUBLIC KEY-----"', `"${rsaPublic}"`);

fs.writeFileSync(envPath, envContent);

console.log('\n✅ .env created with generated secrets\n');
console.log('=' .repeat(50));
console.log('\n📋 Next steps:\n');
console.log('  1. Edit .env — set your DATABASE_URL, REDIS_URL, ADMIN_EMAIL, ADMIN_PASSWORD');
console.log('  2. Install dependencies:');
console.log('       cd apps/api && npm install');
console.log('  3. Run database migrations:');
console.log('       npm run db:generate');
console.log('       npm run db:migrate');
console.log('  4. Seed database (creates first admin + sample products):');
console.log('       npm run db:seed');
console.log('  5. Start development server:');
console.log('       npm run dev:api');
console.log('\n  OR use Docker:');
console.log('       npm run docker:up');
console.log('\n  API will be at: http://localhost:3001');
console.log('  Health check:  http://localhost:3001/health\n');
