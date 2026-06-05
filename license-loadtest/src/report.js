import { writeFileSync, mkdirSync } from 'fs';
import { fmtMs } from './stats.js';

const PASS = '[PASS]';
const FAIL = '[FAIL]';
const WARN = '[WARN]';

// ── Terminal report ───────────────────────────────────────────────────────
export function printReport(allResults) {
  for (const { suite, results } of allResults) {
    console.log(`\n  ${suite}`);
    console.log('  ' + '─'.repeat(98));

    const header =
      '  ' +
      'Test'.padEnd(38) +
      'Reqs'.padStart(7) +
      'RPS'.padStart(7) +
      'ErrRate'.padStart(9) +
      'p50'.padStart(8) +
      'p95'.padStart(8) +
      'p99'.padStart(8) +
      'Max'.padStart(8) +
      '  Status';
    console.log(header);
    console.log('  ' + '─'.repeat(98));

    for (const s of results) {
      const sum = s.summary();
      const errColor = sum.errorRate > 5 ? FAIL : sum.errorRate > 1 ? WARN : PASS;
      const p95Color = sum.p95 > 500 ? FAIL : sum.p95 > 200 ? WARN : PASS;
      const statusStr = Object.entries(sum.statuses)
        .map(([k, v]) => `${k}×${v}`)
        .join(' ');

      console.log(
        '  ' +
        sum.name.padEnd(38) +
        String(sum.count).padStart(7) +
        String(sum.rps).padStart(7) +
        `${sum.errorRate.toFixed(1)}%`.padStart(9) +
        fmtMs(sum.p50).padStart(8) +
        fmtMs(sum.p95).padStart(8) +
        fmtMs(sum.p99).padStart(8) +
        fmtMs(sum.max).padStart(8) +
        `  ${p95Color}${errColor} ${statusStr}`
      );
    }
  }

  // Overall verdict
  const allStats = allResults.flatMap(r => r.results);
  const maxP95 = Math.max(...allStats.map(s => s.p95));
  const maxErr = Math.max(...allStats.map(s => s.errorRate));
  const totalReqs = allStats.reduce((a, s) => a + s.count, 0);

  // Find the 1000 req/min test specifically
  const throughputTest = allStats.find(s => s.name.includes('1000 req/min'));

  console.log('\n' + '═'.repeat(60));
  console.log('  VERDICT');
  console.log('─'.repeat(60));
  console.log(`  Total requests executed : ${totalReqs.toLocaleString()}`);
  console.log(`  Peak p95 latency        : ${fmtMs(maxP95)}  ${maxP95 <= 200 ? PASS : maxP95 <= 500 ? WARN : FAIL}`);
  console.log(`  Peak error rate         : ${maxErr.toFixed(2)}%  ${maxErr < 1 ? PASS : maxErr < 5 ? WARN : FAIL}`);

  if (throughputTest) {
    const meets = throughputTest.rps >= 15 && throughputTest.errorRate < 2;
    console.log(`  1000 req/min target     : ${throughputTest.rps} rps  ${meets ? PASS + ' PASS' : FAIL + ' FAIL'}`);
  }

  const overall = maxP95 <= 500 && maxErr < 5;
  console.log(`\n  Overall: ${overall ? PASS + ' PASS — platform is production-ready' : FAIL + ' FAIL — review warnings above'}`);
  console.log('═'.repeat(60));
}

