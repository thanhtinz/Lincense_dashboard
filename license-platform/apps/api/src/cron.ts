import cron from 'node-cron';
import prisma from './lib/prisma.js';

export function startCronJobs(): void {
  // ── Cleanup verify logs older than 90 days — runs daily at 2am ──────────
  cron.schedule('0 2 * * *', async () => {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    try {
      const result = await prisma.verifyLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        console.log(`[cron] Cleaned up ${result.count} old verify logs`);
      }
    } catch (err) {
      console.error('[cron] Log cleanup failed:', err);
    }
  });

  // ── Check expiring licenses — runs daily at 9am ──────────────────────────
  cron.schedule('0 9 * * *', async () => {
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    try {
      const expiringSoon = await prisma.license.count({
        where: { revoked: false, expiresAt: { gt: new Date(), lt: in30Days } },
      });
      const expiringCritical = await prisma.license.count({
        where: { revoked: false, expiresAt: { gt: new Date(), lt: in7Days } },
      });

      if (expiringSoon > 0) {
        console.warn(`[cron] WARN ${expiringSoon} license(s) expiring in 30 days (${expiringCritical} critical within 7 days)`);
      }
    } catch (err) {
      console.error('[cron] Expiry check failed:', err);
    }
  });

  console.log('[cron] Background jobs scheduled');
}
