import cron from 'node-cron';
import prisma from './lib/prisma.js';
import { runExpiryEmailCron } from './services/email.js';
import { webhookEvents } from './services/webhook.js';

export function startCronJobs(): void {

  // ── Cleanup verify logs older than 90 days — daily 02:00 ────────────────
  cron.schedule('0 2 * * *', async () => {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    try {
      const result = await prisma.verifyLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
      if (result.count > 0) console.log(`[cron] Cleaned up ${result.count} old verify logs`);
    } catch (err) { console.error('[cron] Log cleanup failed:', err); }
  });

  // ── Cleanup old webhook deliveries older than 30 days — daily 03:00 ─────
  cron.schedule('0 3 * * *', async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    try {
      const result = await prisma.webhookDelivery.deleteMany({ where: { createdAt: { lt: cutoff } } });
      if (result.count > 0) console.log(`[cron] Cleaned up ${result.count} old webhook deliveries`);
    } catch (err) { console.error('[cron] Webhook delivery cleanup failed:', err); }
  });

  // ── Expiry email notifications — daily 09:00 ─────────────────────────────
  cron.schedule('0 9 * * *', async () => {
    console.log('[cron] Running expiry email notifications...');
    try {
      await runExpiryEmailCron();
    } catch (err) { console.error('[cron] Expiry email cron failed:', err); }
  });

  // ── Fire expired webhook events — daily 00:05 ────────────────────────────
  // For licenses that expired since last run
  cron.schedule('5 0 * * *', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();
    try {
      const justExpired = await prisma.license.findMany({
        where: {
          revoked: false,
          expiresAt: { gte: yesterday, lt: now },
        },
        include: { product: { select: { slug: true } } },
      });

      for (const lic of justExpired) {
        await webhookEvents.licenseExpiringSoon(lic, 0);
      }

      if (justExpired.length > 0) {
        console.log(`[cron] Fired expired webhook for ${justExpired.length} license(s)`);
      }
    } catch (err) { console.error('[cron] Expired webhook cron failed:', err); }
  });

  // ── Fire expiring_soon webhook events — daily 09:05 ─────────────────────
  cron.schedule('5 9 * * *', async () => {
    const checkDays = [30, 7, 1];
    for (const days of checkDays) {
      const from = new Date(Date.now() + (days - 1) * 86400000);
      const to   = new Date(Date.now() + days * 86400000);
      try {
        const licenses = await prisma.license.findMany({
          where: { revoked: false, expiresAt: { gte: from, lt: to } },
          include: { product: { select: { slug: true, name: true } } },
        });
        for (const lic of licenses) {
          await webhookEvents.licenseExpiringSoon(lic, days);
        }
        if (licenses.length > 0) {
          console.log(`[cron] Fired expiring_soon webhook (${days}d) for ${licenses.length} license(s)`);
        }
      } catch (err) { console.error(`[cron] Expiring webhook (${days}d) failed:`, err); }
    }
  });

  console.log('[cron] All background jobs scheduled');
}
