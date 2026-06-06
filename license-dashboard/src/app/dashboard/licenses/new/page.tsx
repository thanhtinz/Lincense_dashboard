'use client';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IssueKeyForm } from '@/components/IssueKeyForm';

// Issuing a key is normally done via the modal on the Licenses page.
// This route is kept as a thin wrapper for direct links / bookmarks.
export default function IssueLicensePage() {
  const { data: session } = useSession();
  const token = (session?.user as any)?.apiToken as string;
  const router = useRouter();

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Link href="/dashboard/licenses" className="text-xs text-text-muted hover:text-accent mb-2 inline-flex items-center gap-1">← Back</Link>
        <h1 className="text-xl font-semibold text-text-primary">Cấp License Key</h1>
      </div>
      <div className="card p-6">
        <IssueKeyForm token={token} onClose={() => router.push('/dashboard/licenses')} />
      </div>
    </div>
  );
}
