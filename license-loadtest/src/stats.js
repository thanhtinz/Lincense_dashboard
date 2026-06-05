/**
 * Collects raw timing samples and computes statistics.
 */
export class Stats {
  constructor(name) {
    this.name = name;
    this.samples = [];      // durationMs per request
    this.statuses = {};     // status code counts
    this.errors = [];       // error messages
    this.successes = 0;
    this.failures = 0;
    this.startTime = null;
    this.endTime = null;
  }

  record(result) {
    this.samples.push(result.durationMs);

    const code = result.error ? 'ERR' : String(result.status);
    this.statuses[code] = (this.statuses[code] || 0) + 1;

    if (result.error) {
      this.errors.push(result.error);
      this.failures++;
    } else if (result.status >= 200 && result.status < 500) {
      // 2xx/4xx are "application-level" responses — server alive
      this.successes++;
    } else {
      this.failures++;
    }
  }

  percentile(pct) {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const idx = Math.ceil((pct / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  get min()    { return this.samples.length ? Math.min(...this.samples) : 0; }
  get max()    { return this.samples.length ? Math.max(...this.samples) : 0; }
  get mean()   { return this.samples.length ? this.samples.reduce((a, b) => a + b, 0) / this.samples.length : 0; }
  get p50()    { return this.percentile(50); }
  get p95()    { return this.percentile(95); }
  get p99()    { return this.percentile(99); }
  get count()  { return this.samples.length; }
  get errorRate() { return this.count ? (this.failures / this.count) * 100 : 0; }

  get rps() {
    if (!this.startTime || !this.endTime) return 0;
    const elapsedSec = (this.endTime - this.startTime) / 1000;
    return elapsedSec > 0 ? this.count / elapsedSec : 0;
  }

  /**
   * ASCII histogram of response time distribution.
   */
  histogram(buckets = 10) {
    if (this.samples.length === 0) return '';
    const sorted = [...this.samples].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const step = (max - min) / buckets || 1;

    const counts = Array(buckets).fill(0);
    for (const s of sorted) {
      const idx = Math.min(Math.floor((s - min) / step), buckets - 1);
      counts[idx]++;
    }

    const maxCount = Math.max(...counts);
    const barWidth = 30;
    let out = '';

    for (let i = 0; i < buckets; i++) {
      const lo = min + i * step;
      const hi = lo + step;
      const bar = '█'.repeat(Math.round((counts[i] / maxCount) * barWidth));
      const pct = ((counts[i] / this.count) * 100).toFixed(1).padStart(5);
      out += `  ${fmtMs(lo).padStart(7)}–${fmtMs(hi).padEnd(7)} │${bar.padEnd(barWidth)}│ ${pct}% (${counts[i]})\n`;
    }
    return out;
  }

  summary() {
    return {
      name: this.name,
      count: this.count,
      rps: +this.rps.toFixed(1),
      errorRate: +this.errorRate.toFixed(2),
      min: +this.min.toFixed(1),
      mean: +this.mean.toFixed(1),
      p50: +this.p50.toFixed(1),
      p95: +this.p95.toFixed(1),
      p99: +this.p99.toFixed(1),
      max: +this.max.toFixed(1),
      statuses: this.statuses,
    };
  }
}

export function fmtMs(ms) {
  if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
  return ms.toFixed(0) + 'ms';
}
