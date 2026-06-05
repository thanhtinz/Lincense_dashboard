import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import getRedis from '../lib/redis.js';
import { Request, Response } from 'express';

/**
 * Rate limiter for /verify endpoint.
 * Max 10 requests per minute per IP.
 * On abuse → ban IP for 1 hour.
 */
export function createVerifyRateLimit() {
  const redis = getRedis();
  const maxRpm = parseInt(process.env.RATE_LIMIT_VERIFY_RPM || '10', 10);

  return rateLimit({
    windowMs: 60 * 1000,      // 1 minute
    max: maxRpm,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { valid: false, reason: 'RATE_LIMITED' },

    store: new RedisStore({
      sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as any,
      prefix: 'rl:verify:',
    }),

    // On too many requests, extend ban to 1 hour
    handler: async (req: Request, res: Response) => {
      const ip = req.ip || 'unknown';
      await redis.set(`ban:${ip}`, '1', 'EX', 3600); // 1 hour ban
      res.status(429).json({ valid: false, reason: 'RATE_LIMITED' });
    },
  });
}

/**
 * Ban check middleware — runs before rate limiter.
 */
export async function checkBanned(
  req: Request,
  res: Response,
  next: Function
): Promise<void> {
  const redis = getRedis();
  const ip = req.ip || 'unknown';
  const banned = await redis.get(`ban:${ip}`);

  if (banned) {
    res.status(429).json({ valid: false, reason: 'RATE_LIMITED' });
    return;
  }
  next();
}

/**
 * General admin API rate limiter — more lenient.
 */
export function createAdminRateLimit() {
  const redis = getRedis();

  return rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down' },

    store: new RedisStore({
      sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as any,
      prefix: 'rl:admin:',
    }),
  });
}
