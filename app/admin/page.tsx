// app/admin/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getUserSession } from '@/lib/userSession';
import { hasRole } from '@/lib/roles';

export default function AdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [pendingFlags, setPendingFlags] = useState<number | null>(null);

  useEffect(() => {
    const session = getUserSession();
    if (!session) { router.replace('/'); return; }
    const uid = session.robloxUserId;

    Promise.all([
      fetch(`/api/user/role?userId=${uid}`).then(r => r.json()),
      fetch(`/api/admin/manipulation-flags?status=pending&userId=${uid}&skip=0&take=0`).then(r => r.json()),
    ]).then(([roleData, flagData]) => {
      if (!hasRole(roleData.role, 'mod')) { router.replace('/'); return; }
      setAuthorized(true);
      setPendingFlags(flagData.total ?? 0);
    }).catch(() => {});
  }, [router]);

  if (!authorized) return null;

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 pb-12 px-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent">
            Admin Panel
          </h1>
          <p className="text-slate-400 text-sm mt-1">Moderation and management tools</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/manipulation"
            className="group rounded-2xl border border-red-500/20 bg-red-950/10 hover:bg-red-950/25 hover:border-red-500/40 p-6 transition space-y-3"
          >
            <div className="flex items-center justify-between">
              <img src="/Images/flag.webp" alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
              {pendingFlags != null && pendingFlags > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {pendingFlags} pending
                </span>
              )}
              {pendingFlags === 0 && (
                <span className="bg-emerald-500/20 text-emerald-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  All clear ✓
                </span>
              )}
            </div>
            <div>
              <h2 className="text-white font-bold text-lg group-hover:text-red-300 transition">
                Manipulation Review
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Review auto-detected RAP manipulation flags and unmark suggestions.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}