'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { logApi, type VerifyLog, type Paginated } from '@/lib/api';
import Link from 'next/link';

const RESULT_COLORS: Record<string, string> = {
  SUCCESS: 'text-status-active',
  KEY_NOT_FOUND: 'text-status-revoked',
  REVOKED: 'text-status-revoked',
  EXPIRED: 'text-status-expired',
  DOMAIN_MISMATCH: 'text-status-warning',
  VERSION_NOT_LICENSED: 'text-status-warning',
  HW_MISMATCH: 'text-status-warning',
  PRODUCT_MISMATCH: 'text-status-revoked',
  RATE_LIMITED: 'text-text-muted',
};

export default function LogsPage() {
  const { data: session } = useSession();
  const token = (session?.user as any)?.apiToken as string;

  const [page, setPage] = useState(1);
  const [result, setResult] = useState('');
  const [domain, setDomain] = useState('');
  const [ip, setIp] = useState('');

  const params: Record<string, string> = { page: String(page), limit: '50' };
  if (result) params.result = result;
  if (domain) params.domain = domain;
  if (ip) params.ip = ip;

  const { data } = useSWR<Paginated<VerifyLog>>(
    token ? ['logs', params] : null,
    () => logApi.list(token, params),
    { refreshInterval: 15000 }
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Verify Logs</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {data?.pagination.total ?? 0} records · auto-refreshes every 15s
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
          <span className="status-dot active animate-pulse-dot" />
          LIVE
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input className="input w-full sm:w-48" placeholder="Filter domain..."
          value={domain} onChange={e => { setDomain(e.target.value); setPage(1); }} />
        <input className="input w-full sm:w-40 font-mono text-xs" placeholder="Filter IP..."
          value={ip} onChange={e => { setIp(e.target.value); setPage(1); }} />
        <select className="input w-full sm:w-52" value={result} onChange={e => { setResult(e.target.value); setPage(1); }}>
          <option value="">All results</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="KEY_NOT_FOUND">KEY_NOT_FOUND</option>
          <option value="REVOKED">REVOKED</option>
          <option value="EXPIRED">EXPIRED</option>
          <option value="DOMAIN_MISMATCH">DOMAIN_MISMATCH</option>
          <option value="VERSION_NOT_LICENSED">VERSION_NOT_LICENSED</option>
          <option value="HW_MISMATCH">HW_MISMATCH</option>
          <option value="RATE_LIMITED">RATE_LIMITED</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Key</th>
              <th>Customer</th>
              <th>Domain</th>
              <th>IP</th>
              <th>Version</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <tr><td colSpan={7} className="text-center py-12 text-text-muted">Loading...</td></tr>
            ) : data.data.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-text-muted">No logs found</td></tr>
            ) : data.data.map(log => (
              <tr key={log.id}>
                <td className="font-mono text-xs text-text-muted whitespace-nowrap">
                  {format(new Date(log.createdAt), 'dd MMM HH:mm:ss')}
                </td>
                <td>
                  {log.license ? (
                    <Link href={`/dashboard/licenses/${log.licenseId ?? ''}`} className="key-badge hover:border-accent/40 transition-colors">
                      {log.key.slice(-12)}
                    </Link>
                  ) : (
                    <span className="key-badge opacity-50">{log.key.slice(-12)}</span>
                  )}
                </td>
                <td>
                  {log.license ? (
                    <div>
                      <div className="text-text-primary text-xs">{log.license.customerName}</div>
                      <div className="text-text-muted text-[11px]">{log.license.product.slug}</div>
                    </div>
                  ) : <span className="text-text-muted text-xs">—</span>}
                </td>
                <td className="font-mono text-xs text-text-secondary">{log.domain}</td>
                <td className="font-mono text-xs text-text-muted">{log.ip}</td>
                <td className="font-mono text-xs text-text-muted">{log.version ?? '—'}</td>
                <td>
                  <span className={`font-mono text-xs font-medium ${RESULT_COLORS[log.result] ?? 'text-text-secondary'}`}>
                    {log.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data && data.pagination.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-xs text-text-muted">Page {data.pagination.page} of {data.pagination.pages}</span>
            <div className="flex gap-2">
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '12px' }}
                onClick={() => setPage(p => p - 1)} disabled={page === 1}>← Prev</button>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '12px' }}
                onClick={() => setPage(p => p + 1)} disabled={page >= data.pagination.pages}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
