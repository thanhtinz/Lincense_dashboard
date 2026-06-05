'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { licenseApi, productApi, type License, type Paginated, type ProductWithStats } from '@/lib/api';
import clsx from 'clsx';

export default function LicensesPage() {
  const { data: session } = useSession();
  const token = (session?.user as any)?.apiToken as string;

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [product, setProduct] = useState('');
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [revoking, setRevoking] = useState(false);

  const params: Record<string, string> = { page: String(page), limit: '20' };
  if (status) params.status = status;
  if (product) params.product = product;
  if (email) params.email = email;

  const { data, mutate } = useSWR<Paginated<License>>(
    token ? ['licenses', params] : null,
    () => licenseApi.list(token, params)
  );
  const { data: products } = useSWR<ProductWithStats[]>(
    token ? ['products', token] : null,
    () => productApi.list(token)
  );

  function toggleSelect(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  function toggleAll() {
    if (!data) return;
    const all = data.data.map(l => l.id);
    setSelected(s => s.length === all.length ? [] : all);
  }

  async function bulkRevoke() {
    if (!selected.length) return;
    const reason = prompt('Revoke reason (optional):') ?? undefined;
    setRevoking(true);
    try {
      await licenseApi.bulkRevoke(token, selected, reason);
      toast.success(`Revoked ${selected.length} license(s)`);
      setSelected([]);
      mutate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Licenses</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {data?.pagination.total ?? 0} total keys
          </p>
        </div>
        <Link href="/dashboard/licenses/new" className="btn btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Issue Key
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          className="input w-56"
          placeholder="Filter by email..."
          value={email}
          onChange={e => { setEmail(e.target.value); setPage(1); }}
        />
        <select className="input w-40" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
          <option value="expired">Expired</option>
        </select>
        <select className="input w-40" value={product} onChange={e => { setProduct(e.target.value); setPage(1); }}>
          <option value="">All products</option>
          {products?.map(p => <option key={p.id} value={p.slug}>{p.slug}</option>)}
        </select>
        {selected.length > 0 && (
          <button className="btn btn-danger ml-auto" onClick={bulkRevoke} disabled={revoking}>
            {revoking && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
            Revoke {selected.length} selected
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-10">
                <input type="checkbox"
                  checked={!!data?.data.length && selected.length === data.data.length}
                  onChange={toggleAll}
                  className="accent-[var(--accent)]"
                />
              </th>
              <th>Key</th>
              <th>Customer</th>
              <th>Product</th>
              <th>Domain</th>
              <th>Expires</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <tr><td colSpan={8} className="text-center py-12 text-text-muted">Loading...</td></tr>
            ) : data.data.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-text-muted">No licenses found</td></tr>
            ) : data.data.map(lic => (
              <tr key={lic.id} className={selected.includes(lic.id) ? 'bg-accent-dim/50' : ''}>
                <td>
                  <input type="checkbox"
                    checked={selected.includes(lic.id)}
                    onChange={() => toggleSelect(lic.id)}
                    className="accent-[var(--accent)]"
                  />
                </td>
                <td><span className="key-badge">{lic.key}</span></td>
                <td>
                  <div className="text-text-primary text-sm leading-none">{lic.customerName}</div>
                  <div className="text-text-muted text-xs mt-0.5">{lic.customerEmail}</div>
                </td>
                <td><span className="font-mono text-xs text-accent">{lic.product.slug}</span></td>
                <td className="font-mono text-xs text-text-secondary">{lic.domains[0]}</td>
                <td className="font-mono text-xs text-text-secondary">
                  {lic.expiresAt ? format(new Date(lic.expiresAt), 'dd MMM yyyy') : '∞'}
                </td>
                <td><StatusBadge license={lic} /></td>
                <td>
                  <Link href={`/dashboard/licenses/${lic.id}`}
                    className="text-xs text-accent hover:underline whitespace-nowrap">
                    Details →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.pagination.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-xs text-text-muted">
              Page {data.pagination.page} of {data.pagination.pages}
            </span>
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

function StatusBadge({ license }: { license: License }) {
  if (license.revoked) return <span className="status-dot revoked text-xs text-status-revoked">Revoked</span>;
  if (license.expiresAt && new Date(license.expiresAt) < new Date())
    return <span className="status-dot expired text-xs text-status-expired">Expired</span>;
  return <span className="status-dot active text-xs text-status-active">Active</span>;
}
