'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { licenseApi, productApi, type ProductWithStats } from '@/lib/api';
import { DateField } from '@/components/DateField';

const EMPTY = {
  product_id: '', customer_name: '', customer_email: '', domains: '',
  version_range: '', expires_at: '', hw_binding: false, notes: '', max_domain_changes: '3',
};

/** Issue-key form used inside a modal (no separate route needed). */
export function IssueKeyForm({
  token, onIssued, onClose,
}: { token: string; onIssued?: () => void; onClose?: () => void }) {
  const { data: products } = useSWR<ProductWithStats[]>(
    token ? ['products', token] : null,
    () => productApi.list(token)
  );

  const [form, setForm] = useState({ ...EMPTY });
  const [loading, setLoading] = useState(false);
  const [issuedKey, setIssuedKey] = useState('');
  const [copied, setCopied] = useState(false);

  function set(k: keyof typeof form, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.product_id || !form.customer_name || !form.customer_email || !form.domains) {
      toast.error('Vui lòng điền các trường bắt buộc'); return;
    }
    const domains = form.domains.split('\n').map(d => d.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean);
    if (domains.length === 0) { toast.error('Cần ít nhất 1 domain'); return; }

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
      onIssued?.();
      toast.success('Đã cấp license key!');
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  async function copyKey() {
    await navigator.clipboard.writeText(issuedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (issuedKey) return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-status-active/10 border border-status-active/30 flex items-center justify-center mx-auto mb-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--status-active)" strokeWidth="2"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
        </div>
        <h3 className="text-base font-semibold text-text-primary">Đã cấp key</h3>
        <p className="text-text-muted text-xs mt-1">Gửi key này cho khách</p>
      </div>
      <div className="flex items-center gap-2">
        <code className="key-badge text-sm flex-1 text-center py-2 select-all break-all">{issuedKey}</code>
        <button className="btn btn-ghost" onClick={copyKey} style={{ flexShrink: 0 }}>
          {copied
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--status-active)" strokeWidth="2"><path d="m20 6-11 11-5-5"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
        </button>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1 justify-center" onClick={() => { setIssuedKey(''); setForm({ ...EMPTY }); }}>
          Cấp key khác
        </button>
        <button className="btn btn-primary flex-1 justify-center" onClick={() => onClose?.()}>
          Xong
        </button>
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
          Product <span className="text-status-revoked">*</span>
        </label>
        <select className="input" value={form.product_id} onChange={e => set('product_id', e.target.value)} required>
          <option value="">Chọn product...</option>
          {products?.filter(p => p.active).map(p => (
            <option key={p.id} value={p.slug}>{p.name} ({p.slug})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Khách hàng <span className="text-status-revoked">*</span></label>
          <input className="input" placeholder="Nguyen Van A" value={form.customer_name}
            onChange={e => set('customer_name', e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Email <span className="text-status-revoked">*</span></label>
          <input type="email" className="input" placeholder="vana@gmail.com" value={form.customer_email}
            onChange={e => set('customer_email', e.target.value)} required />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Domain cho phép <span className="text-status-revoked">*</span></label>
        <textarea className="input" rows={3} placeholder="shop.khach.com&#10;www.khach.com"
          value={form.domains} onChange={e => set('domains', e.target.value)} required
          style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
        <p className="text-xs text-text-muted mt-1">Mỗi dòng 1 domain</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Version range</label>
          <input className="input" placeholder="2.x (trống = tất cả)" value={form.version_range}
            onChange={e => set('version_range', e.target.value)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Ngày hết hạn</label>
          <DateField value={form.expires_at} onChange={v => set('expires_at', v)} />
          <p className="text-xs text-text-muted mt-1">Để trống = vĩnh viễn</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Giới hạn đổi domain</label>
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
            <span className="text-sm text-text-secondary">Khoá phần cứng</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Ghi chú</label>
        <textarea className="input" rows={2} placeholder="Ghi chú nội bộ..."
          value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'vertical' }} />
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1 justify-center" disabled={loading}>
          {loading
            ? <><span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> Đang tạo...</>
            : 'Cấp key'}
        </button>
        {onClose && <button type="button" className="btn btn-ghost" onClick={onClose}>Đóng</button>}
      </div>
    </form>
  );
}
