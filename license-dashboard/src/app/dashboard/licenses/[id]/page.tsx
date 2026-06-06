'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { licenseApi, type LicenseDetail } from '@/lib/api';
import { DateField } from '@/components/DateField';
import Link from 'next/link';

export default function LicenseDetailPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const token = (session?.user as any)?.apiToken as string;
  const router = useRouter();

  const { data: license, mutate } = useSWR<LicenseDetail>(
    token ? ['license', params.id] : null,
    () => licenseApi.get(token, params.id)
  );

  const [keyCopied, setKeyCopied] = useState(false);
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

  // ── Edit license fields ──────────────────────────────────────────────────
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState({
    customer_name: '', customer_email: '', version_range: '',
    max_domain_changes: '3', notes: '', hw_binding: false,
  });

  function openEdit() {
    if (!license) return;
    setEdit({
      customer_name: license.customerName,
      customer_email: license.customerEmail,
      version_range: license.versionRange ?? '',
      max_domain_changes: String(license.maxDomainChanges),
      notes: license.notes ?? '',
      hw_binding: license.hwBinding,
    });
    setShowEdit(true);
  }

  async function handleSaveEdit() {
    if (!license) return;
    setSaving(true);
    try {
      await licenseApi.update(token, license.id, {
        customer_name: edit.customer_name,
        customer_email: edit.customer_email,
        version_range: edit.version_range.trim() || null,
        max_domain_changes: parseInt(edit.max_domain_changes || '0', 10),
        notes: edit.notes.trim() || null,
        hw_binding: edit.hw_binding,
      });
      toast.success('License updated.');
      setShowEdit(false);
      mutate();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  // ── Domain management ────────────────────────────────────────────────────
  const [newDomain, setNewDomain] = useState('');
  const [domainBusy, setDomainBusy] = useState(false);

  async function handleAddDomain() {
    if (!license || !newDomain.trim()) return;
    const d = newDomain.trim().toLowerCase().replace(/^www\./, '');
    if (license.domains.includes(d)) { toast.error('Domain already exists'); return; }
    setDomainBusy(true);
    try {
      await licenseApi.update(token, license.id, { domains: [...license.domains, d] });
      toast.success('Domain added.');
      setNewDomain('');
      mutate();
    } catch (e: any) { toast.error(e.message); }
    finally { setDomainBusy(false); }
  }

  async function handleRemoveDomain(d: string) {
    if (!license) return;
    if (license.domains.length <= 1) { toast.error('At least one domain is required'); return; }
    setDomainBusy(true);
    try {
      await licenseApi.update(token, license.id, { domains: license.domains.filter(x => x !== d) });
      toast.success('Domain removed.');
      mutate();
    } catch (e: any) { toast.error(e.message); }
    finally { setDomainBusy(false); }
  }

  // ── Delete license ───────────────────────────────────────────────────────
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    if (!license) return;
    if (!confirm(`Xoá vĩnh viễn key ${license.key}? Không thể hoàn tác.`)) return;
    setDeleting(true);
    try {
      await licenseApi.remove(token, license.id);
      toast.success('License deleted.');
      router.push('/dashboard/licenses');
    } catch (e: any) { toast.error(e.message); setDeleting(false); }
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
      <div>
        <Link href="/dashboard/licenses" className="text-xs text-text-muted hover:text-accent mb-2 inline-flex items-center gap-1">
          ← Back to Licenses
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-1">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-lg font-semibold text-text-primary flex-shrink-0">License</h1>
            <span className="key-badge text-xs truncate max-w-[220px] sm:max-w-none">{license.key}</span>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(license.key);
                setKeyCopied(true);
                setTimeout(() => setKeyCopied(false), 2000);
              }}
              className="flex-shrink-0 p-1 rounded text-text-muted hover:text-accent transition-colors"
              title="Copy key"
            >
              {keyCopied
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--status-active)" strokeWidth="2.5"><path d="m20 6-11 11-5-5"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '12px' }} onClick={openEdit}>Sửa</button>
            <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '12px' }} onClick={() => setShowExtend(true)}>Gia hạn</button>
            {license.revoked ? (
              <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '12px' }} onClick={handleRestore} disabled={revoking}>
                {revoking && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                Khôi phục
              </button>
            ) : (
              <button className="btn btn-danger" style={{ padding: '5px 10px', fontSize: '12px' }} onClick={handleRevoke} disabled={revoking}>
                {revoking && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                Thu hồi
              </button>
            )}
            <button className="btn btn-danger" style={{ padding: '5px 10px', fontSize: '12px' }} onClick={handleDelete} disabled={deleting}>
              {deleting && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              Xoá
            </button>
          </div>
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
          <DateField value={newExpiry} onChange={setNewExpiry} className="mb-3" />
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handleExtend} disabled={extending || !newExpiry}>
              {extending ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : 'Save'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowExtend(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div className="card p-4 border-accent/30 space-y-3">
          <h3 className="text-sm font-medium text-text-primary">Sửa thông tin key</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Khách hàng</label>
              <input className="input" value={edit.customer_name}
                onChange={e => setEdit(s => ({ ...s, customer_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Email</label>
              <input className="input font-mono" value={edit.customer_email}
                onChange={e => setEdit(s => ({ ...s, customer_email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Version range</label>
              <input className="input font-mono" placeholder="* (tất cả)" value={edit.version_range}
                onChange={e => setEdit(s => ({ ...s, version_range: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Giới hạn đổi domain</label>
              <input className="input" type="number" min={0} value={edit.max_domain_changes}
                onChange={e => setEdit(s => ({ ...s, max_domain_changes: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Ghi chú</label>
            <input className="input" value={edit.notes}
              onChange={e => setEdit(s => ({ ...s, notes: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={edit.hw_binding}
              onChange={e => setEdit(s => ({ ...s, hw_binding: e.target.checked }))} />
            Khoá phần cứng (HW binding)
          </label>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
              {saving ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : 'Lưu'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowEdit(false)}>Cancel</button>
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
            <div className="flex justify-between items-start gap-4">
              <dt className="text-xs text-text-muted flex-shrink-0 pt-1">Domain(s)</dt>
              <dd className="text-sm text-right min-w-0">
                <div className="flex flex-wrap gap-1.5 justify-end mb-2">
                  {license.domains.map(d => (
                    <span key={d} className="inline-flex items-center gap-1 font-mono text-xs bg-surface-overlay border border-border rounded px-2 py-0.5">
                      <span className="break-all">{d}</span>
                      <button onClick={() => handleRemoveDomain(d)} disabled={domainBusy}
                        className="text-text-muted hover:text-status-revoked leading-none" aria-label="Remove domain">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5 justify-end">
                  <input className="input" style={{ maxWidth: '170px' }} placeholder="thêm domain..."
                    value={newDomain} onChange={e => setNewDomain(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddDomain(); } }} />
                  <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={handleAddDomain} disabled={domainBusy || !newDomain.trim()}>Thêm</button>
                </div>
              </dd>
            </div>
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
