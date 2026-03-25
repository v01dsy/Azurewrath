'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getUserSession } from '@/lib/userSession';
import { getSerialTier } from '@/lib/specialSerial';
import { SpecialSerialText } from '@/components/specialSerialText';

interface TradeItem {
  id: string;
  assetId: string;
  name: string;
  imageUrl: string | null;
  manipulated: boolean;
  rap: number | null;
  userAssetId?: string | null;
  serialNumber?: number | null;
}

interface TradeAd {
  id: string;
  note: string | null;
  offerRobux: number;
  requestRobux: number;
  createdAt: string;
  user: {
    robloxUserId: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  offerItems: TradeItem[];
  requestItems: TradeItem[];
}

function timeAgo(s: string) {
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function ItemThumb({ item }: { item: TradeItem | null }) {
  if (!item) {
    return (
      <div
        className="rounded-xl border border-dashed border-white/[0.07] bg-white/[0.02]"
        style={{ aspectRatio: '1', minHeight: 105 }}
      />
    );
  }

  const serial = item.serialNumber ?? null;
  const tier = getSerialTier(serial);
  const isSpecial = tier !== null;

  return (
    <Link
      href={`/item/${item.assetId}`}
      title={item.name}
      className="relative w-full rounded-xl overflow-hidden border border-white/10 bg-black/60 hover:border-white/25 transition-all group block"
      style={{ aspectRatio: '1', minHeight: 105 }}
    >
      {item.imageUrl
        ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
        : <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">?</div>
      }
      {item.manipulated && (
        <img src="/Images/manipulated1.webp" alt="manip" className="absolute top-1 left-1 w-4 h-4" />
      )}
      {serial != null && (
        <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-lg serial-badge-sm">
          <style>{`.serial-badge-sm span { font-size: 11px !important; }`}</style>
          {isSpecial
            ? <SpecialSerialText serial={serial} tier={tier} variant="badge" />
            : <span className="font-bold text-orange-400" style={{ fontSize: 11 }}>#{serial}</span>
          }
        </div>
      )}
    </Link>
  );
}

// Compact version for mobile — no minHeight constraint
function ItemThumbMobile({ item }: { item: TradeItem | null }) {
  if (!item) {
    return (
      <div
        className="rounded-lg border border-dashed border-white/[0.07] bg-white/[0.02]"
        style={{ aspectRatio: '1' }}
      />
    );
  }

  const serial = item.serialNumber ?? null;
  const tier = getSerialTier(serial);
  const isSpecial = tier !== null;

  return (
    <Link
      href={`/item/${item.assetId}`}
      title={item.name}
      className="relative w-full rounded-lg overflow-hidden border border-white/10 bg-black/60 hover:border-white/25 transition-all group block"
      style={{ aspectRatio: '1' }}
    >
      {item.imageUrl
        ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">?</div>
      }
      {item.manipulated && (
        <img src="/Images/manipulated1.webp" alt="manip" className="absolute top-1 left-1 w-3 h-3" />
      )}
      {serial != null && (
        <div className="absolute top-0.5 right-0.5 bg-black/70 backdrop-blur-sm px-1 py-0.5 rounded">
          {isSpecial
            ? <SpecialSerialText serial={serial} tier={tier} variant="badge" />
            : <span className="font-bold text-orange-400" style={{ fontSize: 9 }}>#{serial}</span>
          }
        </div>
      )}
    </Link>
  );
}

function RobuxPill({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  return (
    <div className="flex">
      <div className="inline-flex items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-500/5 px-3 py-1.5">
        <span className="text-purple-400 font-bold text-xs">R$</span>
        <span className="text-purple-300 font-bold text-sm tabular-nums">{amount.toLocaleString()} Robux</span>
      </div>
    </div>
  );
}

function TradeAdCard({ ad, currentUserId, onDelete }: {
  ad: TradeAd;
  currentUserId: string | null;
  onDelete: (id: string) => void;
}) {
  const isOwn = currentUserId === ad.user.robloxUserId;
  const offerSlots   = Array.from({ length: 4 }, (_, i) => ad.offerItems[i]   ?? null);
  const requestSlots = Array.from({ length: 4 }, (_, i) => ad.requestItems[i] ?? null);

  const offerItemRap   = offerSlots.reduce((s, i) => s + (i?.rap ?? 0), 0);
  const requestItemRap = requestSlots.reduce((s, i) => s + (i?.rap ?? 0), 0);
  const offerRobux70   = Math.round((ad.offerRobux ?? 0) * 0.7);
  const requestRobux70 = Math.round((ad.requestRobux ?? 0) * 0.7);
  const offerTotal     = offerItemRap + offerRobux70;
  const requestTotal   = requestItemRap + requestRobux70;

  // owner: am I getting a good deal? / viewer: is this a good offer for me to accept?
  const diff = isOwn
    ? requestTotal - offerTotal
    : offerTotal - requestTotal;
  const pct  = requestTotal > 0 ? Math.round((diff / requestTotal) * 100) : null;
  const up   = diff >= 0;

  return (
    <div
      className="rounded-2xl border border-white/10 bg-[#0d0d0f] p-6 hover:border-white/20 transition-all"
      style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.4)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link href={`/player/${ad.user.robloxUserId}`} className="flex items-center gap-3 group flex-shrink-0">
          {ad.user.avatarUrl && (
            <img
              src={ad.user.avatarUrl}
              alt={ad.user.username}
              className="w-11 h-11 rounded-full border border-white/10 group-hover:border-white/30 transition flex-shrink-0"
            />
          )}
          <div>
            <p className="text-white font-bold group-hover:text-white/70 transition leading-tight">
              {ad.user.displayName ?? ad.user.username}
            </p>
            <p className="text-slate-500 text-sm">@{ad.user.username}</p>
          </div>
        </Link>

        <div className="flex-1" />

        <span className="text-slate-600 text-sm flex-shrink-0">{timeAgo(ad.createdAt)}</span>
        <a
          href={`https://www.roblox.com/users/${ad.user.robloxUserId}/trade`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-sm px-4 py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border border-purple-500/30 hover:border-purple-400/50 transition font-semibold"
        >
          Send Trade ↗
        </a>
        <Link
          href={`/trade/${ad.id}`}
          className="flex-shrink-0 text-sm px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition font-semibold"
        >
          View
        </Link>
        {isOwn && (
          <button
            onClick={() => onDelete(ad.id)}
            className="flex-shrink-0 text-sm px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition font-semibold"
          >
            Delete
          </button>
        )}
      </div>

      {/* ── DESKTOP trade grid (md+) — original, untouched ── */}
      <div className="hidden md:flex items-start gap-4">

        {/* Offering */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">Offering</p>
          <div className="grid grid-cols-4 gap-3 w-full">
            {offerSlots.map((item, i) => (
              <div key={i} className="flex flex-col gap-1">
                <ItemThumb item={item} />
                {item?.rap != null && item.rap > 0 && (
                  <p className="text-[11px] font-semibold text-slate-400 tabular-nums text-center">{item.rap.toLocaleString()} R$</p>
                )}
              </div>
            ))}
          </div>
          {ad.offerRobux > 0 && <RobuxPill amount={ad.offerRobux} />}
          {offerTotal > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-slate-500 tabular-nums">
                {ad.offerRobux > 0
                  ? `${offerItemRap.toLocaleString()} RAP + ${offerRobux70.toLocaleString()} Robux (70%)`
                  : `${offerItemRap.toLocaleString()} RAP`}
              </span>
              <span className="text-sm font-bold tabular-nums" style={{ color: '#43e97b' }}>
                Total: {offerTotal.toLocaleString()} R$
              </span>
            </div>
          )}
        </div>

        {/* Swap + diff */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0 mt-8">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/[0.04] border border-white/10">
            <span className="text-slate-500 text-sm">⇄</span>
          </div>
          {(offerTotal > 0 || requestTotal > 0) && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap"
              style={{
                background: up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${up ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                color: up ? '#4ade80' : '#f87171',
              }}
            >
              <span>{up ? '▲' : '▼'}</span>
              <span>{up ? '+' : ''}{diff.toLocaleString()}{pct !== null ? ` (${up ? '+' : ''}${pct}%)` : ''}</span>
            </div>
          )}
        </div>

        {/* Requesting */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">Requesting</p>
          <div className="grid grid-cols-4 gap-3 w-full">
            {requestSlots.map((item, i) => (
              <div key={i} className="flex flex-col gap-1">
                <ItemThumb item={item} />
                {item?.rap != null && item.rap > 0 && (
                  <p className="text-[11px] font-semibold text-slate-400 tabular-nums text-center">{item.rap.toLocaleString()} R$</p>
                )}
              </div>
            ))}
          </div>
          {ad.requestRobux > 0 && <RobuxPill amount={ad.requestRobux} />}
          {requestTotal > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-slate-500 tabular-nums">
                {ad.requestRobux > 0
                  ? `${requestItemRap.toLocaleString()} RAP + ${requestRobux70.toLocaleString()} Robux (70%)`
                  : `${requestItemRap.toLocaleString()} RAP`}
              </span>
              <span className="text-sm font-bold tabular-nums" style={{ color: '#43e97b' }}>
                Total: {requestTotal.toLocaleString()} R$
              </span>
            </div>
          )}
        </div>

      </div>

      {/* ── MOBILE trade grid (below md) — stacked ── */}
      <div className="md:hidden space-y-3">

        {/* Offering */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">Offering</p>
          <div className="grid grid-cols-4 gap-2">
            {offerSlots.map((item, i) => (
              <div key={i} className="flex flex-col gap-1">
                <ItemThumbMobile item={item} />
                {item?.rap != null && item.rap > 0 && (
                  <p className="text-[9px] font-semibold text-slate-400 tabular-nums text-center truncate">{item.rap.toLocaleString()}</p>
                )}
              </div>
            ))}
          </div>
          {ad.offerRobux > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-2 py-1 self-start">
              <span className="text-purple-400 font-bold text-xs">R$</span>
              <span className="text-purple-300 font-bold text-xs tabular-nums">{ad.offerRobux.toLocaleString()} Robux</span>
            </div>
          )}
          {offerTotal > 0 && (
            <span className="text-xs font-bold tabular-nums" style={{ color: '#43e97b' }}>
              Total: {offerTotal.toLocaleString()} R$
            </span>
          )}
        </div>

        {/* Diff badge */}
        {(offerTotal > 0 || requestTotal > 0) && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-white/5" />
            <div
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-xs whitespace-nowrap"
              style={{
                background: up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${up ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                color: up ? '#4ade80' : '#f87171',
              }}
            >
              <span>{up ? '▲' : '▼'}</span>
              <span>{up ? '+' : ''}{diff.toLocaleString()}{pct !== null ? ` (${up ? '+' : ''}${pct}%)` : ''}</span>
            </div>
            <div className="flex-1 h-px bg-white/5" />
          </div>
        )}

        {/* Requesting */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">Requesting</p>
          <div className="grid grid-cols-4 gap-2">
            {requestSlots.map((item, i) => (
              <div key={i} className="flex flex-col gap-1">
                <ItemThumbMobile item={item} />
                {item?.rap != null && item.rap > 0 && (
                  <p className="text-[9px] font-semibold text-slate-400 tabular-nums text-center truncate">{item.rap.toLocaleString()}</p>
                )}
              </div>
            ))}
          </div>
          {ad.requestRobux > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-2 py-1 self-start">
              <span className="text-purple-400 font-bold text-xs">R$</span>
              <span className="text-purple-300 font-bold text-xs tabular-nums">{ad.requestRobux.toLocaleString()} Robux</span>
            </div>
          )}
          {requestTotal > 0 && (
            <span className="text-xs font-bold tabular-nums" style={{ color: '#43e97b' }}>
              Total: {requestTotal.toLocaleString()} R$
            </span>
          )}
        </div>

      </div>

      {ad.note && (
        <p className="mt-4 text-slate-400 text-sm bg-white/[0.03] rounded-lg px-4 py-3 border border-white/5 italic">
          "{ad.note}"
        </p>
      )}
    </div>
  );
}

const PAGE_SIZE = 10;

export default function TradePage() {
  const [ads, setAds] = useState<TradeAd[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [filterSearch, setFilterSearch] = useState('');
  const [filterResults, setFilterResults] = useState<{ assetId: string; name: string; imageUrl: string | null }[]>([]);
  const [filterSearching, setFilterSearching] = useState(false);
  const [activeAssetFilter, setActiveAssetFilter] = useState<{ assetId: string; name: string; imageUrl: string | null } | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    const session = getUserSession();
    if (session) setCurrentUserId(session.robloxUserId);
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    fetch('/api/trade/cooldown')
      .then(r => r.json())
      .then(d => { if (d.secondsLeft > 0) setCooldownSeconds(d.secondsLeft); })
      .catch(() => {});
  }, [currentUserId]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const t = setInterval(() => setCooldownSeconds(s => {
      if (s <= 1) { clearInterval(t); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [cooldownSeconds]);

  const formatCooldown = (s: number) => s >= 60 ? `${Math.ceil(s / 60)}m` : `${s}s`;

  useEffect(() => {
    if (!filterSearch.trim() || filterSearch.length < 2) {
      setFilterResults([]);
      setShowFilterDropdown(false);
      return;
    }
    const t = setTimeout(async () => {
      setFilterSearching(true);
      try {
        const res = await fetch(`/api/items/search?q=${encodeURIComponent(filterSearch)}`);
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items ?? []);
        setFilterResults(items.slice(0, 6));
        setShowFilterDropdown(true);
      } finally {
        setFilterSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [filterSearch]);

  const loadPage = useCallback(async (p: number, assetId?: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        skip: String((p - 1) * PAGE_SIZE),
        take: String(PAGE_SIZE),
      });
      if (assetId) params.set('assetId', assetId);
      const res = await fetch(`/api/trade?${params}`);
      const data = await res.json();
      setAds(data.ads ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage(page, activeAssetFilter?.assetId ?? null);
  }, [loadPage, page, activeAssetFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this trade ad?')) return;
    const res = await fetch(`/api/trade/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setAds(prev => prev.filter(a => a.id !== id));
      setTotal(prev => Math.max(0, prev - 1));
    }
  };

  const applyFilter = (item: { assetId: string; name: string; imageUrl: string | null }) => {
    setActiveAssetFilter(item);
    setFilterSearch('');
    setFilterResults([]);
    setShowFilterDropdown(false);
    setPage(1);
  };

  const clearFilter = () => {
    setActiveAssetFilter(null);
    setPage(1);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 pb-12 px-6">
      <div className="max-w-6xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Trade Ads</h1>
            <p className="text-slate-500 text-sm mt-1">Browse active trade listings from the community</p>
          </div>
          {currentUserId ? (
            cooldownSeconds > 0 ? (
              <div className="px-4 py-2 rounded-xl font-semibold text-sm bg-white/5 text-slate-500 border border-white/10 cursor-not-allowed">
                Post in {formatCooldown(cooldownSeconds)}
              </div>
            ) : (
              <Link
                href="/trade/new"
                className="px-4 py-2 rounded-xl font-semibold text-sm bg-purple-600/30 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 hover:border-purple-400/60 transition"
              >
                + Post Trade Ad
              </Link>
            )
          ) : (
            <Link
              href="/verify"
              className="px-4 py-2 rounded-xl font-semibold text-sm bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition"
            >
              Login to Post
            </Link>
          )}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          {activeAssetFilter && (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              {activeAssetFilter.imageUrl && (
                <img src={activeAssetFilter.imageUrl} alt={activeAssetFilter.name} className="w-5 h-5 rounded object-cover" />
              )}
              <span className="text-white text-sm font-semibold truncate max-w-[180px]">{activeAssetFilter.name}</span>
              <button
                onClick={clearFilter}
                className="w-4 h-4 rounded-full bg-white/10 hover:bg-white/20 text-white/60 text-xs flex items-center justify-center transition ml-1"
              >
                ×
              </button>
            </div>
          )}

          <div className="relative">
            <input
              type="text"
              placeholder="Filter by requested item…"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              onBlur={() => setTimeout(() => setShowFilterDropdown(false), 150)}
              onFocus={() => filterResults.length > 0 && setShowFilterDropdown(true)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-white/30 transition w-60"
            />
            {filterSearching && (
              <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
            )}
            {showFilterDropdown && filterResults.length > 0 && (
              <div className="absolute top-full mt-1 left-0 w-72 bg-[#0d0d10] border border-white/10 rounded-xl overflow-hidden shadow-xl z-20">
                {filterResults.map(item => (
                  <button
                    key={item.assetId}
                    onMouseDown={() => applyFilter(item)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition text-left"
                  >
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt={item.name} className="w-7 h-7 rounded object-cover flex-shrink-0" />
                    )}
                    <span className="text-white text-sm truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {total > 0 && (
            <span className="text-slate-600 text-xs ml-auto">
              {total} ad{total !== 1 ? 's' : ''}{activeAssetFilter ? ' matching filter' : ''}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-white/20 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : ads.length === 0 ? (
          <div className="text-center py-20 space-y-2">
            <p className="text-slate-400 text-lg">
              {activeAssetFilter ? `No trade ads requesting ${activeAssetFilter.name}` : 'No active trade ads'}
            </p>
            <p className="text-slate-600 text-sm">
              {activeAssetFilter ? 'Try a different item or clear the filter' : 'Be the first to post one!'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {ads.map(ad => (
              <TradeAdCard key={ad.id} ad={ad} currentUserId={currentUserId} onDelete={handleDelete} />
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 transition"
                >
                  ← Prev
                </button>
                <span className="text-slate-500 text-sm">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 transition"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}