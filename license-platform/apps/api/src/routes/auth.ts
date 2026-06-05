import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ── POST /auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const { email, password } = parsed.data;

  const admin = await prisma.adminUser.findUnique({
    where: { email: email.toLowerCase(), active: true },
  });

  if (!admin) {
    // Timing-safe: still run bcrypt to prevent timing attacks
    await bcrypt.compare(password, '$2b$10$invalidhashfortimingsafety111111');
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  // Update last login
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  const token = jwt.sign(
    { adminId: admin.id, email: admin.email, role: admin.role },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'] }
  );

  console.log(`[auth] Admin login: ${admin.email}`);

  res.json({
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
    expires_in: process.env.JWT_EXPIRES_IN || '8h',
  });
});

// ── GET /auth/me — Get current admin info ────────────────────────────────
router.get('/me', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const admin = await prisma.adminUser.findUnique({
    where: { id: req.admin!.adminId },
    select: { id: true, email: true, name: true, role: true, lastLoginAt: true },
  });

  if (!admin) { res.status(404).json({ error: 'Admin not found' }); return; }
  res.json(admin);
});

// ── POST /auth/change-password ───────────────────────────────────────────
router.post('/change-password', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    res.status(400).json({ error: 'current_password and new_password are required' });
    return;
  }

  if (new_password.length < 8) {
    res.status(400).json({ error: 'new_password must be at least 8 characters' });
    return;
  }

  const admin = await prisma.adminUser.findUnique({ where: { id: req.admin!.adminId } });
  if (!admin) { res.status(404).json({ error: 'Admin not found' }); return; }

  const valid = await bcrypt.compare(current_password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const newHash = await bcrypt.hash(new_password, 12);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: newHash },
  });

  res.json({ success: true, message: 'Password changed successfully' });
});

export default router;
