import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { generateLicenseKey, encryptRuntimeKey, generateRuntimeKey } from '../lib/crypto.js';
import { requireAdmin } from '../middleware/auth.js';
import { sendIssueConfirmation } from '../services/email.js';
import { webhookEvents } from '../services/webhook.js';

const router = Router();

const IssueSchema = z.object({
  product_id: z.string().min(1).max(50),
  customer_name: z.string().min(1).max(100),
  customer_email: z.string().email(),
  domains: z.array(z.string().min(1).max(255)).min(1).max(10),
  version_range: z.string().max(50).nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  hw_binding: z.boolean().default(false),
  notes: z.string().max(500).optional(),
  max_domain_changes: z.number().int().min(0).max(10).default(3),
});

router.post('/', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const parsed = IssueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;

  // ── Find product ──────────────────────────────────────────────────────────
  const product = await prisma.product.findFirst({
    where: {
      slug: body.product_id.toUpperCase(),
      active: true,
    },
  });

  if (!product) {
    res.status(404).json({ error: `Product '${body.product_id}' not found or inactive` });
    return;
  }

  // ── Generate license key ──────────────────────────────────────────────────
  const key = generateLicenseKey(product.prefix);

  // ── Generate and encrypt runtime key ─────────────────────────────────────
  // Each license gets its own AES key (derived from product runtime key + license id)
  // This way revoking one license doesn't affect others
  const rawRuntimeKey = generateRuntimeKey();
  const encryptedRuntimeKey = encryptRuntimeKey(rawRuntimeKey);

  // ── Create license in DB ──────────────────────────────────────────────────
  const license = await prisma.license.create({
    data: {
      key,
      productId: product.id,
      customerName: body.customer_name,
      customerEmail: body.customer_email,
      domains: body.domains.map((d) => d.toLowerCase().replace(/^www\./, '')),
      versionRange: body.version_range ?? null,
      expiresAt: body.expires_at ? new Date(body.expires_at) : null,
      hwBinding: body.hw_binding,
      runtimeKey: encryptedRuntimeKey,
      notes: body.notes,
      maxDomainChanges: body.max_domain_changes,
    },
    include: { product: true },
  });

  console.log(`[issue] New license issued: ${key} → ${body.customer_email} (${product.slug})`);

  // Notify (non-blocking — must not delay the response)
  sendIssueConfirmation({
    to: license.customerEmail,
    customerName: license.customerName,
    licenseKey: license.key,
    productName: product.name,
    domains: license.domains,
    expiresAt: license.expiresAt,
    versionRange: license.versionRange,
  }).catch((e: any) => console.error('[email] Issue confirmation failed:', e.message));

  webhookEvents.licenseIssued({ ...license, product }).catch(() => {});

  res.status(201).json({
    key: license.key,
    product: product.slug,
    customer_name: license.customerName,
    customer_email: license.customerEmail,
    domains: license.domains,
    version_range: license.versionRange,
    expires_at: license.expiresAt?.toISOString() ?? null,
    hw_binding: license.hwBinding,
    created_at: license.createdAt.toISOString(),
  });
});

// ── GET /issue/:id — Get license details (admin) ──────────────────────────
router.get('/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const license = await prisma.license.findUnique({
    where: { id: req.params.id },
    include: {
      product: { select: { slug: true, name: true } },
      verifyLogs: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          domain: true,
          ip: true,
          version: true,
          result: true,
          reason: true,
          createdAt: true,
        },
      },
    },
  });

  if (!license) {
    res.status(404).json({ error: 'License not found' });
    return;
  }

  // Don't expose encrypted runtime key
  const { runtimeKey: _, ...safe } = license;
  res.json(safe);
});

// ── GET /issue — List all licenses (admin, paginated) ────────────────────
router.get('/', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '20', 10)));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (req.query.product) where.product = { slug: (req.query.product as string).toUpperCase() };
  if (req.query.status === 'active') { where.revoked = false; where.expiresAt = { gt: new Date() }; }
  if (req.query.status === 'revoked') where.revoked = true;
  if (req.query.status === 'expired') { where.revoked = false; where.expiresAt = { lt: new Date() }; }
  if (req.query.email) where.customerEmail = { contains: req.query.email as string, mode: 'insensitive' };

  const [licenses, total] = await Promise.all([
    prisma.license.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        key: true,
        customerName: true,
        customerEmail: true,
        domains: true,
        versionRange: true,
        expiresAt: true,
        hwBinding: true,
        revoked: true,
        revokedAt: true,
        createdAt: true,
        product: { select: { slug: true, name: true } },
      },
    }),
    prisma.license.count({ where }),
  ]);

  res.json({
    data: licenses,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ── PATCH /issue/:id/extend — Extend expiry ─────────────────────────────
router.patch('/:id/extend', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { expires_at } = req.body;
  if (!expires_at) {
    res.status(400).json({ error: 'expires_at is required' });
    return;
  }

  const license = await prisma.license.findUnique({ where: { id: req.params.id } });
  if (!license) { res.status(404).json({ error: 'License not found' }); return; }

  const updated = await prisma.license.update({
    where: { id: req.params.id },
    data: { expiresAt: new Date(expires_at) },
  });

  res.json({ success: true, expires_at: updated.expiresAt?.toISOString() });
});

export default router;
