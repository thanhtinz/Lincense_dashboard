import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

const RegisterDomainSchema = z.object({
  key: z.string().min(1),
  new_domain: z.string().min(1).max(255),
});

// ── POST /register-domain ─────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = RegisterDomainSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'key and new_domain are required' });
    return;
  }

  const { key, new_domain } = parsed.data;
  const normalizedDomain = new_domain.toLowerCase().replace(/^www\./, '');

  const license = await prisma.license.findUnique({ where: { key } });

  if (!license) {
    res.status(404).json({ error: 'License not found' });
    return;
  }

  if (license.revoked) {
    res.status(403).json({ error: 'License is revoked' });
    return;
  }

  if (license.domainChangeCount >= license.maxDomainChanges) {
    res.status(403).json({
      error: 'Domain change limit reached',
      max_changes: license.maxDomainChanges,
      current_changes: license.domainChangeCount,
    });
    return;
  }

  // Add new domain to whitelist (replace all with new one to keep it clean)
  await prisma.license.update({
    where: { key },
    data: {
      domains: [normalizedDomain],
      domainChangeCount: { increment: 1 },
    },
  });

  res.json({
    success: true,
    new_domain: normalizedDomain,
    changes_used: license.domainChangeCount + 1,
    changes_remaining: license.maxDomainChanges - license.domainChangeCount - 1,
  });
});

export default router;
