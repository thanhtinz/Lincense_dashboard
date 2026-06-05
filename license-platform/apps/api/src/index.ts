import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

// Routes
import verifyRouter from './routes/verify.js';
import issueRouter from './routes/issue.js';
import revokeRouter from './routes/revoke.js';
import registerDomainRouter from './routes/registerDomain.js';
import productsRouter from './routes/products.js';
import authRouter from './routes/auth.js';
import logsRouter from './routes/logs.js';

// Lib
import prisma from './lib/prisma.js';
import getRedis from './lib/redis.js';
import { createAdminRateLimit } from './middleware/rateLimit.js';
import { startCronJobs } from './cron.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// ── Security Middleware ───────────────────────────────────────────────────
app.set('trust proxy', 1); // Trust first proxy (Nginx)

app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.DASHBOARD_URL || 'https://license.yourdomain.com']
    : ['http://localhost:3000', 'http://localhost:3002'],
  credentials: true,
}));

// Force HTTPS in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.hostname}${req.url}`);
  }
  next();
});

app.use(express.json({ limit: '10kb' })); // Small limit — prevent body bomb
app.use(express.urlencoded({ extended: false }));

// ── Health Check ──────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redis = getRedis();
    await redis.ping();
    res.json({ status: 'ok', db: 'ok', redis: 'ok', ts: new Date().toISOString() });
  } catch (err: any) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

// ── Public Routes (no auth) ───────────────────────────────────────────────
app.use('/api/v1/verify', verifyRouter);
app.use('/api/v1/register-domain', registerDomainRouter);

// ── Admin Routes (require auth) ───────────────────────────────────────────
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/issue', createAdminRateLimit(), issueRouter);
app.use('/api/v1/revoke', createAdminRateLimit(), revokeRouter);
app.use('/api/v1/products', createAdminRateLimit(), productsRouter);
app.use('/api/v1/logs', createAdminRateLimit(), logsRouter);

// ── 404 Handler ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Start Server ──────────────────────────────────────────────────────────
async function main() {
  // Connect DB
  await prisma.$connect();
  console.log('[DB] PostgreSQL connected');

  // Connect Redis
  const redis = getRedis();
  await redis.connect();

  // Start background jobs
  startCronJobs();

  app.listen(PORT, () => {
    console.log(`\n[START] License Platform API running on port ${PORT}`);
    console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Health: http://localhost:${PORT}/health\n`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

export default app;