// ── Save JSON results ─────────────────────────────────────────────────────
export function saveResults(allResults, config) {
  mkdirSync('./results', { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonPath = `./results/loadtest-${ts}.json`;

  const data = {
    meta: {
      date: new Date().toISOString(),
      baseUrl: config.baseUrl,
      nodeVersion: process.version,
    },
    suites: allResults.map(({ suite, results }) => ({
      suite,
      tests: results.map(s => s.summary()),
    })),
  };

  writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  console.log(`\n  [JSON] Saved: ${jsonPath}`);

  // Generate HTML report
  const htmlPath = `./results/loadtest-${ts}.html`;
  writeFileSync(htmlPath, generateHtmlReport(data));
  console.log(`  [HTML] Report: ${htmlPath}`);
}

// ── HTML report ───────────────────────────────────────────────────────────
function generateHtmlReport(data) {
  const allTests = data.suites.flatMap(s => s.tests);
  const maxP95 = Math.max(...allTests.map(t => t.p95));
  const maxErr = Math.max(...allTests.map(t => t.errorRate));
  const totalReqs = allTests.reduce((a, t) => a + t.count, 0);
  const throughputTest = allTests.find(t => t.name.includes('1000 req/min'));
  const overallPass = maxP95 <= 500 && maxErr < 5;

  const suiteRows = data.suites.map(({ suite, tests }) => `
    <div class="suite">
      <h2>${suite}</h2>
      <table>
        <thead>
          <tr>
            <th>Test</th><th>Requests</th><th>RPS</th>
            <th>Error Rate</th><th>p50</th><th>p95</th><th>p99</th><th>Max</th><th>Status codes</th>
          </tr>
        </thead>
        <tbody>
          ${tests.map(t => {
            const p95cls = t.p95 > 500 ? 'bad' : t.p95 > 200 ? 'warn' : 'good';
            const errcls = t.errorRate > 5 ? 'bad' : t.errorRate > 1 ? 'warn' : 'good';
            const statusBadges = Object.entries(t.statuses)
              .map(([code, cnt]) => `<span class="badge badge-${code.startsWith('2') ? 'ok' : code.startsWith('4') ? 'warn' : 'bad'}">${code} ×${cnt}</span>`)
              .join(' ');
            return `
              <tr>
                <td class="name">${t.name}</td>
                <td class="num">${t.count.toLocaleString()}</td>
                <td class="num">${t.rps}</td>
                <td class="num ${errcls}">${t.errorRate.toFixed(2)}%</td>
                <td class="num">${t.p50}ms</td>
                <td class="num ${p95cls}">${t.p95}ms</td>
                <td class="num">${t.p99}ms</td>
                <td class="num">${t.max}ms</td>
                <td>${statusBadges}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>License Platform — Load Test Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --muted: #7d8590; --accent: #58a6ff;
    --good: #3fb950; --warn: #d29922; --bad: #f85149;
    --font: 'Segoe UI', system-ui, sans-serif;
    --mono: 'Cascadia Code', 'Fira Code', monospace;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; line-height: 1.6; padding: 2rem; }
  h1 { font-size: 1.6rem; font-weight: 700; margin-bottom: .25rem; }
  h2 { font-size: 1rem; font-weight: 600; color: var(--accent); margin: 2rem 0 .75rem; }
  .meta { color: var(--muted); font-size: 12px; font-family: var(--mono); margin-bottom: 2rem; }
  .verdict {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 12px 20px; border-radius: 8px; margin-bottom: 2rem;
    border: 1px solid; font-weight: 600;
  }
  .verdict.pass { background: rgba(63,185,80,.08); border-color: rgba(63,185,80,.3); color: var(--good); }
  .verdict.fail { background: rgba(248,81,73,.08); border-color: rgba(248,81,73,.3); color: var(--bad); }
  .kpis { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 2rem; }
  .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px 20px; min-width: 140px; }
  .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 4px; }
  .kpi-value { font-size: 1.5rem; font-weight: 700; font-family: var(--mono); }
  .kpi-value.good { color: var(--good); } .kpi-value.warn { color: var(--warn); } .kpi-value.bad { color: var(--bad); }
  .suite { margin-bottom: 2rem; }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  th { text-align: left; padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); border-bottom: 1px solid var(--border); font-weight: 500; }
  td { padding: 10px 14px; border-bottom: 1px solid rgba(48,54,61,.5); }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(255,255,255,.02); }
  td.name { font-size: 13px; max-width: 280px; }
  td.num { font-family: var(--mono); font-size: 13px; text-align: right; }
  td.good { color: var(--good); } td.warn { color: var(--warn); } td.bad { color: var(--bad); }
  .badge { display: inline-block; font-family: var(--mono); font-size: 11px; padding: 2px 7px; border-radius: 4px; margin: 1px; }
  .badge-ok   { background: rgba(63,185,80,.12);  color: var(--good); }
  .badge-warn { background: rgba(210,153,34,.12); color: var(--warn); }
  .badge-bad  { background: rgba(248,81,73,.12);  color: var(--bad);  }
  footer { margin-top: 3rem; color: var(--muted); font-size: 12px; font-family: var(--mono); }
</style>
</head>
<body>
<h1>License Platform — Load Test Report</h1>
<div class="meta">
  Generated: ${data.meta.date} &nbsp;·&nbsp;
  Target: ${data.meta.baseUrl} &nbsp;·&nbsp;
  Node: ${data.meta.nodeVersion}
</div>

<div class="verdict ${overallPass ? 'pass' : 'fail'}">
  ${overallPass ? 'PASS — Platform is production-ready' : 'FAIL — Issues detected, review below'}
</div>

<div class="kpis">
  <div class="kpi">
    <div class="kpi-label">Total Requests</div>
    <div class="kpi-value">${totalReqs.toLocaleString()}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Peak p95 Latency</div>
    <div class="kpi-value ${maxP95 <= 200 ? 'good' : maxP95 <= 500 ? 'warn' : 'bad'}">${maxP95}ms</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Peak Error Rate</div>
    <div class="kpi-value ${maxErr < 1 ? 'good' : maxErr < 5 ? 'warn' : 'bad'}">${maxErr.toFixed(2)}%</div>
  </div>
  ${throughputTest ? `
  <div class="kpi">
    <div class="kpi-label">Throughput (1k req/min)</div>
    <div class="kpi-value ${throughputTest.rps >= 15 ? 'good' : 'bad'}">${throughputTest.rps} rps</div>
  </div>` : ''}
</div>

${suiteRows}

<footer>License Platform Load Test Suite · https://github.com/yourcompany/license-platform</footer>
</body>
</html>`;
}
