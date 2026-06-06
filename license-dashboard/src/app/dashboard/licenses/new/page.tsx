'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { licenseApi, productApi, type ProductWithStats } from '@/lib/api';
import { DateField } from '@/components/DateField';
import Link from 'next/link';

export default function IssueLicensePage() {
  const { data: session } = useSession();
  const token = (session?.user as any)?.apiToken as string;
  const router = useRouter();

  const { data: products } = useSWR<ProductWithStats[]>(
    token ? ['products', token] : null,
    () => productApi.list(token)
  );

  const [form, setForm] = useState({
    product_id: '',
    customer_name: '',
    customer_email: '',
    domains: '',
    version_range: '',
    expires_at: '',
    hw_binding: false,
    notes: '',
    max_domain_changes: '3',
  });
  const [loading, setLoading] = useState(false);
  const [issuedKey, setIssuedKey] = useState('');
  const [copied, setCopied] = useState(false);

  function set(k: keyof typeof form, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.product_id || !form.customer_name || !form.customer_email || !form.domains) {
      toast.error('Please fill in all required fields');
      return;
    }

    const domains = form.domains.split('\n').map(d => d.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean);
    if (domains.length === 0) { toast.error('At least one domain required'); return; }

    setLoading(true);
    try {
      const res = await licenseApi.issue(token, {
        product_id: form.product_id,
        customer_name: form.customer_name,
        customer_email: form.customer_email,
        domains,
        version_range: form.version_range || null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        hw_binding: form.hw_binding,
        notes: form.notes || undefined,
        max_domain_changes: parseInt(form.max_domain_changes) || 3,
      });
      setIssuedKey(res.key);
      toast.success('License key issued!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function copyKey() {
    await navigator.clipboard.writeText(issuedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (issuedKey) return (
    <div className="max-w-lg mx-auto mt-8 space-y-5">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-status-active/10 border border-status-active/30 flex items-center justify-center mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--status-active)" strokeWidth="2"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
        </div>
        <h1 className="text-xl font-semibold text-text-primary">License Key Issued</h1>
        <p className="text-text-muted text-sm mt-1">Send this key to the customer</p>
      </div>

      <div className="card p-5">
        <div className="text-xs text-text-muted uppercase tracking-wider mb-2">License Key</div>
        <div className="flex items-center gap-2">
          <code className="key-badge text-sm flex-1 text-center py-2 select-all">{issuedKey}</code>
          <button className="btn btn-ghost" onClick={copyKey} style={{ flexShrink: 0 }}>
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--status-active)" strokeWidth="2"><path d="m20 6-11 11-5-5"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            )}
          </button>
        </div>

        <div className="mt-4 p-3 bg-surface-overlay rounded-md text-xs text-text-secondary font-mono leading-relaxed">
          <div className="text-text-muted mb-1"># Customer setup instructions</div>
          <div>1. Clone/unzip source, run <span className="text-accent">npm install</span></div>
          <div>2. Start: <span className="text-accent">npm run dev</span></div>
          <div>3. Setup wizard → Enter key: <span className="text-accent">{issuedKey}</span></div>
          <div>4. Complete admin account setup</div>
        </div>
      </div>

      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1 justify-center" onClick={() => { setIssuedKey(''); setForm({ product_id: '', customer_name: '', customer_email: '', domains: '', version_range: '', expires_at: '', hw_binding: false, notes: '', max_domain_changes: '3' }); }}>
          Issue Another
        </button>
        <Link href="/dashboard/licenses" className="btn btn-primary flex-1 justify-center">
          View All Licenses
        </Link>
      </div>
    </div>
  );

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Link href="/dashboard/licenses" className="text-xs text-text-muted hover:text-accent mb-2 inline-flex items-center gap-1">← Back</Link>
        <h1 className="text-xl font-semibold text-text-primary">Issue License Key</h1>
        <p className="text-sm text-text-muted mt-0.5">Generate a new key for a customer</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Product */}
        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
            Product <span className="text-status-revoked">*</span>
          </label>
          <select className="input" value={form.product_id} onChange={e => set('product_id', e.target.value)} required>
            <option value="">Select product...</option>
            {products?.filter(p => p.active).map(p => (
              <option key={p.id} value={p.slug}>{p.name} ({p.slug})</option>
            ))}
          </select>
        </div>

        {/* Customer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
              Name <span className="text-status-revoked">*</span>
            </label>
            <input className="input" placeholder="Nguyen Van A" value={form.customer_name}
              onChange={e => set('customer_name', e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
              Email <span className="text-status-revoked">*</span>
            </label>
            <input type="email" className="input" placeholder="vana@gmail.com" value={form.customer_email}
              onChange={e => set('customer_email', e.target.value)} required />
          </div>
        </div>

        {/* Domains */}
        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
            Allowed Domains <span className="text-status-revoked">*</span>
          </label>
          <textarea className="input" rows={3} placeholder="shopvps.client.com&#10;www.client.com"
            value={form.domains} onChange={e => set('domains', e.target.value)} required
            style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
          <p className="text-xs text-text-muted mt-1">One domain per line</p>
        </div>

        {/* Version + Expiry */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
              Version Range
            </label>
            <input className="input" placeholder="2.x (blank = all)" value={form.version_range}
              onChange={e => set('version_range', e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
              Expiry Date
            </label>
            <DateField value={form.expires_at} onChange={v => set('expires_at', v)} />
            <p className="text-xs text-text-muted mt-1">Để trống = vĩnh viễn</p>
          </div>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
              Max Domain Changes
            </label>
            <input type="number" className="input" min="0" max="10" value={form.max_domain_changes}
              onChange={e => set('max_domain_changes', e.target.value)} />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={form.hw_binding}
                  onChange={e => set('hw_binding', e.target.checked)} />
                <div className={`w-9 h-5 rounded-full transition-colors ${form.hw_binding ? 'bg-accent' : 'bg-surface-overlay border border-border-strong'}`} />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.hw_binding ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-sm text-text-secondary">Hardware Binding</span>
            </label>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Notes</label>
          <textarea className="input" rows={2} placeholder="Internal notes (not shown to customer)..."
            value={form.notes} onChange={e => set('notes', e.target.value)}
            style={{ resize: 'vertical' }} />
        </div>

        <button type="submit" className="btn btn-primary w-full justify-center" disabled={loading}>
          {loading ? (
            <><span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> Generating...</>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg> Issue License Key</>
          )}
        </button>
      </form>
    </div>
  );
}
