// app/admin/manipulation/page.tsx
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
    <ResponsiveContainer width="100%" height={36}>
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
  return <img src="/Images/flag.webp" alt="" style={{ width: size, height: size, objectFit: 'contain', display: 'inline-block' }} />;
}

function UnmarkIcon({ size = 14 }: { size?: number }) {
  return <img src="/Images/unmark.webp" alt="" style={{ width: size, height: size, objectFit: 'contain', display: 'inline-block' }} />;
}

function Pagination({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void;
}) {
  if (total <= pageSize) return null;
  const totalPages = Math.ceil(total / pageSize);
  const [jumpLeft, setJumpLeft] = useState(false);
  const [jumpRight, setJumpRight] = useState(false);
  const [jumpVal, setJumpVal] = useState('');

  const pages: (number | 'left-dot' | 'right-dot')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('left-dot');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('right-dot');
    pages.push(totalPages);
  }

  const commit = (val: string, close: () => void) => {
    const n = parseInt(val);
    if (!isNaN(n) && n >= 1 && n <= totalPages) onChange(n);
    close();
    setJumpVal('');
  };

  const JumpInput = ({ onClose }: { onClose: () => void }) => (
    <input
      autoFocus
      type="number"
      min={1}
      max={totalPages}
      value={jumpVal}
      onChange={e => setJumpVal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') commit(jumpVal, onClose); if (e.key === 'Escape') { onClose(); setJumpVal(''); } }}
      onBlur={() => commit(jumpVal, onClose)}
      className="w-12 h-8 rounded-lg text-sm text-center font-semibold bg-slate-700 border border-purple-500/60 text-white focus:outline-none"
    />
  );

  const btn = "px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} className={btn}>← Prev</button>
      {pages.map((p, i) => {
        if (p === 'left-dot') return jumpLeft
          ? <JumpInput key="left-dot" onClose={() => setJumpLeft(false)} />
          : <button key="left-dot" onClick={() => setJumpLeft(true)} className="text-slate-400 hover:text-white px-1 transition">...</button>;
        if (p === 'right-dot') return jumpRight
          ? <JumpInput key="right-dot" onClose={() => setJumpRight(false)} />
          : <button key="right-dot" onClick={() => setJumpRight(true)} className="text-slate-400 hover:text-white px-1 transition">...</button>;
        return <button key={p} onClick={() => onChange(p as number)} className={`w-8 h-8 rounded-lg text-sm font-semibold transition border ${p === page ? 'bg-purple-600/40 border-purple-500/60 text-purple-200' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'}`}>{p}</button>;
      })}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} className={btn}>Next →</button>
      <span className="text-slate-500 text-xs ml-2">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
    </div>
  );
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
  const isAids = (flag.detectionMethod as string) === 'AIDS';

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d0d0f] p-3 space-y-2 transition-all duration-200 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-900/20 relative"
      style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.4)' }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        {flag.item.imageUrl && (
          <div className="relative flex-shrink-0">
            <img
              src={flag.item.imageUrl}
              alt={flag.item.name}
              className="rounded-xl object-cover border border-white/10"
              style={{ width: 68, height: 68 }}
            />
            {isManip && (
              <div className="absolute -top-1.5 -right-1.5 bg-[#0d0d0f] rounded-full p-0.5">
                <img src="/Images/flag.webp" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
              </div>
            )}
            {!isManip && (
              <div className="absolute -top-1.5 -right-1.5 bg-[#0d0d0f] rounded-full p-0.5">
                <img src="/Images/unmark.webp" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
              </div>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {isRapGrowth && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-300 border border-orange-500/25 uppercase tracking-wide">
                RAP Growth
              </span>
            )}
            {isSaleAboveBest && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/15 text-yellow-300 border border-yellow-500/25 uppercase tracking-wide">
                Sale Above Best Price
              </span>
            )}
            {isAids && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600/20 text-red-400 border border-red-600/30 uppercase tracking-wide">
                I&apos;m currently suffering from aids, plaes help me
              </span>
            )}
            {!isManip && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 uppercase tracking-wide">
                Unmark Suggested
              </span>
            )}
            <span className="absolute top-3 right-3 text-slate-500 text-xs">{timeAgo(flag.createdAt)}</span>
          </div>
          <Link
            href={`/item/${flag.assetId}`}
            target="_blank"
            className="text-white font-bold text-base hover:text-purple-300 transition truncate block leading-snug"
          >
            {flag.item.name}
          </Link>
        </div>
      </div>

      {/* Stats bubbles */}
      {(() => {
        const latestRap = [...flag.item.priceHistory].reverse().find(p => p.rap != null)?.rap ?? null;

        if (!isManip) {
          const markedAt = flag.item.manipulatedRap;
          const dropPct = markedAt && latestRap != null
            ? (((latestRap - markedAt) / markedAt) * 100).toFixed(1)
            : null;

          return (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                <p className="text-amber-300 text-[10px] uppercase tracking-wider font-bold">Marked At</p>
                <p className="text-amber-200 font-bold text-sm">
                  {markedAt != null ? `${fmt(markedAt)} R$` : '—'}
                </p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                <p className="text-emerald-300 text-[10px] uppercase tracking-wider font-bold">RAP Now</p>
                <p className="text-emerald-200 font-bold text-sm">
                  {latestRap != null ? `${fmt(latestRap)} R$` : '—'}
                </p>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                <p className="text-blue-300 text-[10px] uppercase tracking-wider font-bold">Change</p>
                <p className="text-blue-200 font-bold text-sm">
                  {dropPct != null ? `${parseFloat(dropPct) > 0 ? '+' : ''}${dropPct}%` : '—'}
                </p>
              </div>
            </div>
          );
        }

        if (isSaleAboveBest) {
          const bestPriceAtFlagMatch = flag.reason.match(/best:\s*([\d,]+)\s*R\$/);
          const impliedSaleMatch = flag.reason.match(/implied sale:\s*([\d,]+)\s*R\$/);
          const bestPriceAtFlag = bestPriceAtFlagMatch ? parseInt(bestPriceAtFlagMatch[1].replace(/,/g, '')) : null;
          const impliedSalePrice = impliedSaleMatch ? parseInt(impliedSaleMatch[1].replace(/,/g, '')) : null;

          return (
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                <p className="text-slate-300 text-[10px] uppercase tracking-wider font-bold">New RAP</p>
                <p className="text-white font-bold text-sm">{fmt(flag.rapAtFlag)} R$</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                <p className="text-red-300 text-[10px] uppercase tracking-wider font-bold">Overpay</p>
                <p className="text-red-200 font-bold text-sm">
                  {flag.rapGrowthPct != null ? `+${flag.rapGrowthPct.toFixed(1)}%` : '—'}
                </p>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1">
                  <p className="text-blue-300 text-[10px] uppercase tracking-wider font-bold">Best Price</p>
                  <p className="text-slate-500 text-[9px]">(at flag)</p>
                </div>
                <p className="text-blue-200 font-bold text-sm">
                  {bestPriceAtFlag != null ? `${fmt(bestPriceAtFlag)} R$` : '—'}
                </p>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                <p className="text-purple-300 text-[10px] uppercase tracking-wider font-bold">Implied Sale</p>
                <p className="text-purple-200 font-bold text-sm">
                  {impliedSalePrice != null ? `${fmt(impliedSalePrice)} R$` : '—'}
                </p>
              </div>
            </div>
          );
        }

        return (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex flex-col gap-0.5">
              <p className="text-slate-300 text-[10px] uppercase tracking-wider font-bold">RAP at Flag</p>
              <p className="text-white font-bold text-sm">{fmt(flag.rapAtFlag)} R$</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex flex-col gap-0.5">
              <p className="text-red-300 text-[10px] uppercase tracking-wider font-bold">Growth</p>
              <p className="text-red-200 font-bold text-sm">
                {flag.rapGrowthPct != null ? `+${flag.rapGrowthPct.toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 flex flex-col gap-0.5">
              <p className="text-blue-300 text-[10px] uppercase tracking-wider font-bold">RAP Now</p>
              <p className="text-blue-200 font-bold text-sm">
                {latestRap != null ? `${fmt(latestRap)} R$` : '—'}
              </p>
            </div>
          </div>
        );
      })()}

      {/* RAP sparkline */}
      <div className="bg-white/[0.03] rounded-xl px-3 pt-2 pb-1 border border-white/5">
        <Sparkline data={flag.item.priceHistory} />
      </div>

      {/* Actions or review summary */}
      {isPending ? (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onAction(flag.id, 'accept')}
            disabled={isActing}
            className={`flex-1 py-1.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              isManip
                ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 border border-yellow-500/30 hover:border-yellow-400/50 hover:shadow-md hover:shadow-yellow-900/30'
                : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 hover:border-emerald-400/50 hover:shadow-md hover:shadow-emerald-900/30'
            } disabled:opacity-40`}
          >
            {isActing ? '...' : isManip ? (
              <><img src="/Images/manipulated1.webp" alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} /> Mark Manipulated</>
            ) : (
              <><img src="/Images/unmark.webp" alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} /> Unmark Item</>
            )}
          </button>
          <button
            onClick={() => onAction(flag.id, 'dismiss')}
            disabled={isActing}
            className="flex-1 py-1.5 rounded-xl font-bold text-sm bg-white/5 hover:bg-red-500/15 text-slate-400 hover:text-red-300 border border-white/10 hover:border-red-500/30 transition-all hover:shadow-md hover:shadow-red-900/20 disabled:opacity-40"
          >
            {isActing ? '...' : '✕ Dismiss'}
          </button>
        </div>
      ) : (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
          isAccepted
            ? 'bg-emerald-950/40 border-emerald-500/20 text-emerald-300'
            : 'bg-white/5 border-white/10 text-slate-500'
        }`}>
          <span className="text-sm">{isAccepted ? '✓' : '✕'}</span>
          <div className="text-xs">
            <span className="font-semibold">{isAccepted ? 'Accepted' : 'Dismissed'}</span>
            {flag.reviewedBy && (
              <span> by <span className="text-white font-medium">{flag.reviewedBy}</span></span>
            )}
            {flag.reviewedAt && (
              <span className="text-slate-600"> · {timeAgo(flag.reviewedAt)}</span>
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
  const flagsRef = useRef<Flag[]>([]);
  const pageRef = useRef(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'accepted' | 'dismissed'>('pending');
  const [typeFilter, setTypeFilter] = useState<'all' | 'manipulation' | 'unmark_suggestion'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'overpay'>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [acting, setActing] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Keep refs in sync so async callbacks always read latest values
  useEffect(() => { flagsRef.current = flags; }, [flags]);
  useEffect(() => { pageRef.current = page; }, [page]);

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

  const loadPage = useCallback((p: number) => {
    if (!authorized || !userId) return;
    setLoading(true);
    const params = new URLSearchParams({ status: tab, userId, skip: String((p - 1) * PAGE_SIZE), take: String(PAGE_SIZE), sortBy, sortDir });
    if (typeFilter !== 'all') params.set('type', typeFilter);
    fetch(`/api/admin/manipulation-flags?${params}`)
      .then(r => r.json())
      .then(data => { setFlags(data.flags ?? []); setTotal(data.total ?? 0); })
      .finally(() => setLoading(false));

  }, [authorized, userId, tab, typeFilter, sortBy, sortDir]);

  useEffect(() => { setPage(1); loadPage(1); }, [tab, typeFilter, sortBy, sortDir, authorized, userId]);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    loadPage(p);
  }, [loadPage]);

  const handleAction = useCallback(async (id: string, action: 'accept' | 'dismiss') => {
    if (!userId) return;
    setActing(id);
    try {
      const res = await fetch('/api/admin/manipulation-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, userId }),
      });
      if (!res.ok) return;
      // Just remove from local state — no refetch, so nothing can come back
      setFlags(prev => prev.filter(f => f.id !== id));
      setTotal(prev => Math.max(0, prev - 1));
      // If that emptied the page and we're not on page 1, go back
      const remaining = flagsRef.current.filter(f => f.id !== id).length;
      if (remaining === 0 && pageRef.current > 1) {
        const targetPage = pageRef.current - 1;
        setPage(targetPage);
        loadPage(targetPage);
      }
    } finally {
      setActing(null);
    }
  }, [userId, loadPage]);

  if (!authorized) return null;

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 pb-12 px-6">
      <div className="max-w-5xl mx-auto space-y-6">

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
            {t === 'pending' && tab === 'pending' && total > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {total}
              </span>
            )}
          </button>
        ))}

        {/* Type filter + Sort */}
        <div className="ml-auto flex gap-2 items-center">
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
          <div className="w-px h-5 bg-slate-700 mx-1" />
          {(['time', 'overpay'] as const).map(s => (
            <button
              key={s}
              onClick={() => {
                if (sortBy === s) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                else { setSortBy(s); setSortDir('desc'); }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border flex items-center gap-1 ${
                sortBy === s
                  ? 'bg-slate-600/40 border-slate-500/60 text-white'
                  : 'bg-slate-800/60 border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
            >
              {s === 'time' ? 'Recency' : 'Overpay'}
              {sortBy === s && <span className="text-slate-400">{sortDir === 'desc' ? '↓' : '↑'}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {!loading && (flags.length === 0 ? (
        <div className="text-center py-20 space-y-2">
          <p className="text-slate-400 text-lg">
            {tab === 'pending' ? 'No pending flags — all clear! ✓' : `No ${tab} flags`}
          </p>
          <p className="text-slate-600 text-sm">
            The worker checks for suspicious activity every cycle.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl mx-auto">
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={handlePageChange} />
          {flags.map(flag => (
            <FlagCard key={flag.id} flag={flag} onAction={handleAction} acting={acting} />
          ))}
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={handlePageChange} />
        </div>
      ))}
    </div>
    </div>
  );
}