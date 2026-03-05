// app/admin/manipulation/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getUserSession } from '@/lib/userSession';
import { hasRole } from '@/lib/roles';
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts';

interface PricePoint { rap: number | null; price: number | null; timestamp: string; }

interface FlagItem {
  assetId: string;
  name: string;
  imageUrl: string | null;
  manipulated: boolean;
  manipulatedAt: string | null;
  manipulatedRap: number | null;
  priceHistory: PricePoint[];
}

interface Flag {
  id: string;
  assetId: string;
  flagType: 'manipulation' | 'unmark_suggestion';
  detectionMethod: 'rap_growth' | 'sale_above_best' | 'unmark_suggestion' | null;
  status: string;
  reason: string;
  rapAtFlag: number;
  rapGrowthPct: number | null;
  timeWindowHrs: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  item: FlagItem;
}

function fmt(n: number) { return n.toLocaleString(); }
function timeAgo(s: string) {
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function Sparkline({ data }: { data: PricePoint[] }) {
  const points = data.filter(p => p.rap != null).map(p => ({ rap: p.rap! }));
  if (points.length < 2) return <div className="text-slate-600 text-xs italic">no chart data</div>;
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={points}>
        <YAxis domain={['auto', 'auto']} hide />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
          formatter={(v: number) => [`${fmt(v)} R$`, 'RAP']}
          labelFormatter={() => ''}
        />
        <Line type="linear" dataKey="rap" stroke="#a78bfa" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function FlagIcon({ size = 14 }: { size?: number }) {
  return <img src="/Images/flag.png" alt="" style={{ width: size, height: size, objectFit: 'contain', display: 'inline-block' }} />;
}

function UnmarkIcon({ size = 14 }: { size?: number }) {
  return <img src="/Images/unmark.png" alt="" style={{ width: size, height: size, objectFit: 'contain', display: 'inline-block' }} />;
}

function FlagCard({ flag, onAction, acting }: {
  flag: Flag;
  onAction: (id: string, action: 'accept' | 'dismiss') => void;
  acting: string | null;
}) {
  const isManip = flag.flagType === 'manipulation';
  const isActing = acting === flag.id;
  const isPending = flag.status === 'pending';
  const isAccepted = flag.status === 'accepted';
  const isRapGrowth = flag.detectionMethod === 'rap_growth';
  const isSaleAboveBest = flag.detectionMethod === 'sale_above_best';

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-5 space-y-4 transition hover:border-slate-600/70">
      {/* Header */}
      <div className="flex items-start gap-4">
        {flag.item.imageUrl && (
          <img
            src={flag.item.imageUrl}
            alt={flag.item.name}
            className="rounded-xl object-cover border border-slate-700"
            style={{ width: 96, height: 96, minWidth: 96, minHeight: 96, flexShrink: 0 }}
          />
        )}
        <div className="flex-1 min-w-0">
          {/* Icon + Flagged label + time */}
          <div className="flex items-center gap-2 mb-1">
            {isManip ? <FlagIcon size={16} /> : <UnmarkIcon size={16} />}
            <span className={`text-xs font-bold ${isManip ? 'text-red-300' : 'text-emerald-300'}`}>
              {isManip ? 'Flagged' : 'Unmark Suggested'}
            </span>
            {isRapGrowth && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                RAP Growth
              </span>
            )}
            {isSaleAboveBest && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                Sale Above Best Price
              </span>
            )}
            <span className="text-slate-500 text-xs ml-auto">{timeAgo(flag.createdAt)}</span>
          </div>
          <Link
            href={`/item/${flag.assetId}`}
            target="_blank"
            className="text-white font-bold text-lg hover:text-purple-300 transition truncate block"
          >
            {flag.item.name}
          </Link>
          <p className="text-slate-400 text-sm mt-0.5">{flag.reason}</p>

          {/* Stats inline */}
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {flag.item.manipulatedRap != null && flag.flagType === 'unmark_suggestion' && (
              <>
                <div className="w-px h-8 bg-slate-700" />
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wider">Marked At</p>
                  <p className="text-amber-300 font-bold text-sm">{fmt(flag.item.manipulatedRap)} R$</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats bubbles */}
      {(() => {
        const latestPrice = flag.item.priceHistory.find(p => p.price != null)?.price ?? null;
        return (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-700/50 border border-slate-600/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-slate-300 text-sm uppercase tracking-wider font-bold whitespace-nowrap">{isSaleAboveBest ? 'New RAP' : 'RAP at Flag'}</p>
              <p className="text-white font-bold text-base whitespace-nowrap">{fmt(flag.rapAtFlag)} R$</p>
            </div>
            <div className="bg-red-900/20 border border-red-500/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-red-300 text-sm uppercase tracking-wider font-bold whitespace-nowrap">{isSaleAboveBest ? 'Overpay' : 'Growth'}</p>
              <p className="text-red-200 font-bold text-base whitespace-nowrap">
                {flag.rapGrowthPct != null ? `+${flag.rapGrowthPct.toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="bg-blue-900/20 border border-blue-500/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-blue-300 text-sm uppercase tracking-wider font-bold leading-none">Best Price</p>
                <p className="text-slate-500 text-[10px] mt-0.5">at time of flag</p>
              </div>
              <p className="text-blue-200 font-bold text-base whitespace-nowrap">
                {latestPrice == null ? '—' : latestPrice === -1 ? 'No Sellers' : `${fmt(latestPrice)} R$`}
              </p>
            </div>
          </div>
        );
      })()}

      {/* RAP sparkline */}
      <div>
        <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">RAP (14 days)</p>
        <Sparkline data={flag.item.priceHistory} />
      </div>

      {/* Actions or review summary */}
      {isPending ? (
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => onAction(flag.id, 'accept')}
            disabled={isActing}
            className={`flex-1 py-2 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 ${
              isManip
                ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 border border-yellow-500/30 hover:border-yellow-400/60'
                : 'bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-200 border border-emerald-500/30 hover:border-emerald-400/60'
            } disabled:opacity-40`}
          >
            {isActing ? '...' : isManip ? (
              <><img src="/Images/manipulated1.png" alt="" style={{ width: 15, height: 15, objectFit: 'contain' }} /> Mark Manipulated</>
            ) : '✓ Unmark Item'}
          </button>
          <button
            onClick={() => onAction(flag.id, 'dismiss')}
            disabled={isActing}
            className="flex-1 py-2 rounded-xl font-semibold text-sm bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 hover:border-red-400/60 transition disabled:opacity-40"
          >
            {isActing ? '...' : '✕ Dismiss'}
          </button>
        </div>
      ) : (
        <div className={`flex items-center gap-3 pt-1 px-4 py-3 rounded-xl border ${
          isAccepted
            ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
            : 'bg-slate-800/50 border-slate-600/30 text-slate-400'
        }`}>
          <span className="text-lg">{isAccepted ? '✓' : '✕'}</span>
          <div className="text-sm">
            <span className="font-semibold">{isAccepted ? 'Accepted' : 'Dismissed'}</span>
            {flag.reviewedBy && (
              <span> by <span className="text-white font-medium">{flag.reviewedBy}</span></span>
            )}
            {flag.reviewedAt && (
              <span className="text-slate-500"> · {timeAgo(flag.reviewedAt)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManipulationAdminPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'accepted' | 'dismissed'>('pending');
  const [typeFilter, setTypeFilter] = useState<'all' | 'manipulation' | 'unmark_suggestion'>('all');
  const [acting, setActing] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const session = getUserSession();
    if (!session) { router.replace('/'); return; }
    fetch(`/api/user/role?userId=${session.robloxUserId}`)
      .then(r => r.json())
      .then(d => {
        if (!hasRole(d.role, 'admin')) { router.replace('/'); return; }
        setUserId(session.robloxUserId);
        setAuthorized(true);
      });
  }, [router]);

  const load = useCallback(() => {
    if (!authorized || !userId) return;
    setLoading(true);
    const params = new URLSearchParams({ status: tab, userId });
    if (typeFilter !== 'all') params.set('type', typeFilter);
    fetch(`/api/admin/manipulation-flags?${params}`)
      .then(r => r.json())
      .then(data => setFlags(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [authorized, userId, tab, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, action: 'accept' | 'dismiss') => {
    if (!userId) return;
    setActing(id);
    try {
      await fetch('/api/admin/manipulation-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, userId }),
      });
      setFlags(prev => prev.filter(f => f.id !== id));
    } finally {
      setActing(null);
    }
  };

  if (!authorized) return null;

  return (
    <div className="min-h-screen text-white px-4 pb-20 pt-10 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-slate-400 hover:text-white text-sm transition">← Admin</Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-red-400 via-orange-400 to-amber-400 bg-clip-text text-transparent">
          Manipulation Review
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Review potential manipulation items. Accept to update their manipulated status, or dismiss to ignore.
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['pending', 'accepted', 'dismissed'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold capitalize transition border ${
              tab === t
                ? t === 'pending'
                  ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-200'
                  : t === 'accepted'
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                  : 'bg-red-500/20 border-red-500/50 text-red-200'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {t}
            {t === 'pending' && tab === 'pending' && flags.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {flags.length}
              </span>
            )}
          </button>
        ))}

        {/* Type filter */}
        <div className="ml-auto flex gap-2">
          {(['all', 'manipulation', 'unmark_suggestion'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border flex items-center gap-1.5 ${
                typeFilter === t
                  ? t === 'all'
                    ? 'bg-purple-600/30 border-purple-500/50 text-purple-200'
                    : t === 'manipulation'
                    ? 'bg-red-500/20 border-red-500/40 text-red-200'
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                  : 'bg-slate-800/60 border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'all' ? 'All' : t === 'manipulation'
                ? <><FlagIcon size={16} /> Flags</>
                : <><UnmarkIcon size={16} /> Unmarks</>
              }
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-slate-400 text-center py-20">Loading...</div>
      ) : flags.length === 0 ? (
        <div className="text-center py-20 space-y-2">
          <p className="text-slate-400 text-lg">
            {tab === 'pending' ? 'No pending flags — all clear! ✓' : `No ${tab} flags`}
          </p>
          <p className="text-slate-600 text-sm">
            The worker checks for suspicious activity every cycle.
          </p>
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl mx-auto">
          {flags.map(flag => (
            <FlagCard key={flag.id} flag={flag} onAction={handleAction} acting={acting} />
          ))}
        </div>
      )}
    </div>
  );
}