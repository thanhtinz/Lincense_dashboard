/**
 * All test scenarios.
 * Each scenario returns a function(config) → Promise<result>.
 */

export const scenarios = {

  // ── Scenario 1: POST /verify — invalid key (fastest path) ─────────────────
  'verify.key_not_found': (cfg) => ({
    url: `${cfg.baseUrl}/api/v1/verify`,
    method: 'POST',
    body: {
      key: 'LIC-SVP-NOTEXIST-XXXX-ZZ',
      product_id: 'SHOPVPS',
      version: '2.1.0',
      domain: 'test.client.com',
      timestamp: Date.now(),
      nonce: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
    },
    // 200 with {valid:false} is the correct response
    label: 'verify / key not found',
  }),

  // ── Scenario 2: POST /verify — valid key (full happy path) ────────────────
  'verify.valid': (cfg) => ({
    url: `${cfg.baseUrl}/api/v1/verify`,
    method: 'POST',
    body: {
      key: cfg.validKey || 'LIC-SVP-TESTKEY1-ABCD-XY',
      product_id: cfg.productId || 'SHOPVPS',
      version: cfg.version || '2.1.0',
      domain: cfg.domain || 'test.client.com',
      timestamp: Date.now(),
      nonce: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
    },
    expectStatus: 200,
    label: 'verify / valid key',
  }),

  // ── Scenario 3: POST /auth/login ──────────────────────────────────────────
  'auth.login': (cfg) => ({
    url: `${cfg.baseUrl}/api/v1/auth/login`,
    method: 'POST',
    body: { email: cfg.adminEmail, password: cfg.adminPassword },
    expectStatus: 200,
    label: 'auth / login',
  }),

  // ── Scenario 4: GET /logs/stats (admin, with token) ───────────────────────
  'logs.stats': (cfg) => ({
    url: `${cfg.baseUrl}/api/v1/logs/stats`,
    method: 'GET',
    headers: cfg.adminToken ? { Authorization: `Bearer ${cfg.adminToken}` } : {},
    expectStatus: 200,
    label: 'logs / stats dashboard',
  }),

  // ── Scenario 5: GET /issue?limit=20 (list licenses) ──────────────────────
  'licenses.list': (cfg) => ({
    url: `${cfg.baseUrl}/api/v1/issue?limit=20`,
    method: 'GET',
    headers: cfg.adminToken ? { Authorization: `Bearer ${cfg.adminToken}` } : {},
    expectStatus: 200,
    label: 'licenses / list',
  }),

  // ── Scenario 6: GET /health ───────────────────────────────────────────────
  'health': (cfg) => ({
    url: `${cfg.baseUrl}/health`,
    method: 'GET',
    expectStatus: 200,
    label: 'health check',
  }),

  // ── Scenario 7: Rate limit detection — burst 20 req rapid ────────────────
  'verify.rate_limit': (cfg) => ({
    url: `${cfg.baseUrl}/api/v1/verify`,
    method: 'POST',
    body: {
      key: 'LIC-SVP-RATELIMIT-TEST-ZZ',
      product_id: 'SHOPVPS',
      version: '2.0.0',
      domain: 'ratelimit.test.com',
      timestamp: Date.now(),
      nonce: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
    },
    expectStatus: [200, 429], // either valid response or rate limited
    label: 'verify / rate limit behavior',
  }),
};

// Crypto UUID fallback for older Node
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
