'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { licenseApi, type LicenseDetail } from '@/lib/api';
import Link from 'next/link';

export default function LicenseDetailPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const token = (session?.user as any)?.apiToken as string;
  const router = useRouter();

  const { data: license, mutate } = useSWR<LicenseDetail>(
    token ? ['license', params.id] : null,
    () => licenseApi.get(token, params.id)
  );

  const [revoking, setRevoking] = useState(false);
  const [extending, setExtending] = useState(false);
  const [newExpiry, setNewExpiry] = useState('');
  const [showExtend, setShowExtend] = useState(false);

  async function handleRevoke() {
    if (!license) return;
    const reason = prompt('Reason for revocation:');
    if (reason === null) return;
    setRevoking(true);
    try {
      await licenseApi.revoke(token, license.key, reason || undefined);
      toast.success('License revoked. Effective immediately.');
      mutate();
    } catch (e: any) { toast.error(e.message); }
    finally { setRevoking(false); }
  }

  async function handleRestore() {
    if (!license) return;
    setRevoking(true);
    try {
      await licenseApi.restore(token, license.key);
      toast.success('License restored.');
      mutate();
    } catch (e: any) { toast.error(e.message); }
    finally { setRevoking(false); }
  }

  async function handleExtend() {
    if (!newExpiry || !license) return;
    setExtending(true);
    try {
      await licenseApi.extend(token, license.id, new Date(newExpiry).toISOString());
      toast.success('Expiry date updated.');
      setShowExtend(false);
      mutate();
    } catch (e: any) { toast.error(e.message); }
    finally { setExtending(false); }
  }

  if (!license) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const isActive = !license.revoked && (!license.expiresAt || new Date(license.expiresAt) > new Date());

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard/licenses" className="text-xs text-text-muted hover:text-accent mb-2 inline-flex items-center gap-1">
            ← Back to Licenses
          </Link>
          <h1 className="text-xl font-semibold text-text-primary mt-1">License Detail</h1>
          <div className="mt-2"><span className="key-badge text-sm">{license.key}</span></div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button className="btn btn-ghost" onClick={() => setShowExtend(true)}>
            Extend Expiry
          </button>
          {license.revoked ? (
            <button className="btn btn-ghost" onClick={handleRestore} disabled={revoking}>
              Restore
            </button>
          ) : (
            <button className="btn btn-danger" onClick={handleRevoke} disabled={revoking}>
              {revoking && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              Revoke
            </button>
          )}
        </div>
      </div>

      {/* Revoked Banner */}
      {license.revoked && (
        <div className="bg-status-revoked/5 border border-status-revoked/25 rounded-lg p-4">
          <div className="flex items-center gap-2 text-status-revoked font-medium text-sm mb-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            License Revoked
          </div>
          <p className="text-text-secondary text-xs">
            Revoked {license.revokedAt ? format(new Date(license.revokedAt), 'dd MMM yyyy HH:mm') : ''}
            {license.revokedReason && <> — <span className="text-text-primary">{license.revokedReason}</span></>}
          </p>
        </div>
      )}

      {/* Extend Expiry Modal */}
      {showExtend && (
        <div className="card p-4 border-accent/30">
          <h3 className="text-sm font-medium text-text-primary mb-3">Extend Expiry Date</h3>
          <div className="flex gap-2">
            <input
              type="date"
              className="input"
              value={newExpiry}
              onChange={e => setNewExpiry(e.target.value)}
              min={format(new Date(), 'yyyy-MM-dd')}
            />
            <button className="btn btn-primary" onClick={handleExtend} disabled={extending || !newExpiry}>
              {extending ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : 'Save'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowExtend(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Details Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">Customer</h2>
          <dl className="space-y-3">
            <Row label="Name" value={license.customerName} />
            <Row label="Email" value={license.customerEmail} mono />
            <Row label="Product" value={license.product.slug} mono accent />
            <Row label="Status" value={
              license.revoked ? 'REVOKED' :
              (!license.expiresAt || new Date(license.expiresAt) > new Date()) ? 'ACTIVE' : 'EXPIRED'
            } mono color={license.revoked ? 'revoked' : isActive ? 'active' : 'expired'} />
          </dl>
        </div>

        <div className="card p-5">
          <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">License Config</h2>
          <dl className="space-y-3">
            <Row label="Domain(s)" value={license.domains.join(', ')} mono />
            <Row label="Version Range" value={license.versionRange ?? '* (all)'} mono />
            <Row label="Expires" value={license.expiresAt ? format(new Date(license.expiresAt), 'dd MMM yyyy') : 'Never (lifetime)'} mono />
            <Row label="HW Binding" value={license.hwBinding ? 'Enabled' : 'Disabled'} />
            {license.hwBinding && license.hwFingerprint && (
              <Row label="Fingerprint" value={license.hwFingerprint.slice(0, 20) + '…'} mono />
            )}
            <Row label="Domain Changes" value={`${license.domainChangeCount} / ${license.maxDomainChanges}`} />
          </dl>
        </div>
      </div>

      {license.notes && (
        <div className="card p-4">
          <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Notes</h2>
          <p className="text-text-secondary text-sm">{license.notes}</p>
        </div>
      )}

      {/* Verify Logs */}
      <div className="card">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium text-text-primary">Recent Verify Logs</h2>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Domain</th>
              <th>IP</th>
              <th>Version</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {license.verifyLogs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-text-muted text-xs">No verify activity yet</td></tr>
            ) : license.verifyLogs.map(log => (
              <tr key={log.id}>
                <td className="font-mono text-xs text-text-muted whitespace-nowrap">
                  {format(new Date(log.createdAt), 'dd MMM HH:mm:ss')}
                </td>
                <td className="font-mono text-xs">{log.domain}</td>
                <td className="font-mono text-xs text-text-muted">{log.ip}</td>
                <td className="font-mono text-xs text-text-muted">{log.version ?? '—'}</td>
                <td>
                  <span className={`font-mono text-xs font-medium ${
                    log.result === 'SUCCESS' ? 'text-status-active' : 'text-status-revoked'
                  }`}>
                    {log.result}
                  </span>
                  {log.reason && <span className="text-text-muted text-xs ml-1">({log.reason})</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, value, mono, accent, color }: {
  label: string; value: string;
  mono?: boolean; accent?: boolean;
  color?: 'active' | 'revoked' | 'expired' | 'accent';
}) {
  const colorMap = {
    active: 'text-status-active', revoked: 'text-status-revoked',
    expired: 'text-status-expired', accent: 'text-accent',
  };
  return (
    <div className="flex justify-between items-start gap-4">
      <dt className="text-xs text-text-muted flex-shrink-0">{label}</dt>
      <dd className={`text-sm text-right break-all ${mono ? 'font-mono' : ''} ${color ? colorMap[color] : 'text-text-primary'}`}>
        {value}
      </dd>
    </div>
  );
}
