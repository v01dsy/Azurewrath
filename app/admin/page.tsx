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
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const session = getUserSession();
    if (!session) { router.replace('/'); return; }
    fetch(`/api/user/role?userId=${session.robloxUserId}`)
      .then(r => r.json())
      .then(d => {
        if (!hasRole(d.role, 'moderator')) { router.replace('/'); return; }
        setAuthorized(true);
        setUserId(session.robloxUserId);
      });
  }, [router]);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/admin/manipulation-flags?status=pending&userId=${userId}`)
      .then(r => r.json())
      .then(data => setPendingFlags(Array.isArray(data) ? data.length : 0))
      .catch(() => setPendingFlags(0));
  }, [userId]);

  if (!authorized) return null;

  return (
    <div className="min-h-screen text-white px-4 pb-20 pt-10 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent">
          Admin Panel
        </h1>
        <p className="text-slate-400 text-sm mt-1">Moderation and management tools</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Manipulation Review */}
        <Link
          href="/admin/manipulation"
          className="group rounded-2xl border border-red-500/20 bg-red-950/10 hover:bg-red-950/25 hover:border-red-500/40 p-6 transition space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">🚩</span>
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

        {/* Placeholder for future tools */}
        <div className="rounded-2xl border border-slate-700/40 bg-slate-800/20 p-6 space-y-3 opacity-40">
          <span className="text-2xl">🛠️</span>
          <div>
            <h2 className="text-white font-bold text-lg">More tools coming</h2>
            <p className="text-slate-400 text-sm mt-1">Future admin tools will appear here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}