import { request } from './http.js';
import { Stats } from './stats.js';

/**
 * Run a single scenario with given concurrency + duration.
 *
 * @param {object} opts
 *   scenario   - function(config) → { url, method, body, headers, expectStatus, label }
 *   config     - user config (baseUrl, tokens, etc.)
 *   concurrency - number of parallel workers
 *   durationMs - how long to run
 *   rampMs     - linear ramp-up period (gradually increase workers)
 *   maxRps     - optional RPS cap (throttle)
 *   onProgress - callback(stats) called every second
 */
export async function runScenario(opts) {
  const {
    scenario,
    config,
    concurrency = 10,
    durationMs = 10_000,
    rampMs = 2_000,
    maxRps = null,
    onProgress = null,
  } = opts;

  const stats = new Stats(scenario(config).label);
  stats.startTime = Date.now();

  let running = true;
  let totalRequests = 0;

  // Throttle: token bucket
  let tokens = maxRps || Infinity;
  const tokenInterval = maxRps ? setInterval(() => {
    tokens = Math.min(tokens + maxRps, maxRps * 2);
  }, 1000) : null;

  // Progress reporter
  const progressInterval = onProgress ? setInterval(() => {
    onProgress(stats);
  }, 1000) : null;

  // Stop after durationMs
  const stopTimer = setTimeout(() => { running = false; }, durationMs);

  // Ramp-up: add workers gradually
  async function worker(workerId) {
    // Stagger start during ramp period
    if (rampMs > 0 && concurrency > 1) {
      await sleep((rampMs / concurrency) * workerId);
    }

    while (running) {
      // Throttle check
      if (maxRps !== null) {
        if (tokens <= 0) {
          await sleep(50);
          continue;
        }
        tokens--;
      }

      const reqDef = scenario(config);
      const result = await request({
        url: reqDef.url,
        method: reqDef.method || 'GET',
        body: reqDef.body,
        headers: reqDef.headers,
        timeout: config.timeout || 10_000,
      });

      // Validate expectation
      // Count as error: network failure or 5xx server error
      if (!result.error && result.status >= 500) {
        result.error = `server_error_${result.status}`;
      }
      // Explicit expectation override
      const expectedStatus = reqDef.expectStatus;
      if (expectedStatus && !result.error) {
        const ok = Array.isArray(expectedStatus)
          ? expectedStatus.includes(result.status)
          : result.status === expectedStatus;
        if (!ok) result.error = `unexpected_status_${result.status}`;
      }

      // Custom body check — non-fatal, mark as warning not error
      if (reqDef.expectBody && result.body && !reqDef.expectBody(result.body)) {
        // Body mismatch noted but response is still a valid HTTP response
        result.bodyMismatch = true;
      }

      stats.record(result);
      totalRequests++;
    }
  }

  // Launch all workers
  const workers = Array.from({ length: concurrency }, (_, i) => worker(i));
  await Promise.all(workers);

  // Cleanup
  clearTimeout(stopTimer);
  if (tokenInterval) clearInterval(tokenInterval);
  if (progressInterval) clearInterval(progressInterval);

  stats.endTime = Date.now();
  return stats;
}

/**
 * Run a sequence of load scenarios, printing live progress.
 */
export async function runSuite(suiteConfig) {
  const results = [];

  for (const test of suiteConfig.tests) {
    process.stdout.write(`\n  >> ${test.label || test.scenario(suiteConfig.config).label}\n`);
    process.stdout.write(`    concurrency=${test.concurrency} duration=${test.durationMs / 1000}s`);
    if (test.maxRps) process.stdout.write(` maxRps=${test.maxRps}`);
    process.stdout.write('\n');

    let lastRps = 0;
    const stats = await runScenario({
      ...test,
      config: suiteConfig.config,
      onProgress: (s) => {
        const rps = s.rps.toFixed(0);
        if (rps !== lastRps) {
          process.stdout.write(`\r    ⟳ ${s.count} req | ${rps} rps | p95: ${s.p95.toFixed(0)}ms | err: ${s.errorRate.toFixed(1)}%    `);
          lastRps = rps;
        }
      },
    });

    process.stdout.write('\n');
    results.push(stats);
  }

  return results;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
