import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { decryptRuntimeKey, encryptForTransport, validateFingerprint, normalizeFingerprint, isTimestampFresh } from '../lib/crypto.js';
import { isVersionInRange } from '../lib/version.js';
import { checkBanned, createVerifyRateLimit } from '../middleware/rateLimit.js';
import getRedis from '../lib/redis.js';
import { webhookEvents } from '../services/webhook.js';

// VerifyResult values — mirror prisma/schema.prisma enum VerifyResult.
// Defined locally so this module type-checks independently of `prisma generate`.
const VerifyResult = {
  SUCCESS: 'SUCCESS',
  KEY_NOT_FOUND: 'KEY_NOT_FOUND',
  PRODUCT_MISMATCH: 'PRODUCT_MISMATCH',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
  DOMAIN_MISMATCH: 'DOMAIN_MISMATCH',
  VERSION_NOT_LICENSED: 'VERSION_NOT_LICENSED',
  HW_MISMATCH: 'HW_MISMATCH',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;
type VerifyResultValue = (typeof VerifyResult)[keyof typeof VerifyResult];

const router = Router();

const VerifySchema = z.object({
  key: z.string().min(10).max(100),
  product_id: z.string().min(1).max(50),
  version: z.string().min(1).max(30),
  domain: z.string().min(1).max(255).optional(),
  hw_fingerprint: z.string().optional(),
  timestamp: z.number().optional(),
  nonce: z.string().max(64).optional(),
});

type VerifyBody = z.infer<typeof VerifySchema>;

router.post(
  '/',
  checkBanned,
  createVerifyRateLimit(),
  async (req: Request, res: Response): Promise<void> => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'];

    // ── 1. Validate request body ────────────────────────────────────────────
    const parsed = VerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ valid: false, reason: 'INVALID_REQUEST' });
      return;
    }
    const body: VerifyBody = parsed.data;

    // Detect domain from request if not provided
    const domain = body.domain || req.hostname;

    // ── 2. Replay attack prevention ─────────────────────────────────────────
    if (body.timestamp && !isTimestampFresh(body.timestamp)) {
      await logVerify(body.key, domain, ip, userAgent, body.version, VerifyResult.KEY_NOT_FOUND, 'REPLAY_ATTACK');
      res.status(400).json({ valid: false, reason: 'REPLAY_ATTACK' });
      return;
    }

    if (body.nonce) {
      const redis = getRedis();
      const nonceKey = `nonce:${body.nonce}`;
      const used = await redis.get(nonceKey);
      if (used) {
        res.status(400).json({ valid: false, reason: 'REPLAY_ATTACK' });
        return;
      }
      const windowSec = parseInt(process.env.NONCE_WINDOW_SECONDS || '300', 10);
      await redis.set(nonceKey, '1', 'EX', windowSec);
    }

    // ── 3. Find license ──────────────────────────────────────────────────────
    const license = await prisma.license.findUnique({
      where: { key: body.key },
      include: { product: true },
    });

    if (!license) {
      await logVerify(body.key, domain, ip, userAgent, body.version, VerifyResult.KEY_NOT_FOUND);
      res.status(200).json({ valid: false, reason: 'KEY_NOT_FOUND' });
      return;
    }

    // ── 4. Product ID check ──────────────────────────────────────────────────
    if (license.product.slug !== body.product_id.toUpperCase()) {
      await logVerify(body.key, domain, ip, userAgent, body.version, VerifyResult.PRODUCT_MISMATCH, undefined, license.id);
      res.status(200).json({ valid: false, reason: 'PRODUCT_MISMATCH' });
      return;
    }

    // ── 5. Revoke check ──────────────────────────────────────────────────────
    if (license.revoked) {
      await logVerify(body.key, domain, ip, userAgent, body.version, VerifyResult.REVOKED, undefined, license.id);
      webhookEvents.licenseVerifyFailed(body.key, domain, 'REVOKED').catch(() => {});
      res.status(200).json({ valid: false, reason: 'REVOKED' });
      return;
    }

    // ── 6. Expiry check ──────────────────────────────────────────────────────
    if (license.expiresAt && license.expiresAt < new Date()) {
      await logVerify(body.key, domain, ip, userAgent, body.version, VerifyResult.EXPIRED, undefined, license.id);
      webhookEvents.licenseVerifyFailed(body.key, domain, 'EXPIRED').catch(() => {});
      res.status(200).json({
        valid: false,
        reason: 'EXPIRED',
        expired_at: license.expiresAt.toISOString(),
      });
      return;
    }

    // ── 7. Domain check ──────────────────────────────────────────────────────
    const normalizedDomain = domain.replace(/^www\./, '').toLowerCase();
    const domainAllowed = license.domains.some((d: string) =>
      d.replace(/^www\./, '').toLowerCase() === normalizedDomain
    );

    if (!domainAllowed) {
      await logVerify(body.key, domain, ip, userAgent, body.version, VerifyResult.DOMAIN_MISMATCH, undefined, license.id);

      // Alert: possible abuse — flag for anomaly detection
      await flagAnomalyIfNeeded(license.id, ip, getRedis());

      res.status(200).json({ valid: false, reason: 'DOMAIN_MISMATCH' });
      return;
    }

    // ── 8. Version check ────────────────────────────────────────────────────
    if (!isVersionInRange(body.version, license.versionRange)) {
      await logVerify(body.key, domain, ip, userAgent, body.version, VerifyResult.VERSION_NOT_LICENSED, undefined, license.id);
      res.status(200).json({ valid: false, reason: 'VERSION_NOT_LICENSED' });
      return;
    }

    // ── 9. Hardware fingerprint check ───────────────────────────────────────
    if (license.hwBinding) {
      if (!body.hw_fingerprint || !validateFingerprint(body.hw_fingerprint)) {
        await logVerify(body.key, domain, ip, userAgent, body.version, VerifyResult.HW_MISMATCH, 'Missing fingerprint', license.id);
        res.status(200).json({ valid: false, reason: 'HW_MISMATCH' });
        return;
      }

      // Normalize so a "sha256:"-prefixed value and a bare hex digest of the
      // same machine compare as equal across verifies.
      const incomingFp = normalizeFingerprint(body.hw_fingerprint);

      if (!license.hwFingerprint) {
        // First verify — lock in the hardware fingerprint
        await prisma.license.update({
          where: { id: license.id },
          data: { hwFingerprint: incomingFp },
        });
      } else if (normalizeFingerprint(license.hwFingerprint) !== incomingFp) {
        await logVerify(body.key, domain, ip, userAgent, body.version, VerifyResult.HW_MISMATCH, undefined, license.id);
        res.status(200).json({ valid: false, reason: 'HW_MISMATCH' });
        return;
      }
    }

    // ── 10. SUCCESS — log and return runtime key ─────────────────────────────
    await logVerify(body.key, domain, ip, userAgent, body.version, VerifyResult.SUCCESS, undefined, license.id);

    // Decrypt stored runtime key and re-encrypt for transport
    let transportKey: string;
    try {
      const rawKey = decryptRuntimeKey(license.runtimeKey);
      transportKey = encryptForTransport(rawKey);
    } catch (err) {
      console.error('[verify] Runtime key decryption failed:', err);
      res.status(500).json({ valid: false, reason: 'INTERNAL_ERROR' });
      return;
    }

    // Anomaly detection: same key from multiple IPs
    await flagAnomalyIfNeeded(license.id, ip, getRedis());

    // Fire webhook (non-blocking — verify must stay fast)
    webhookEvents.licenseVerified(body.key, domain, license.product.slug).catch(() => {});

    res.status(200).json({
      valid: true,
      runtime_key: transportKey,
      expires_at: license.expiresAt?.toISOString() ?? null,
      product: license.product.slug,
      version_ok: true,
    });
  }
);

// ─── Helpers ────────────────────────────────────────────────────────────────

async function logVerify(
  key: string,
  domain: string,
  ip: string,
  userAgent: string | undefined,
  version: string | undefined,
  result: VerifyResultValue,
  reason?: string,
  licenseId?: string
): Promise<void> {
  try {
    await prisma.verifyLog.create({
      data: {
        key,
        domain,
        ip,
        userAgent,
        version,
        result,
        reason,
        licenseId,
      },
    });
  } catch (err) {
    console.error('[verify] Failed to write log:', err);
  }
}

async function flagAnomalyIfNeeded(
  licenseId: string,
  ip: string,
  redis: ReturnType<typeof getRedis>
): Promise<void> {
  try {
    const key = `ips:${licenseId}`;
    await redis.sadd(key, ip);
    await redis.expire(key, 3600); // 1 hour window

    const ipCount = await redis.scard(key);
    if (ipCount > 2) {
      // Multiple IPs using same license — flag in Redis for admin dashboard
      await redis.set(`anomaly:${licenseId}`, String(ipCount), 'EX', 86400);
      console.warn(`[ANOMALY] License ${licenseId} used from ${ipCount} IPs in 1h`);
    }
  } catch {
    // Non-critical — don't block response
  }
}

export default router;
