// app/history/[userid]/page.tsx
'use client';

import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HistoryGraph from './HistoryGraph';
import { getSerialTier, getGhostTier, getCardGlowClass } from '@/lib/specialSerial';
import { SpecialSerialText } from '@/components/specialSerialText';

// ── Types ──────────────────────────────────────────────────────────────────

interface GraphPoint {
  snapshotId: string;
  date: string;
  timestamp: number;
  rap: number;
  rapThen: number;
  itemCount: number;
  uniqueCount: number;
}

interface HistoryUser {
  robloxUserId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  description: string | null;
  role: string;
}

interface SnapshotItem {
  assetId: string;
  name: string;
  imageUrl: string;
  manipulated: boolean;
  isLimitedUnique: boolean;
  rapThen: number;
  rapNow: number;
  count: number;
  userAssetIds: string[];
  serialNumbers: (number | null)[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString();

function timeAgo(ts: number) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}


// ── UAID Modal ─────────────────────────────────────────────────────────────

function UAIDModal({ item, onClose }: { item: SnapshotItem; onClose: () => void }) {
  const [uaidSortBy, setUaidSortBy] = useState('uaid-low');

  const uaidData = item.userAssetIds.map((uaid, index) => ({
    uaid,
    index,
    serial: item.serialNumbers?.[index] ?? null,
  }));

  const sortedUaidData = [...uaidData].sort((a, b) => {
    switch (uaidSortBy) {
      case 'index': return a.index - b.index;
      case 'uaid-low':
        if (a.serial != null && b.serial != null) return a.serial - b.serial;
        return (parseInt(a.uaid) || 0) - (parseInt(b.uaid) || 0);
      case 'uaid-high':
        if (a.serial != null && b.serial != null) return b.serial - a.serial;
        return (parseInt(b.uaid) || 0) - (parseInt(a.uaid) || 0);
      default: return 0;
    }
  });

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#1e1e1e] border border-white/10 rounded-xl p-6 max-w-xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-white font-bold text-lg">{item.name}</h3>
            <p className="text-[#aaa] text-sm">
              {item.count} {item.count === 1 ? 'copy' : 'copies'} • {item.rapNow.toLocaleString()} R$ each
            </p>
          </div>
          <button onClick={onClose} className="text-[#aaa] hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        <div className="mb-3">
          <select
            value={uaidSortBy}
            onChange={(e) => setUaidSortBy(e.target.value)}
            className="bg-[#1e1e1e] text-[#ccc] text-xs px-3 py-1.5 rounded-lg border border-white/10 focus:border-white/30 outline-none w-full"
          >
            <option value="uaid-low">Low to High</option>
            <option value="uaid-high">High to Low</option>
            <option value="index">Order Acquired</option>
          </select>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1">
          {sortedUaidData.map(({ uaid, serial }) => {
            const btnTier = getGhostTier(item.isLimitedUnique, serial ?? null) ?? getSerialTier(serial ?? null);
            const isSpecialBtn = btnTier !== null;
            return (
              <a
                key={uaid}
                href={`/uaid/${uaid}`}
                className={`py-2 rounded-lg text-center transition-colors truncate block bg-white/5 hover:bg-white/10 border
                  ${isSpecialBtn ? getCardGlowClass(btnTier) : (serial != null ? 'border-orange-500/40' : 'border-white/10')}`}
                title={`UAID: ${uaid}${serial != null ? ` • Serial: #${serial}` : ''}`}
              >
                {serial != null
                  ? isSpecialBtn
                    ? <SpecialSerialText serial={serial} tier={btnTier} variant="button" />
                    : <span className="text-orange-400 text-xs font-bold">#{serial}</span>
                  : btnTier === 'ghost'
                    ? <SpecialSerialText serial={null} tier="ghost" variant="button" />
                    : <span className="text-blue-400 text-xs font-bold">{uaid}</span>
                }
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Snapshot Item Card ─────────────────────────────────────────────────────

function SnapshotItemCard({ item, onOwnedCopiesClick }: { item: SnapshotItem; onOwnedCopiesClick: (item: SnapshotItem, e: React.MouseEvent) => void }) {
  const router = useRouter();
  const diff = item.rapNow - item.rapThen;
  const pct = item.rapThen > 0 ? ((diff / item.rapThen) * 100).toFixed(1) : '0';
  const isUp = diff > 0;
  const isDown = diff < 0;

  const showUAIDButton = item.count === 1 && item.userAssetIds?.length === 1;
  const uaid = showUAIDButton ? item.userAssetIds[0] : null;

  return (
    <div
      className="bg-white/5 rounded-lg p-4 border border-white/10 hover:border-white/25 transition-all flex flex-col cursor-pointer"
      onClick={() => router.push(`/item/${item.assetId}`)}
    >
      <div className="aspect-square bg-white/5 rounded mb-2 overflow-hidden relative flex items-center justify-center">
        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
        {item.manipulated && (
          <img src="/Images/manipulated1.png" alt="Manipulated" title="This item's RAP may be manipulated" className="w-6 h-6 absolute top-1 left-1" />
        )}
        {item.count > 1 && (
          <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded">
            <span className="text-[#4fc3f7] text-xs font-bold">×{item.count}</span>
          </div>
        )}
      </div>

      {/* Name */}
      <p className="text-white text-sm font-semibold truncate hover:text-purple-400 transition-colors" title={item.name}>
        {item.name}
      </p>

      {/* Stat sections */}
      <div className="mt-3 space-y-2">

        {/* THEN */}
        <div className={`bg-purple-500/10 rounded-md px-3 py-2 relative group${item.count > 1 ? ' cursor-help' : ''}`}>
          <p className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: '#a78bfa' }}>Then</p>
          <div className="flex items-baseline gap-1.5">
            <p className="text-sm font-bold" style={{ color: '#a78bfa' }}>{fmt(item.rapThen)} R$</p>
          </div>
          {item.count > 1 && (
            <div className="absolute bottom-full left-0 mb-1.5 z-20 hidden group-hover:block pointer-events-none">
              <div className="bg-[#111] border border-white/10 rounded-lg px-3 py-1.5 text-xs shadow-xl whitespace-nowrap">
                <span className="text-[#888]">Total </span>
                <span className="text-[#aaa] font-bold">{fmt(item.rapThen * item.count)} R$</span>
              </div>
            </div>
          )}
        </div>

        {/* NOW */}
        <div className={`bg-cyan-500/10 rounded-md px-3 py-2 relative group${item.count > 1 ? ' cursor-help' : ''}`}>
          <p className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: '#4fc3f7' }}>Now</p>
          <div className="flex items-baseline gap-1.5">
            <p className="text-sm font-bold" style={{ color: '#4fc3f7' }}>{fmt(item.rapNow)} R$</p>
          </div>
          {item.count > 1 && (
            <div className="absolute bottom-full left-0 mb-1.5 z-20 hidden group-hover:block pointer-events-none">
              <div className="bg-[#111] border border-white/10 rounded-lg px-3 py-1.5 text-xs shadow-xl whitespace-nowrap">
                <span className="text-[#888]">Total </span>
                <span className="text-[#4fc3f7] font-bold">{fmt(item.rapNow * item.count)} R$</span>
              </div>
            </div>
          )}
        </div>

        {/* CHANGE — always shown, totals included for hoards */}
        <div className={`rounded-md px-3 py-2 ${Math.abs(diff) > 0.01 ? (isUp ? 'bg-[#5dd678]/10' : 'bg-[#d85a5a]/10') : 'bg-white/5'}`}>
          <div className="flex items-center gap-1 mb-1">
            <p className={`text-[10px] uppercase tracking-widest font-bold ${isUp ? 'text-[#5dd678]' : isDown ? 'text-[#d85a5a]' : 'text-[#aaa]'}`}>Change</p>
            {Math.abs(diff) > 0.01 && (
              <img src={isUp ? '/Images/gain.png' : '/Images/loss.png'} alt={isUp ? 'gain' : 'loss'} className="w-3 h-3 flex-shrink-0" />
            )}
          </div>
          {Math.abs(diff) > 0.01 ? (
            <div className={`flex justify-between items-baseline font-bold ${isUp ? 'text-[#5dd678]' : 'text-[#d85a5a]'}`}>
              <span className={Math.abs(diff * item.count) >= 10000 ? 'text-xs' : 'text-sm'}>{isUp ? '+' : '-'}{fmt(Math.abs(diff * item.count))} R$</span>
              <span className="text-xs font-normal">{isUp ? '+' : ''}{pct}%</span>
            </div>
          ) : (
            <p className="text-[#444] text-sm font-semibold">—</p>
          )}
        </div>
      </div>

      <div className="flex-grow" />

      <div className="mt-2">
        {item.count > 1 && (
          <button
            onClick={(e) => onOwnedCopiesClick(item, e)}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold py-1.5 px-2 rounded-lg transition-colors mb-1"
          >
            Owned Copies
          </button>
        )}
        {showUAIDButton && (
          <a
            href={`/uaid/${uaid}`}
            onClick={(e) => e.stopPropagation()}
            className="block w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold py-1.5 px-2 rounded-lg transition-colors text-center mb-1"
          >
            Visit UAID Page
          </a>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function HistoryPage({ params }: { params: Promise<{ userid: string }> }) {
  const { userid } = use(params);

  const [user, setUser] = useState<HistoryUser | null>(null);
  const [graphData, setGraphData] = useState<GraphPoint[]>([]);
  const [totalSnapshots, setTotalSnapshots] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSnap, setSelectedSnap] = useState<GraphPoint | null>(null);
  const [snapItems, setSnapItems] = useState<SnapshotItem[]>([]);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapRapThen, setSnapRapThen] = useState(0);
  const [snapRapNow, setSnapRapNow] = useState(0);

  const [uaidModalItem, setUaidModalItem] = useState<SnapshotItem | null>(null);

  useEffect(() => {
    fetch(`/api/history/${userid}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setUser(data.user);
        setGraphData(data.graphData);
        setTotalSnapshots(data.totalSnapshots);
        if (data.graphData.length > 0) {
          loadSnapshot(data.graphData[data.graphData.length - 1]);
        }
      })
      .catch(() => setError('Failed to load history'))
      .finally(() => setLoading(false));
  }, [userid]);

  const loadSnapshot = useCallback(async (point: GraphPoint) => {
    setSelectedSnap(point);
    setSnapLoading(true);
    setSnapItems([]);
    try {
      const res = await fetch(`/api/snapshot/${point.snapshotId}`);
      const data = await res.json();
      setSnapItems(data.items ?? []);
      setSnapRapThen(data.totalRapThen ?? 0);
      setSnapRapNow(data.totalRapNow ?? 0);
    } catch {
      setSnapItems([]);
    } finally {
      setSnapLoading(false);
    }
  }, []);

  const openUaidModal = useCallback((item: SnapshotItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setUaidModalItem(item);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeUaidModal = useCallback(() => {
    setUaidModalItem(null);
    document.body.style.overflow = 'unset';
  }, []);

  if (loading) return (
    <div className="min-h-screen w-full bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-[#666] text-sm animate-pulse">Loading history…</div>
    </div>
  );

  if (error || !user) return (
    <div className="min-h-screen w-full bg-[#0a0a0a] flex items-center justify-center p-8">
      <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
        <p className="text-[#d85a5a] text-lg font-bold mb-2">Failed to load</p>
        <p className="text-[#888]">{error}</p>
      </div>
    </div>
  );

  const rapDiff = snapRapNow - snapRapThen;
  const rapPct = snapRapThen > 0 ? ((rapDiff / snapRapThen) * 100).toFixed(2) : '0';

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white p-4 -mt-20 pt-24">
      <div className="max-w-7xl mx-auto">

        {/* ── Top row: sidebar + graph ───────────────────────────────── */}
        <div className="flex items-stretch gap-6 mb-6">

          {/* Sidebar */}
          <div className="w-80 flex-shrink-0">
            <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6 h-full relative">

              {/* Role badge */}
              {user.role && user.role !== 'user' && (
                <div className="absolute top-4 left-4 group z-10">
                  <img
                    src={`/Images/${user.role}.png`}
                    alt={user.role}
                    className="w-7 h-7 object-contain opacity-90 hover:opacity-100 transition"
                  />
                  {(() => {
                    const roleStyles: Record<string, { bg: string; border: string; text: string }> = {
                      mod:   { bg: '#0a1a2e', border: '#3b82f6', text: '#93c5fd' },
                      admin: { bg: '#2e0a0a', border: '#ef4444', text: '#fca5a5' },
                      owner: { bg: '#1a0a2e', border: '#8b5cf6', text: '#c4b5fd' },
                    };
                    const s = roleStyles[user.role] ?? roleStyles.owner;
                    const label = user.role === 'mod' ? 'Moderator' : user.role === 'admin' ? 'Admin' : user.role === 'owner' ? 'Owner' : user.role;
                    return (
                      <div className="absolute left-0 top-full mt-1.5 px-2 py-1 rounded-md text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg"
                        style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
                        {label}
                      </div>
                    );
                  })()}
                </div>
              )}

              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.displayName || user.username} className="w-full h-auto rounded-lg mb-5" />
              ) : (
                <div className="w-full aspect-square bg-white/5 rounded-lg flex items-center justify-center mb-5">
                  <span className="text-[#888]">No avatar</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <h1 className="text-2xl font-bold text-white">{user.displayName || user.username}</h1>
                  <p className="text-[#aaa] text-sm">@{user.username}</p>
                </div>

                {user.description && (
                  <p className="text-[#888] text-sm truncate">{user.description}</p>
                )}

                <div className="text-[#777] text-xs">Roblox ID: {user.robloxUserId}</div>

                <div className="pt-4 border-t border-white/10 space-y-2">
                  {graphData.length > 0 && (
                    <div className="flex justify-between items-center cursor-default">
                      <span className="text-[#aaa] text-sm">First Seen</span>
                      <span className="font-semibold text-sm" style={{ color: '#d85a5a' }}>{graphData[0].date}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center cursor-default">
                    <span className="text-[#aaa] text-sm">Total Snapshots</span>
                    <span className="font-semibold text-sm" style={{ color: '#ffa121' }}>{totalSnapshots}</span>
                  </div>
                  {graphData.length > 0 && (
                    <div className="flex justify-between items-center cursor-default">
                      <span className="text-[#aaa] text-sm">Latest RAP</span>
                      <span className="font-semibold text-sm" style={{ color: '#4fc3f7' }}>
                        {fmt(graphData[graphData.length - 1].rap)} R$
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Graph */}
          <div className="flex-1 min-w-0">
            <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6 h-full flex flex-col relative">
              <HistoryGraph
                data={graphData}
                userid={userid}
                selectedSnap={selectedSnap}
                onPointClick={loadSnapshot}
              />
              <Link
                href={`/player/${userid}`}
                className="absolute bottom-4 right-4 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all bg-[#a78bfa]/10 hover:bg-[#a78bfa]/20 border-[#a78bfa]/30 text-[#a78bfa]"
              >
                ← Back to Profile
              </Link>
            </div>
          </div>
        </div>

        {/* ── Snapshot stats bar ──────────────────────────────────────── */}
        {selectedSnap && (
          <div className="bg-[#1e1e1e] border border-white/10 rounded-xl p-5 mb-6">
            <div className="flex flex-wrap justify-between gap-y-4">
              <div>
                <p className="text-[#555] text-[10px] uppercase tracking-wider font-bold mb-0.5">Snapshot</p>
                <p className="text-white font-bold text-lg leading-none">{selectedSnap.date}</p>
                <p className="text-[#555] text-xs mt-0.5">{timeAgo(selectedSnap.timestamp)}</p>
              </div>
              <div>
                <p className="text-[#555] text-[10px] uppercase tracking-wider font-bold mb-0.5">RAP Then</p>
                <p className="font-bold text-lg" style={{ color: '#a78bfa' }}>{fmt(snapRapThen)} R$</p>
              </div>
              <div>
                <p className="text-[#555] text-[10px] uppercase tracking-wider font-bold mb-0.5">RAP Now</p>
                <p className="font-bold text-lg" style={{ color: '#4fc3f7' }}>{fmt(snapRapNow)} R$</p>
              </div>
              <div>
                <p className="text-[#555] text-[10px] uppercase tracking-wider font-bold mb-0.5">Change</p>
                <p className={`font-bold text-lg ${rapDiff > 0 ? 'text-[#5dd678]' : rapDiff < 0 ? 'text-[#d85a5a]' : 'text-[#888]'}`}>
                  {Math.abs(rapDiff) > 0.01
                    ? `${rapDiff > 0 ? '+' : ''}${fmt(rapDiff)} R$ (${rapDiff > 0 ? '+' : ''}${rapPct}%)`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-[#555] text-[10px] uppercase tracking-wider font-bold mb-0.5">Items</p>
                <p className="text-white font-bold text-lg">{selectedSnap.itemCount}</p>
              </div>
              <div>
                <p className="text-[#555] text-[10px] uppercase tracking-wider font-bold mb-0.5">Unique</p>
                <p className="text-white font-bold text-lg">{selectedSnap.uniqueCount}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Inventory grid ───────────────────────────────────────────── */}
        {selectedSnap && (
          <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-8 shadow-lg min-h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">
                Inventory
                <span className="text-[#555] font-normal text-base ml-2">on {selectedSnap.date}</span>
              </h2>
            </div>

            {snapLoading ? (
              <div className="flex items-center justify-center flex-1 text-[#666] text-sm animate-pulse">
                Loading snapshot…
              </div>
            ) : snapItems.length === 0 ? (
              <div className="flex items-center justify-center flex-1 text-[#666] text-sm">
                No items in this snapshot
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
                {snapItems.map((item, idx) => (
                  <SnapshotItemCard
                    key={`${item.assetId}-${idx}`}
                    item={item}
                    onOwnedCopiesClick={openUaidModal}
                  />
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── UAID Modal ─────────────────────────────────────────────────── */}
      {uaidModalItem && (
        <UAIDModal item={uaidModalItem} onClose={closeUaidModal} />
      )}
    </div>
  );
}