import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';
import getRedis from '../lib/redis.js';

const router = Router();

const RevokeSchema = z.object({
  key: z.string().min(1),
  reason: z.string().max(500).optional(),
});

const BulkRevokeSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
  reason: z.string().max(500).optional(),
});

// ── POST /revoke — Revoke a single license by key ────────────────────────
router.post('/', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const parsed = RevokeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'key is required' });
    return;
  }

  const { key, reason } = parsed.data;

  const license = await prisma.license.findUnique({ where: { key } });
  if (!license) {
    res.status(404).json({ error: 'License not found' });
    return;
  }

  if (license.revoked) {
    res.status(409).json({ error: 'License is already revoked' });
    return;
  }

  await prisma.license.update({
    where: { key },
    data: {
      revoked: true,
      revokedAt: new Date(),
      revokedReason: reason ?? 'Revoked by admin',
    },
  });

  // Clear any cached verify results in Redis
  await invalidateLicenseCache(key);

  console.log(`[revoke] License revoked: ${key} | Reason: ${reason ?? 'N/A'} | Admin: ${req.admin?.email}`);

  res.json({
    success: true,
    key,
    revoked_at: new Date().toISOString(),
    reason: reason ?? 'Revoked by admin',
    message: 'License revoked. Next verify call from the product will return { valid: false, reason: "REVOKED" }.',
  });
});

// ── POST /revoke/bulk — Revoke multiple licenses by ID ───────────────────
router.post('/bulk', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const parsed = BulkRevokeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { ids, reason } = parsed.data;

  const licenses = await prisma.license.findMany({
    where: { id: { in: ids } },
    select: { id: true, key: true, revoked: true },
  });

  if (licenses.length === 0) {
    res.status(404).json({ error: 'No licenses found for given IDs' });
    return;
  }

  type LicSel = { id: string; key: string; revoked: boolean };
  const activeIds = licenses.filter((l: LicSel) => !l.revoked).map((l: LicSel) => l.id);

  if (activeIds.length === 0) {
    res.status(409).json({ error: 'All specified licenses are already revoked' });
    return;
  }

  await prisma.license.updateMany({
    where: { id: { in: activeIds } },
    data: {
      revoked: true,
      revokedAt: new Date(),
      revokedReason: reason ?? 'Bulk revoked by admin',
    },
  });

  // Invalidate cache for all
  await Promise.all(
    licenses.filter((l: LicSel) => !l.revoked).map((l: LicSel) => invalidateLicenseCache(l.key))
  );

  console.log(`[revoke] Bulk revoke: ${activeIds.length} licenses | Admin: ${req.admin?.email}`);

  res.json({
    success: true,
    revoked_count: activeIds.length,
    skipped_count: ids.length - activeIds.length,
    revoked_at: new Date().toISOString(),
  });
});

// ── POST /revoke/restore — Un-revoke a license ────────────────────────────
router.post('/restore', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { key } = req.body;
  if (!key) { res.status(400).json({ error: 'key is required' }); return; }

  const license = await prisma.license.findUnique({ where: { key } });
  if (!license) { res.status(404).json({ error: 'License not found' }); return; }
  if (!license.revoked) { res.status(409).json({ error: 'License is not revoked' }); return; }

  await prisma.license.update({
    where: { key },
    data: { revoked: false, revokedAt: null, revokedReason: null },
  });

  res.json({ success: true, key, message: 'License restored. Product can verify again immediately.' });
});

// ── Helper ────────────────────────────────────────────────────────────────
async function invalidateLicenseCache(key: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`verify:cache:${key}`);
  } catch {
    // Non-critical
  }
}

export default router;
