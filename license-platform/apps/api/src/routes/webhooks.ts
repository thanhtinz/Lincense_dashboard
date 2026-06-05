import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';
import { deliverWebhook, signPayload, type WebhookEvent } from '../services/webhook.js';

const router = Router();

const VALID_EVENTS: WebhookEvent[] = [
  'license.issued', 'license.revoked', 'license.restored',
  'license.expired', 'license.expiring_soon',
  'license.verified', 'license.verify_failed', 'license.domain_changed',
];

const WebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  description: z.string().max(200).optional(),
  active: z.boolean().default(true),
});

// ── GET /webhooks — list all ──────────────────────────────────────────────
router.get('/', requireAdmin, async (_req: Request, res: Response) => {
  const webhooks = await prisma.webhook.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, url: true, events: true, description: true,
      active: true, createdAt: true,
      _count: { select: { deliveries: true } },
    },
  });

  // Mask secret — never return full secret
  res.json(webhooks);
});

// ── POST /webhooks — create ───────────────────────────────────────────────
router.post('/', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const parsed = WebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { url, events, description, active } = parsed.data;

  // Validate events
  const invalid = events.filter(e => e !== '*' && !VALID_EVENTS.includes(e as WebhookEvent));
  if (invalid.length > 0) {
    res.status(400).json({ error: `Invalid events: ${invalid.join(', ')}`, valid_events: ['*', ...VALID_EVENTS] });
    return;
  }

  // Generate secret
  const secret = crypto.randomBytes(32).toString('hex');

  const webhook = await prisma.webhook.create({
    data: { url, events, description, active, secret },
    select: { id: true, url: true, events: true, description: true, active: true, createdAt: true },
  });

  console.log(`[webhook] Created: ${url} | Admin: ${req.admin?.email}`);

  // Return secret ONCE at creation — never again
  res.status(201).json({
    ...webhook,
    secret, // NOTE: Only returned once — save this!
    note: 'Save the secret — it will not be shown again. Use it to verify X-License-Signature headers.',
  });
});

// ── PATCH /webhooks/:id ───────────────────────────────────────────────────
router.patch('/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const UpdateSchema = WebhookSchema.partial();
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const wh = await prisma.webhook.findUnique({ where: { id: req.params.id } });
  if (!wh) { res.status(404).json({ error: 'Webhook not found' }); return; }

  const updated = await prisma.webhook.update({
    where: { id: req.params.id },
    data: parsed.data,
    select: { id: true, url: true, events: true, description: true, active: true, updatedAt: true },
  });

  res.json(updated);
});

// ── DELETE /webhooks/:id ──────────────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const wh = await prisma.webhook.findUnique({ where: { id: req.params.id } });
  if (!wh) { res.status(404).json({ error: 'Webhook not found' }); return; }

  await prisma.webhook.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// ── POST /webhooks/:id/rotate-secret ─────────────────────────────────────
router.post('/:id/rotate-secret', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const wh = await prisma.webhook.findUnique({ where: { id: req.params.id } });
  if (!wh) { res.status(404).json({ error: 'Webhook not found' }); return; }

  const newSecret = crypto.randomBytes(32).toString('hex');
  await prisma.webhook.update({ where: { id: req.params.id }, data: { secret: newSecret } });

  res.json({
    success: true,
    secret: newSecret,
    note: 'Update your endpoint to use the new secret. Old secret is no longer valid.',
  });
});

// ── POST /webhooks/:id/test — send a test event ───────────────────────────
router.post('/:id/test', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const wh = await prisma.webhook.findUnique({ where: { id: req.params.id } });
  if (!wh) { res.status(404).json({ error: 'Webhook not found' }); return; }

  const testPayload = {
    event: 'license.issued' as WebhookEvent,
    timestamp: new Date().toISOString(),
    data: {
      key: 'LIC-SVP-TEST1234-ABCD-XY',
      product: 'SHOPVPS',
      customer_email: 'test@example.com',
      customer_name: 'Test Customer',
      domains: ['test.client.com'],
      expires_at: null,
      _test: true,
    },
  };

  const result = await deliverWebhook({
    url: wh.url,
    secret: wh.secret,
    payload: testPayload,
    webhookId: `test-${wh.id}`,
  });

  res.json({
    success: result.success,
    status: result.status,
    error: result.error,
    payload_sent: testPayload,
    signature_example: signPayload(JSON.stringify(testPayload), wh.secret),
  });
});

// ── GET /webhooks/:id/deliveries — delivery history ───────────────────────
router.get('/:id/deliveries', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
  const limit = Math.min(50, parseInt(req.query.limit as string || '20', 10));

  const [deliveries, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where: { webhookId: req.params.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, event: true, statusCode: true, attempt: true,
        success: true, responseBody: true, createdAt: true,
      },
    }),
    prisma.webhookDelivery.count({ where: { webhookId: req.params.id } }),
  ]);

  res.json({
    data: deliveries,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ── GET /webhooks/events — list available events ──────────────────────────
router.get('/events', requireAdmin, (_req: Request, res: Response) => {
  res.json({
    events: VALID_EVENTS,
    wildcard: '*',
    descriptions: {
      'license.issued':        'Fired when a new license key is created',
      'license.revoked':       'Fired when a license is revoked',
      'license.restored':      'Fired when a revoked license is restored',
      'license.expired':       'Fired when a license passes its expiry date (cron)',
      'license.expiring_soon': 'Fired 30/7/1 days before expiry (cron)',
      'license.verified':      'Fired on every successful verify call',
      'license.verify_failed': 'Fired when verify fails (revoked/domain/etc)',
      'license.domain_changed':'Fired when domain whitelist is updated',
      '*':                     'Subscribe to all events',
    },
  });
});

export default router;
