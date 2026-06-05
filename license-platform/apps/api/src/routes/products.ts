import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';
import { generateRuntimeKey, encryptRuntimeKey } from '../lib/crypto.js';

const router = Router();

const ProductSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).toUpperCase(),
  prefix: z.string().min(2).max(5).toUpperCase(),
  description: z.string().max(500).optional(),
  versions: z.array(z.string()).default([]),
});

// ── GET /products ─────────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      slug: true,
      prefix: true,
      description: true,
      versions: true,
      active: true,
      createdAt: true,
      _count: { select: { licenses: true } },
    },
  });

  // Add active license counts
  const withStats = await Promise.all(
    products.map(async (p: { id: string; [key: string]: any }) => {
      const activeLicenses = await prisma.license.count({
        where: { productId: p.id, revoked: false },
      });
      return { ...p, active_licenses: activeLicenses };
    })
  );

  res.json(withStats);
});

// ── GET /products/:id ─────────────────────────────────────────────────────
router.get('/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, name: true, slug: true, prefix: true,
      description: true, versions: true, active: true, createdAt: true,
      // Don't expose runtimeKey
    },
  });

  if (!product) { res.status(404).json({ error: 'Product not found' }); return; }
  res.json(product);
});

// ── POST /products ────────────────────────────────────────────────────────
router.post('/', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const parsed = ProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;

  // Check uniqueness
  const existing = await prisma.product.findFirst({
    where: { OR: [{ slug: body.slug }, { prefix: body.prefix }] },
  });

  if (existing) {
    res.status(409).json({
      error: `Product with slug '${body.slug}' or prefix '${body.prefix}' already exists`,
    });
    return;
  }

  // Generate runtime key for this product
  const rawRuntimeKey = generateRuntimeKey();
  const encryptedRuntimeKey = encryptRuntimeKey(rawRuntimeKey);

  const product = await prisma.product.create({
    data: {
      name: body.name,
      slug: body.slug,
      prefix: body.prefix,
      description: body.description,
      versions: body.versions,
      runtimeKey: encryptedRuntimeKey,
    },
    select: {
      id: true, name: true, slug: true, prefix: true,
      description: true, versions: true, active: true, createdAt: true,
    },
  });

  console.log(`[products] New product created: ${product.slug} | Admin: ${req.admin?.email}`);
  res.status(201).json(product);
});

// ── PATCH /products/:id ───────────────────────────────────────────────────
router.patch('/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const UpdateSchema = ProductSchema.partial().extend({ active: z.boolean().optional() });
  const parsed = UpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) { res.status(404).json({ error: 'Product not found' }); return; }

  const { ...updateData } = parsed.data;

  const updated = await prisma.product.update({
    where: { id: req.params.id },
    data: updateData,
    select: {
      id: true, name: true, slug: true, prefix: true,
      description: true, versions: true, active: true, updatedAt: true,
    },
  });

  res.json(updated);
});

// ── DELETE /products/:id — Soft delete (deactivate) ──────────────────────
router.delete('/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) { res.status(404).json({ error: 'Product not found' }); return; }

  const activeLicenses = await prisma.license.count({
    where: { productId: req.params.id, revoked: false },
  });

  if (activeLicenses > 0) {
    res.status(409).json({
      error: `Cannot delete product with ${activeLicenses} active license(s). Revoke all licenses first.`,
    });
    return;
  }

  await prisma.product.update({
    where: { id: req.params.id },
    data: { active: false },
  });

  res.json({ success: true, message: 'Product deactivated' });
});

export default router;
