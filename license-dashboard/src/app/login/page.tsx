'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.ok) { router.push('/dashboard'); router.refresh(); }
    else setError('Invalid email or password');
  }

  return (
    <div className="min-h-screen grid-bg flex items-center justify-center p-4">
      {/* Scan line effect */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-[0.03]">
        <div className="absolute w-full h-px bg-accent animate-scan" />
      </div>

      <div className="w-full max-w-[380px] animate-slide-up">
        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded border border-accent/40 bg-accent-dim flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                <rect x="5" y="2" width="14" height="20" rx="2" />
                <path d="M12 18h.01M9 6h6M9 10h6M9 14h4" />
              </svg>
            </div>
            <span className="font-mono text-xs tracking-[0.2em] text-text-secondary uppercase">License Platform</span>
          </div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Admin Access</h1>
          <p className="text-text-muted text-sm mt-1">Restricted — authorized personnel only</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
              Email
            </label>
            <input
              type="email"
              className="input"
              placeholder="admin@yourdomain.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="text-status-revoked text-sm bg-red-500/5 border border-red-500/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full justify-center mt-2" disabled={loading}>
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Authenticating...
              </>
            ) : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-text-muted text-xs mt-6 font-mono">
          LIC-PLATFORM v1.0 · CONFIDENTIAL
        </p>
      </div>
    </div>
  );
}
