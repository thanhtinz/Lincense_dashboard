'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { productApi, type ProductWithStats } from '@/lib/api';
import { format } from 'date-fns';

export default function ProductsPage() {
  const { data: session } = useSession();
  const token = (session?.user as any)?.apiToken as string;

  const { data: products, mutate } = useSWR<ProductWithStats[]>(
    token ? ['products', token] : null,
    () => productApi.list(token)
  );

  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ name: '', slug: '', prefix: '', description: '', versions: '' });

  function resetForm() { setForm({ name: '', slug: '', prefix: '', description: '', versions: '' }); setEditId(null); }

  function openCreate() { resetForm(); setShowCreate(true); }

  function openEdit(p: ProductWithStats) {
    setForm({
      name: p.name, slug: p.slug, prefix: p.prefix,
      description: p.description ?? '', versions: (p.versions ?? []).join(', '),
    });
    setEditId(p.id);
    setShowCreate(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug.toUpperCase(),
        prefix: form.prefix.toUpperCase(),
        description: form.description,
        versions: form.versions.split(',').map(v => v.trim()).filter(Boolean),
      };
      if (editId) {
        await productApi.update(token, editId, payload);
        toast.success(`Đã cập nhật ${payload.slug}`);
      } else {
        await productApi.create(token, payload);
        toast.success(`Đã tạo product ${payload.slug}`);
      }
      resetForm();
      setShowCreate(false);
      mutate();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  async function handleToggleActive(p: ProductWithStats) {
    try {
      await productApi.update(token, p.id, { active: !p.active });
      toast.success(p.active ? 'Product deactivated' : 'Product activated');
      mutate();
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleDelete(p: ProductWithStats) {
    if (!confirm(`Xoá product ${p.slug}? Chỉ xoá được khi không còn license nào.`)) return;
    try {
      await productApi.delete(token, p.id);
      toast.success(`Đã xoá ${p.slug}`);
      mutate();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Products</h1>
          <p className="text-sm text-text-muted mt-0.5">{products?.length ?? 0} registered products</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          New Product
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="card p-5 border-accent/30 animate-slide-up">
          <h2 className="text-sm font-medium text-text-primary mb-4">{editId ? 'Sửa Product' : 'Register New Product'}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1.5">Name *</label>
                <input className="input" placeholder="ShopVPS" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5">Slug * (UPPERCASE)</label>
                <input className="input font-mono" placeholder="SHOPVPS" value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value.toUpperCase() }))} required />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5">Prefix * (2-5 chars)</label>
                <input className="input font-mono" placeholder="SVP" maxLength={5} value={form.prefix}
                  onChange={e => setForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))} required />
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Description</label>
              <input className="input" placeholder="VPS management platform" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Versions (comma-separated)</label>
              <input className="input font-mono text-xs" placeholder="1.0, 1.1, 2.0" value={form.versions}
                onChange={e => setForm(f => ({ ...f, versions: e.target.value }))} />
            </div>
            <div className="col-span-2 flex gap-2 justify-end pt-1">
              <button type="button" className="btn btn-ghost" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : (editId ? 'Lưu' : 'Create Product')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Product Cards */}
      <div className="grid gap-3">
        {!products ? (
          <div className="text-center py-12 text-text-muted">Loading...</div>
        ) : products.map(p => (
          <div key={p.id} className={`card p-5 transition-opacity ${!p.active ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent-dim border border-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="font-mono text-xs font-bold text-accent">{p.prefix}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{p.name}</span>
                    {!p.active && (
                      <span className="text-[10px] font-mono bg-text-muted/10 text-text-muted px-1.5 py-0.5 rounded">INACTIVE</span>
                    )}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">{p.description}</div>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right hidden md:block">
                  <div className="text-lg font-semibold text-text-primary">{p.active_licenses}</div>
                  <div className="text-xs text-text-muted">active licenses</div>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '12px' }}
                    onClick={() => openEdit(p)}>Sửa</button>
                  <button
                    className={`btn ${p.active ? 'btn-ghost' : 'btn-primary'}`}
                    style={{ padding: '5px 10px', fontSize: '12px' }}
                    onClick={() => handleToggleActive(p)}
                  >
                    {p.active ? 'Tắt' : 'Bật'}
                  </button>
                  <button className="btn btn-danger" style={{ padding: '5px 10px', fontSize: '12px' }}
                    onClick={() => handleDelete(p)}>Xoá</button>
                </div>
              </div>
            </div>

            {p.versions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.versions.map(v => (
                  <span key={v} className="font-mono text-[10px] px-2 py-0.5 bg-surface-overlay border border-border rounded text-text-muted">
                    v{v}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted border-t border-border pt-3">
              <span className="font-mono">ID: {p.slug}</span>
              <span>Created {format(new Date(p.createdAt), 'dd MMM yyyy')}</span>
              <span>{p._count.licenses} total licenses</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
