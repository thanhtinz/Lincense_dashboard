'use client';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: GridIcon },
  { href: '/dashboard/licenses', label: 'Licenses', icon: KeyIcon },
  { href: '/dashboard/products', label: 'Products', icon: BoxIcon },
  { href: '/dashboard/logs', label: 'Verify Logs', icon: LogIcon },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setNavOpen(false); }, [pathname]);

  if (status === 'loading') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!session) return null;

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — slide-in drawer on mobile, static on desktop */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200',
          'lg:static lg:z-auto lg:w-56 lg:translate-x-0 flex-shrink-0',
          'border-r border-border bg-surface-raised flex flex-col',
          navOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo + close (close only on mobile) */}
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-accent-dim border border-accent/30 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                <rect x="5" y="2" width="14" height="20" rx="2"/>
                <path d="M12 18h.01M9 6h6M9 10h6M9 14h4"/>
              </svg>
            </div>
            <div>
              <div className="font-semibold text-text-primary text-sm leading-none">LicensePlatform</div>
              <div className="text-[10px] font-mono text-text-muted mt-0.5">v1.0</div>
            </div>
          </div>
          <button
            onClick={() => setNavOpen(false)}
            className="lg:hidden text-text-muted hover:text-text-primary p-1"
            aria-label="Close menu"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all',
                  active
                    ? 'bg-accent-dim text-accent border border-accent/20'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
                )}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-border">
          <div className="px-3 py-2 mb-1">
            <div className="text-xs font-medium text-text-primary truncate">{session.user?.name}</div>
            <div className="text-[11px] text-text-muted truncate">{session.user?.email}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-2 w-full px-3 py-1.5 rounded text-xs text-text-muted hover:text-status-revoked hover:bg-red-500/5 transition-all"
          >
            <LogoutIcon size={13} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar with hamburger */}
        <header className="lg:hidden flex items-center gap-3 h-14 px-4 border-b border-border bg-surface-raised sticky top-0 z-20">
          <button
            onClick={() => setNavOpen(true)}
            className="text-text-secondary hover:text-text-primary p-1 -ml-1"
            aria-label="Open menu"
          >
            <MenuIcon size={22} />
          </button>
          <span className="font-semibold text-text-primary text-sm">LicensePlatform</span>
        </header>

        <main className="flex-1 overflow-auto bg-surface">
          <div className="p-4 sm:p-6 md:p-8 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Inline icons ─────────────────────────────────────────────────────────
function MenuIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
}
function CloseIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function GridIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
}
function KeyIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3"/></svg>;
}
function PlusIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>;
}
function BoxIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>;
}
function LogIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>;
}
function LogoutIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
}
