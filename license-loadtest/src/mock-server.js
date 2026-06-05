/**
 * Minimal mock of the License Platform API.
 * Mimics real response times with slight DB simulation delay.
 * Used for local benchmarking without needing a real DB.
 */
import http from 'http';

const PORT = 3001;

// Simulate DB lookup: ~2-5ms
function dbDelay() {
  return new Promise(r => setTimeout(r, 2 + Math.random() * 3));
}

// Simulate Redis cache hit: ~0.5ms
function cacheDelay() {
  return new Promise(r => setTimeout(r, Math.random() * 0.5));
}

let requestCount = 0;

const server = http.createServer(async (req, res) => {
  requestCount++;

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Request-Id', requestCount.toString());

  // Parse body
  let body = '';
  for await (const chunk of req) body += chunk;
  let parsed = {};
  try { parsed = JSON.parse(body); } catch {}

  // Route
  if (path === '/health') {
    await cacheDelay();
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', db: 'ok', redis: 'ok' }));
    return;
  }

  if (path === '/api/v1/verify' && req.method === 'POST') {
    await dbDelay();
    const key = parsed.key || '';

    if (!key) {
      res.writeHead(400);
      res.end(JSON.stringify({ valid: false, reason: 'INVALID_REQUEST' }));
      return;
    }

    // Simulate rate limiting: track per-IP req count
    const ip = req.socket.remoteAddress;
    rateLimiter[ip] = (rateLimiter[ip] || 0) + 1;
    setTimeout(() => { if (rateLimiter[ip]) rateLimiter[ip]--; }, 60000);

    if (rateLimiter[ip] > 10) {
      res.writeHead(429);
      res.end(JSON.stringify({ valid: false, reason: 'RATE_LIMITED' }));
      return;
    }

    // Valid key pattern
    if (key.startsWith('LIC-SVP-VALID')) {
      res.writeHead(200);
      res.end(JSON.stringify({
        valid: true,
        runtime_key: 'v1:bW9ja3J1bnRpbWVrZXk=',
        expires_at: '2027-01-01T00:00:00Z',
        product: 'SHOPVPS',
        version_ok: true,
      }));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({ valid: false, reason: 'KEY_NOT_FOUND' }));
    return;
  }

  if (path === '/api/v1/auth/login' && req.method === 'POST') {
    await dbDelay();
    if (parsed.email && parsed.password) {
      res.writeHead(200);
      res.end(JSON.stringify({
        token: 'mock.jwt.token.for.testing',
        admin: { id: '1', email: parsed.email, name: 'Admin', role: 'SUPER_ADMIN' },
      }));
    } else {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Invalid credentials' }));
    }
    return;
  }

  if (path === '/api/v1/logs/stats' && req.method === 'GET') {
    await dbDelay();
    await dbDelay(); // Stats query is heavier
    res.writeHead(200);
    res.end(JSON.stringify({
      licenses: { total: 142, active: 128, revoked: 10, expired: 4, expiring_soon: 8 },
      verify_24h: { total: 3840, success: 3790, failed: 50, success_rate: 98 },
      hourly_chart: Array.from({ length: 24 }, (_, i) => ({ hour: `2026-06-01 ${String(i).padStart(2,'0')}:00`, count: Math.floor(Math.random() * 200) + 50 })),
      anomaly_license_ids: [],
    }));
    return;
  }

  if (path === '/api/v1/issue' && req.method === 'GET') {
    await dbDelay();
    res.writeHead(200);
    res.end(JSON.stringify({
      data: Array.from({ length: 20 }, (_, i) => ({
        id: `id-${i}`, key: `LIC-SVP-TEST${i.toString().padStart(4,'0')}-ABCD-XY`,
        customerName: `Customer ${i}`, customerEmail: `c${i}@example.com`,
        domains: [`shop${i}.client.com`], revoked: false,
        expiresAt: '2027-01-01T00:00:00Z', createdAt: new Date().toISOString(),
        product: { slug: 'SHOPVPS', name: 'ShopVPS' },
      })),
      pagination: { page: 1, limit: 20, total: 142, pages: 8 },
    }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

const rateLimiter = {};

server.listen(PORT, () => {
  console.log(`  Mock API server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  server.close();
  console.log(`\n  Mock server stopped. Handled ${requestCount} total requests.`);
  process.exit(0);
});

export { server };
