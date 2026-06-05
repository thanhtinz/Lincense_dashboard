import http from 'http';
import https from 'https';
import { performance } from 'perf_hooks';

/**
 * Low-level HTTP request — no dependencies.
 * Returns { status, body, durationMs, error }
 */
export async function request(options) {
  return new Promise((resolve) => {
    const start = performance.now();
    const proto = options.url.startsWith('https') ? https : http;
    const url = new URL(options.url);

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (options.url.startsWith('https') ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LicenseLoadTest/1.0',
        ...(options.headers || {}),
      },
      timeout: options.timeout || 10000,
    };

    const body = options.body ? JSON.stringify(options.body) : null;
    if (body) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = proto.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const durationMs = performance.now() - start;
        let parsed = null;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body: parsed, durationMs, error: null });
      });
    });

    req.on('error', (err) => {
      const durationMs = performance.now() - start;
      resolve({ status: 0, body: null, durationMs, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      const durationMs = performance.now() - start;
      resolve({ status: 0, body: null, durationMs, error: 'TIMEOUT' });
    });

    if (body) req.write(body);
    req.end();
  });
}
