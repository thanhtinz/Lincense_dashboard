'use client';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import { statsApi, licenseApi, type Stats, type License } from '@/lib/api';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';

export default function DashboardPage() {
  const { data: session } = useSession();
  const token = (session?.user as any)?.apiToken as string;

  const { data: stats } = useSWR<Stats>(
    token ? ['stats', token] : null,
    () => statsApi.get(token),
    { refreshInterval: 30000 }
  );
  const { data: expiring } = useSWR(
    token ? ['expiring', token] : null,
    () => statsApi.expiring(token, 30)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Overview</h1>
          <p className="text-sm text-text-muted mt-0.5">License Platform · Real-time</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
          <span className="status-dot active" />
          LIVE
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Active Licenses"
          value={stats?.licenses.active ?? '—'}
          color="active"
          sub={`of ${stats?.licenses.total ?? 0} total`}
        />
        <StatCard
          label="Revoked"
          value={stats?.licenses.revoked ?? '—'}
          color="revoked"
          sub="all time"
        />
        <StatCard
          label="Expiring Soon"
          value={stats?.licenses.expiring_soon ?? '—'}
          color="warning"
          sub="within 30 days"
          href="/dashboard/licenses?status=expiring"
        />
        <StatCard
          label="Verifies (24h)"
          value={stats?.verify_24h.total ?? '—'}
          color="accent"
          sub={`${stats?.verify_24h.success_rate ?? 0}% success rate`}
        />
      </div>

      {/* Chart + Anomalies */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Hourly chart */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-text-primary">Verify Activity (24h)</h2>
            <div className="flex items-center gap-4 text-xs text-text-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent inline-block" />
                {stats?.verify_24h.success ?? 0} success
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-status-revoked inline-block" />
                {stats?.verify_24h.failed ?? 0} failed
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={stats?.hourly_chart ?? []}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="hour"
                tickFormatter={v => format(parseISO(v.replace(' ', 'T') + ':00'), 'HH:mm')}
                tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{ background: 'var(--surface-overlay)', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12 }}
                labelFormatter={v => format(parseISO((v as string).replace(' ', 'T') + ':00'), 'HH:mm dd MMM')}
              />
              <Area type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={1.5} fill="url(#grad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Anomalies */}
        <div className="card p-5">
          <h2 className="text-sm font-medium text-text-primary mb-1">Anomaly Alerts</h2>
          <p className="text-xs text-text-muted mb-4">Keys verified from multiple IPs</p>
          {stats?.anomaly_license_ids.length === 0 || !stats?.anomaly_license_ids.length ? (
            <div className="flex flex-col items-center justify-center h-32 text-text-muted">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-30"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
              <span className="text-xs">No anomalies detected</span>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.anomaly_license_ids.slice(0, 5).map(id => (
                <Link key={id} href={`/dashboard/licenses/${id}`}
                  className="flex items-center gap-2 p-2 rounded bg-status-warning/5 border border-status-warning/20 hover:border-status-warning/40 transition-colors">
                  <span className="status-dot warning text-xs text-status-warning font-mono truncate">{id.slice(-8)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expiring Soon */}
      {(expiring?.count ?? 0) > 0 && (
        <div className="card">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h2 className="text-sm font-medium text-text-primary flex items-center gap-2">
              <span className="status-dot warning" />
              Expiring in 30 Days ({expiring!.count})
            </h2>
            <Link href="/dashboard/licenses?status=expiring" className="text-xs text-accent hover:underline">
              View all →
            </Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expiring!.data.slice(0, 5).map(lic => (
                <tr key={lic.id}>
                  <td><span className="key-badge">{lic.key}</span></td>
                  <td>
                    <div className="text-text-primary text-sm">{lic.customerName}</div>
                    <div className="text-text-muted text-xs">{lic.customerEmail}</div>
                  </td>
                  <td><span className="font-mono text-xs text-accent">{lic.product.slug}</span></td>
                  <td>
                    <span className="text-status-warning text-xs font-mono">
                      {format(new Date(lic.expiresAt!), 'dd MMM yyyy')}
                    </span>
                  </td>
                  <td>
                    <Link href={`/dashboard/licenses/${lic.id}`} className="text-xs text-accent hover:underline">
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, sub, href }: {
  label: string; value: number | string;
  color: 'active' | 'revoked' | 'warning' | 'accent' | 'expired';
  sub?: string; href?: string;
}) {
  const colors = {
    active: 'var(--status-active)',
    revoked: 'var(--status-revoked)',
    warning: 'var(--status-warning)',
    accent: 'var(--accent)',
    expired: 'var(--status-expired)',
  };
  const Wrapper = href ? Link : 'div';
  return (
    <Wrapper href={href as string} className="card p-4 block hover:border-white/10 transition-colors">
      <div className="text-xs text-text-muted uppercase tracking-wider mb-3">{label}</div>
      <div className="text-2xl sm:text-3xl font-semibold" style={{ color: colors[color] }}>
        {value}
      </div>
      {sub && <div className="text-xs text-text-muted mt-1.5">{sub}</div>}
    </Wrapper>
  );
}
