#!/usr/bin/env node
import { runSuite } from './engine.js';
import { scenarios } from './scenarios.js';
import { printReport, saveResults } from './report.js';

// ── Config ────────────────────────────────────────────────────────────────
const config = {
  baseUrl:       process.env.BASE_URL       || 'http://localhost:3001',
  adminEmail:    process.env.ADMIN_EMAIL    || 'admin@yourdomain.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'password',
  adminToken:    process.env.ADMIN_TOKEN    || null,
  validKey:      process.env.VALID_KEY      || null,
  productId:     process.env.PRODUCT_ID     || 'SHOPVPS',
  domain:        process.env.DOMAIN         || 'test.client.com',
  version:       process.env.VERSION        || '2.1.0',
  timeout:       parseInt(process.env.TIMEOUT_MS || '8000'),
};

const QUICK = !!process.env.QUICK; // QUICK=1 for fast smoke test

// ── Pre-flight: get admin token if not provided ───────────────────────────
async function preflight() {
  if (config.adminToken) return;

  process.stdout.write('\n  [AUTH] Obtaining admin token...');
  try {
    const { request } = await import('./http.js');
    const res = await request({
      url: `${config.baseUrl}/api/v1/auth/login`,
      method: 'POST',
      body: { email: config.adminEmail, password: config.adminPassword },
    });
    if (res.body?.token) {
      config.adminToken = res.body.token;
      process.stdout.write(' OK\n');
    } else {
      process.stdout.write(' SKIP (continuing without token — admin tests will 401)\n');
    }
  } catch (e) {
    process.stdout.write(` ERR (${e.message})\n`);
  }
}

// ── Test suites ───────────────────────────────────────────────────────────
function buildSuites() {
  const D = QUICK ? 5_000  : 15_000; // duration per test
  const R = QUICK ? 1_000  : 3_000;  // ramp-up

  return [
    {
      name: '1. Baseline — /health endpoint',
      description: 'Measures raw server + nginx overhead with trivial handler.',
      tests: [
        { scenario: scenarios['health'],      concurrency: 1,  durationMs: D, rampMs: 0, label: 'health / c=1  (serial)' },
        { scenario: scenarios['health'],      concurrency: 10, durationMs: D, rampMs: R, label: 'health / c=10 (low)' },
        { scenario: scenarios['health'],      concurrency: 50, durationMs: D, rampMs: R, label: 'health / c=50 (moderate)' },
      ],
    },
    {
      name: '2. Core — POST /verify (key not found)',
      description: 'Most common request. Key lookup fails fast — tests DB read + response path.',
      tests: [
        { scenario: scenarios['verify.key_not_found'], concurrency: 1,  durationMs: D, rampMs: 0, label: 'verify / c=1  (serial)' },
        { scenario: scenarios['verify.key_not_found'], concurrency: 10, durationMs: D, rampMs: R, label: 'verify / c=10' },
        { scenario: scenarios['verify.key_not_found'], concurrency: 50, durationMs: D, rampMs: R, label: 'verify / c=50' },
        { scenario: scenarios['verify.key_not_found'], concurrency: 100, durationMs: D, rampMs: R, label: 'verify / c=100 (high)' },
      ],
    },
    {
      name: '3. Target — 1000 req/min throughput test',
      description: 'Sustained load at 1000 req/min = ~17 req/s. Checks if platform meets spec.',
      tests: [
        {
          scenario: scenarios['verify.key_not_found'],
          concurrency: 20,
          durationMs: QUICK ? 10_000 : 30_000,
          rampMs: R,
          maxRps: 17, // throttle to exactly 1000/min
          label: 'verify / 1000 req/min (30s sustained)',
        },
      ],
    },
    {
      name: '4. Admin endpoints',
      description: 'Dashboard API — lower traffic, higher complexity queries.',
      tests: [
        { scenario: scenarios['logs.stats'],     concurrency: 5,  durationMs: D, rampMs: R, label: 'admin / logs stats' },
        { scenario: scenarios['licenses.list'],  concurrency: 5,  durationMs: D, rampMs: R, label: 'admin / list licenses' },
      ],
    },
    {
      name: '5. Rate limit validation',
      description: 'Verify rate limiter kicks in at 10+ req/min/IP. Expect mix of 200 and 429.',
      tests: [
        {
          scenario: scenarios['verify.rate_limit'],
          concurrency: 5,
          durationMs: QUICK ? 5_000 : 8_000,
          rampMs: 0,
          label: 'verify / rate limit (expects 429s)',
        },
      ],
    },
  ];
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  LICENSE PLATFORM — Load Test Suite');
  console.log('═'.repeat(60));
  console.log(`  Target:  ${config.baseUrl}`);
  console.log(`  Mode:    ${QUICK ? 'Quick (5s/test)' : 'Full (15s/test)'}`);
  console.log(`  Date:    ${new Date().toISOString()}`);
  console.log('─'.repeat(60));

  await preflight();

  const suites = buildSuites();
  const allResults = [];

  for (const suite of suites) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  [SUITE] ${suite.name}`);
    console.log(`  ${suite.description}`);

    const results = await runSuite({ tests: suite.tests, config });
    allResults.push({ suite: suite.name, results });
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  RESULTS SUMMARY');
  console.log('═'.repeat(60));

  printReport(allResults);
  saveResults(allResults, config);
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
