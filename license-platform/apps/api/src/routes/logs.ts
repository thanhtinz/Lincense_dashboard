import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';
import getRedis from '../lib/redis.js';

const router = Router();

// ── GET /logs — List verify logs (paginated + filtered) ───────────────────
router.get('/', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
  const limit = Math.min(100, parseInt(req.query.limit as string || '50', 10));
  const skip = (page - 1) * limit;

  const where: any = {};

  if (req.query.license_id) where.licenseId = req.query.license_id;
  if (req.query.key) where.key = req.query.key;
  if (req.query.result) where.result = req.query.result;
  if (req.query.domain) where.domain = { contains: req.query.domain as string, mode: 'insensitive' };
  if (req.query.ip) where.ip = req.query.ip;

  if (req.query.from || req.query.to) {
    where.createdAt = {};
    if (req.query.from) where.createdAt.gte = new Date(req.query.from as string);
    if (req.query.to) where.createdAt.lte = new Date(req.query.to as string);
  }

  const [logs, total] = await Promise.all([
    prisma.verifyLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        license: {
          select: { customerName: true, customerEmail: true, product: { select: { slug: true } } },
        },
      },
    }),
    prisma.verifyLog.count({ where }),
  ]);

  res.json({
    data: logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ── GET /logs/stats — Dashboard stats ─────────────────────────────────────
router.get('/stats', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalLicenses,
    activeLicenses,
    revokedLicenses,
    expiredLicenses,
    verifyLast24h,
    verifySuccessLast24h,
    expiringIn30d,
  ] = await Promise.all([
    prisma.license.count(),
    prisma.license.count({ where: { revoked: false, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    prisma.license.count({ where: { revoked: true } }),
    prisma.license.count({ where: { revoked: false, expiresAt: { lt: now } } }),
    prisma.verifyLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.verifyLog.count({ where: { createdAt: { gte: last24h }, result: 'SUCCESS' } }),
    prisma.license.count({
      where: { revoked: false, expiresAt: { gt: now, lt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) } },
    }),
  ]);

  // Hourly verify counts for chart (last 24h)
  const hourlyStats = await prisma.$queryRaw<Array<{ hour: string; count: bigint }>>`
    SELECT 
      to_char(date_trunc('hour', "createdAt"), 'YYYY-MM-DD HH24:00') as hour,
      COUNT(*) as count
    FROM verify_logs
    WHERE "createdAt" >= ${last24h}
    GROUP BY date_trunc('hour', "createdAt")
    ORDER BY date_trunc('hour', "createdAt")
  `;

  // Anomalies from Redis
  const redis = getRedis();
  const anomalyKeys = await redis.keys('anomaly:*');
  const anomalies = anomalyKeys.map((k) => k.replace('anomaly:', ''));

  res.json({
    licenses: {
      total: totalLicenses,
      active: activeLicenses,
      revoked: revokedLicenses,
      expired: expiredLicenses,
      expiring_soon: expiringIn30d,
    },
    verify_24h: {
      total: verifyLast24h,
      success: verifySuccessLast24h,
      failed: verifyLast24h - verifySuccessLast24h,
      success_rate: verifyLast24h > 0
        ? Math.round((verifySuccessLast24h / verifyLast24h) * 100)
        : 0,
    },
    hourly_chart: hourlyStats.map((r: { hour: string; count: bigint }) => ({
      hour: r.hour,
      count: Number(r.count),
    })),
    anomaly_license_ids: anomalies,
  });
});

// ── GET /logs/expiring — Licenses expiring in N days ─────────────────────
router.get('/expiring', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const days = parseInt(req.query.days as string || '30', 10);
  const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const expiring = await prisma.license.findMany({
    where: {
      revoked: false,
      expiresAt: { gt: new Date(), lt: cutoff },
    },
    orderBy: { expiresAt: 'asc' },
    select: {
      id: true, key: true, customerName: true, customerEmail: true,
      domains: true, expiresAt: true,
      product: { select: { slug: true, name: true } },
    },
  });

  res.json({ data: expiring, count: expiring.length, within_days: days });
});

export default router;
