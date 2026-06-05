'use client';
import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--surface-overlay)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
          },
        }}
      />
    </SessionProvider>
  );
}
