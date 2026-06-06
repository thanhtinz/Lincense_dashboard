import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateRuntimeKey, encryptRuntimeKey } from '../src/lib/crypto.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // ── Create Super Admin ────────────────────────────────────────────────────
  const email = (process.env.ADMIN_EMAIL || 'admin@yourdomain.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const name = process.env.ADMIN_NAME || 'Super Admin';

  // Upsert so the admin password always matches ADMIN_PASSWORD on (re)deploy.
  // The login route looks up by lowercased email, so store it lowercased.
  const hash = await bcrypt.hash(password, 12);
  await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash: hash, name, active: true },
    create: { email, passwordHash: hash, name, role: 'SUPER_ADMIN' },
  });
  console.log(`✅ Admin ready: ${email} (password synced to ADMIN_PASSWORD)`);

  // ── Create sample products ────────────────────────────────────────────────
  const products = [
    { name: 'ShopVPS', slug: 'SHOPVPS', prefix: 'SVP', description: 'VPS management platform', versions: ['1.0', '1.1', '2.0', '2.1'] },
    { name: 'YourAI', slug: 'YOURAI', prefix: 'YAI', description: 'AI chat web application', versions: ['1.0', '1.1', '2.0'] },
  ];

  for (const p of products) {
    const exists = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (!exists) {
      const rawKey = generateRuntimeKey();
      const encKey = encryptRuntimeKey(rawKey);
      await prisma.product.create({
        data: { ...p, runtimeKey: encKey },
      });
      console.log(`✅ Product created: ${p.slug} (${p.name})`);
    } else {
      console.log(`⏭  Product already exists: ${p.slug}`);
    }
  }

  console.log('\n✨ Seed complete!\n');
  console.log(`   Admin login: ${email}`);
  console.log(`   Password: ${password}`);
  console.log('\n   ⚠️  Change the admin password immediately after first login!\n');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
