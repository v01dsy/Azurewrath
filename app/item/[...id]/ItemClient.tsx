// app/item/[...id]/ItemClient.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { getUserSession } from '@/lib/userSession';
import { getSerialTier, getGhostTier } from '@/lib/specialSerial';
import { SpecialSerialText } from '@/components/specialSerialText';
import HoardsSection from '@/components/HoardsSection';
import Pagination from '@/components/Pagination';
import { hasRole } from '@/lib/roles';
import { timeSince } from '@/lib/timeSince';

// ── Types ──────────────────────────────────────────────────────────────────

interface PricePoint {
  id: string;
  price: number;
  rap?: number | null;
  salesVolume?: number | null;
  timestamp: string;
}

interface ItemDetail {
  assetId: string;
  name: string;
  imageUrl?: string | null;
  description?: string | null;
  manipulated: boolean;
  isLimitedUnique?: boolean | null;
  currentPrice?: number | null;
  currentRap?: number | null;
  salesVolume?: number | null;
  lastUpdated?: string | null;
  priceHistory: PricePoint[];
  marketTrends?: {
    id: string;
    trend: string;
    priceDirection: string;
    volatility: number;
    estimatedDemand: number;
  };
}

interface Owner {
  userAssetId: string;
  serialNumber: number | null;
  username: string;
  displayName: string;
  robloxUserId: string;
  avatarUrl: string | null;
  scannedAt: string;
  uaidUpdatedAt: string | null;
}

interface ScanProgress {
  total: number;
  processed: number;
  failed: number;
  currentUser: string | null;
  startedAt: number;
  pagesFound?: number;
}

interface ScanState {
  scanning: boolean;
  stopRequested: boolean;
  progress: ScanProgress | null;
}

interface Props {
  item: ItemDetail;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString();
const fmtEta = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

function niceMax(raw: number) {
  if (raw <= 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const candidates = [1, 2, 2.5, 5, 10].map(n => n * mag);
  return candidates.find(c => c >= raw * 1.15) ?? raw * 1.5;
}
function buildTicks(max: number, n = 5) {
  const step = max / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(i * step));
}
const fmtY = (v: number) => {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(v);
};

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-left text-[11px] font-bold text-purple-400 uppercase tracking-wider">
      {children}
    </th>
  );
}

function AcquiredCell({ uaidUpdatedAt }: { uaidUpdatedAt: string | null }) {
  if (!uaidUpdatedAt) return <span className="text-slate-500">—</span>;
  const date = new Date(uaidUpdatedAt);
  const diffMs = new Date().getTime() - date.getTime();
  const mins = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(months / 12);

  const short = (() => {
    if (years > 0) return `${years} year${years === 1 ? '' : 's'} ago`;
    if (months > 0) return `${months} month${months === 1 ? '' : 's'} ago`;
    if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
    if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  })();

  const long = (() => {
    if (years > 0) return `${years}y ${months % 12}mo ago`;
    if (months > 0) return `${months}mo ${days % 30}d ago`;
    if (days > 0) return `${days}d ${hours % 24}h ago`;
    if (hours > 0) return `${hours}h ${mins % 60}m ago`;
    return `${mins}m ago`;
  })();

  const full = date.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="relative group inline-block">
      <span className="text-white text-sm font-medium cursor-default">{short}</span>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 hidden group-hover:block pointer-events-none">
        <div className="bg-[#111] border border-white/10 rounded-lg px-3 py-1.5 text-xs shadow-xl whitespace-nowrap">
          <p className="text-[#ccc] font-bold mb-1 text-center">{long}</p>
          <p className="text-[#ccc] font-bold">{full}</p>
        </div>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ItemClient({ item: initialItem }: Props) {
  const router = useRouter();

  const itemId = initialItem.assetId;

  const [item, setItem] = useState<ItemDetail>(initialItem);
  const [userRole, setUserRole] = useState('user');
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [manipulatedLoading, setManipulatedLoading] = useState(false);
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(true);
  const [ownerSort, setOwnerSort] = useState<'serial' | 'username' | 'recent'>('serial');
  const [ownerPage, setOwnerPage] = useState(1);
  const [ownerPageSize, setOwnerPageSize] = useState<10 | 25 | 50 | 100>(25);

  const [scanState, setScanState] = useState<ScanState>({ scanning: false, stopRequested: false, progress: null });
  const [scanStarting, setScanStarting] = useState(false);
  // 'timestamps' | 'full' | null — tracks which button was clicked so we can
  // show the spinner on the correct button only
  const [activeScanType, setActiveScanType] = useState<'timestamps' | 'full' | null>(null);
  const [scanMessage, setScanMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<'owners' | 'hoards'>('owners');

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const legendItems = [
    { dataKey: 'rap', name: 'RAP', color: '#34d399' },
    { dataKey: 'price', name: 'Price', color: '#3b82f6' },
  ];

  // ── Fetch owners ───────────────────────────────────────────────────────

  const fetchOwners = useCallback(async () => {
    try {
      const res = await axios.get(`/api/items/${itemId}/owners`);
      const seen = new Set<string>();
      const deduped = (res.data.owners || []).filter((o: Owner) => {
        if (seen.has(o.userAssetId)) return false;
        seen.add(o.userAssetId);
        return true;
      });
      setOwners(deduped);
    } catch { setOwners([]); }
    finally { setOwnersLoading(false); }
  }, [itemId]);

  // ── Scan polling ───────────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const [statusRes] = await Promise.all([
          axios.get(`/api/items/${itemId}/scan-owners`),
          fetchOwners(),
        ]);
        const data: ScanState = statusRes.data;
        setScanState(data);
        if (!data.scanning) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setScanMessage({ text: '✅ Scan complete', ok: true });
          setActiveScanType(null);
          fetchOwners();
        }
      } catch {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setScanState(prev => ({ ...prev, scanning: false }));
        setActiveScanType(null);
      }
    }, 2000);
  }, [itemId, fetchOwners]);

  // Update timestamps only — uses the default 'owners' job type
  const handleScanOwners = async () => {
    const user = getUserSession();
    if (!user) return;
    setScanMessage(null);
    setScanStarting(true);
    setActiveScanType('timestamps');
    try {
      const res = await axios.post(`/api/items/${itemId}/scan-owners`, {
        userId: user.robloxUserId,
        // no action field → defaults to 'owners' job type in the route
      });
      setScanState({ scanning: true, stopRequested: false, progress: null });
      setScanMessage({ text: `🔄 ${res.data.message}`, ok: true });
      startPolling();
    } catch (err: any) {
      setScanMessage({ text: `❌ ${err.response?.data?.error || 'Scan failed'}`, ok: false });
      setActiveScanType(null);
    } finally {
      setScanStarting(false);
    }
  };

  // Full scan — explicitly sends action: 'full' → creates 'owners_full' job
  const handleFullScan = async () => {
    const user = getUserSession();
    if (!user) return;
    setScanMessage(null);
    setScanStarting(true);
    setActiveScanType('full');
    try {
      const res = await axios.post(`/api/items/${itemId}/scan-owners`, {
        userId: user.robloxUserId,
        action: 'full',
      });
      setScanState({ scanning: true, stopRequested: false, progress: null });
      setScanMessage({ text: `🔄 ${res.data.message}`, ok: true });
      startPolling();
    } catch (err: any) {
      setScanMessage({ text: `❌ ${err.response?.data?.error || 'Scan failed'}`, ok: false });
      setActiveScanType(null);
    } finally {
      setScanStarting(false);
    }
  };

  const handleStopScan = async () => {
    const user = getUserSession();
    if (!user) return;
    try {
      await axios.post(`/api/items/${itemId}/scan-owners`, { userId: user.robloxUserId, action: 'stop' });
      setScanState(prev => ({ ...prev, stopRequested: true }));
      setScanMessage({ text: '🛑 Stopping after current user…', ok: true });
    } catch {
      setScanMessage({ text: '❌ Failed to send stop request', ok: false });
    }
  };

  // ── Effects ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!itemId) return;
    axios.get(`/api/items/${itemId}/scan-owners`).then(res => {
      const data: ScanState = res.data;
      setScanState(data);
      if (data.scanning) {
        setScanMessage({ text: '🔄 Scan already running…', ok: true });
        // We don't know which type is running on page load, so leave activeScanType null
        // — both buttons will be disabled anyway since scanning=true
        startPolling();
      }
    }).catch(() => { });
  }, [itemId, startPolling]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => { if (itemId) fetchOwners(); }, [itemId, fetchOwners]);
  useEffect(() => { if (item?.name) document.title = `${item.name} | Azurewrath`; }, [item]);

  useEffect(() => {
    if (!item) return;
    const user = getUserSession();
    if (!user) return;
    axios.get(`/api/items/${itemId}/watchlist?userId=${user.robloxUserId}`)
      .then(res => setIsWatchlisted(res.data.isWatchlisted)).catch(() => { });
  }, [item, itemId]);

  useEffect(() => {
    const user = getUserSession();
    if (!user) return;
    axios.get(`/api/user/role?userId=${user.robloxUserId}`)
      .then(res => setUserRole(res.data.role ?? 'user')).catch(() => { });
  }, []);

  useEffect(() => { setOwnerPage(1); }, [ownerSort, ownerPageSize]);

  // ── Actions ────────────────────────────────────────────────────────────

  const handleWatchlistToggle = async () => {
    const user = getUserSession();
    if (!user) { router.push('/verify'); return; }
    setWatchlistLoading(true);
    try {
      if (isWatchlisted) {
        await axios.delete(`/api/items/${itemId}/watchlist`, { data: { userId: user.robloxUserId } });
        setIsWatchlisted(false);
      } else {
        await axios.post(`/api/items/${itemId}/watchlist`, { userId: user.robloxUserId });
        setIsWatchlisted(true);
      }
    } catch (err: any) { alert(err.response?.data?.error || 'Failed to update watchlist'); }
    finally { setWatchlistLoading(false); }
  };

  const handleManipulatedToggle = async () => {
    const user = getUserSession();
    if (!user || !item) return;
    setManipulatedLoading(true);
    try {
      const res = await axios.patch(`/api/items/${itemId}/manipulated`, {
        userId: user.robloxUserId,
        assetId: item.assetId,
      });
      setItem(prev => prev ? { ...prev, manipulated: res.data.manipulated } : prev);
    } catch (err: any) { alert(err.response?.data?.error || 'Failed to toggle manipulated'); }
    finally { setManipulatedLoading(false); }
  };

  // ── Derived ────────────────────────────────────────────────────────────

  const canToggleManipulated = hasRole(userRole, 'mod');
  const isAdmin = hasRole(userRole, 'admin');
  const { scanning, stopRequested, progress } = scanState;

  const sortedOwners = [...owners].sort((a, b) => {
    if (ownerSort === 'serial') {
      if (a.serialNumber === null && b.serialNumber === null) return 0;
      if (a.serialNumber === null) return 1;
      if (b.serialNumber === null) return -1;
      return a.serialNumber - b.serialNumber;
    }
    if (ownerSort === 'username') return a.username.localeCompare(b.username);
    return new Date(b.uaidUpdatedAt ?? b.scannedAt).getTime() - new Date(a.uaidUpdatedAt ?? a.scannedAt).getTime();
  });

  const ownerTotalPages = Math.max(1, Math.ceil(sortedOwners.length / ownerPageSize));
  const pagedOwners = sortedOwners.slice((ownerPage - 1) * ownerPageSize, ownerPage * ownerPageSize);

  // Progress bar: only show percentage when total is known and > 0
  const hasKnownTotal = progress && progress.total > 0;
  const progressPct = hasKnownTotal ? Math.round((progress!.processed / progress!.total) * 100) : null;
  const elapsed = progress ? Math.round((Date.now() - progress.startedAt) / 1000) : 0;
  const rate = elapsed > 0 && progress ? progress.processed / elapsed : 0;
  const etaSec = rate > 0 && progress && hasKnownTotal
    ? Math.round((progress.total - progress.processed) / rate)
    : null;

  const chartData = [...(item?.priceHistory ?? [])]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(ph => ({ ts: new Date(ph.timestamp).getTime(), price: ph.price, rap: ph.rap ?? null }));

  const priceMax = chartData.length ? Math.max(...chartData.map(d => Math.max(d.price || 0, d.rap || 0))) : 0;
  const yNice = niceMax(priceMax);
  const yTicks = buildTicks(yNice);

  const tsArr = chartData.map(d => d.ts);
  const xTicks = (() => {
    if (tsArr.length <= 6) return tsArr;
    const min = tsArr[0], max = tsArr[tsArr.length - 1];
    const step = (max - min) / 5;
    return Array.from({ length: 6 }, (_, i) => Math.round(min + i * step));
  })();

  const formatXTick = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formatTooltipLabel = (ts: number) => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

  const displayImageUrl = item?.imageUrl ?? `https://www.roblox.com/asset-thumbnail/image?assetId=${item?.assetId}&width=420&height=420&format=Webp`;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white px-6 py-10 pt-28 -mt-20 ">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Back */}
        <button onClick={() => router.push('/search')} className="flex items-center gap-2 text-purple-400 hover:text-purple-300 transition text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Search
        </button>

        {/* ── Header card ────────────────────────────────────────────── */}
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
          <div className="flex items-start gap-5">
            <div className="w-28 h-28 bg-slate-700/60 rounded-xl overflow-hidden flex-shrink-0">
              <img src={displayImageUrl} alt={item.name} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <h1 className="text-2xl font-bold text-white leading-tight">{item.name}</h1>
                {canToggleManipulated ? (
                  <button onClick={handleManipulatedToggle} disabled={manipulatedLoading} title={item.manipulated ? 'Unmark as manipulated' : 'Mark as manipulated'} className="hover:opacity-80 transition disabled:opacity-40">
                    <img src="/Images/manipulated1.webp" alt="manipulated" className={`w-5 h-5 ${item.manipulated ? 'opacity-100' : 'opacity-20'}`} />
                  </button>
                ) : item.manipulated ? (
                  <span className="flex items-center gap-1 text-red-400 text-xs font-bold">
                    <img src="/Images/manipulated1.webp" alt="" className="w-4 h-4" /> Manipulated
                  </span>
                ) : null}
              </div>

              <p className="text-slate-500 text-xs font-mono mb-3">ID: {item.assetId}</p>

              <div className="flex gap-5 flex-wrap mb-4">
                <div>
                  <p className="text-slate-400 text-[11px] uppercase tracking-wider mb-0.5">Best Price</p>
                  <p className="text-blue-400 font-bold text-lg leading-none">
                    {item.currentPrice === -1
                      ? <span className="text-slate-500 text-sm">No Sellers</span>
                      : item.currentPrice != null ? `${fmt(item.currentPrice)} R$` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-[11px] uppercase tracking-wider mb-0.5">RAP</p>
                  <p className="text-green-400 font-bold text-lg leading-none">{item.currentRap != null ? `${fmt(item.currentRap)} R$` : '—'}</p>
                </div>
                {item.currentPrice && item.currentRap && item.currentPrice > 0 && item.currentPrice < item.currentRap && (
                  <div>
                    <p className="text-slate-400 text-[11px] uppercase tracking-wider mb-0.5">Deal</p>
                    <p className="text-purple-400 font-bold text-lg leading-none">{Math.round(((item.currentRap - item.currentPrice) / item.currentRap) * 100)}% off RAP</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => router.push(`/itemsales/${item.assetId}`)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30 transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  Sales History
                </button>
                <button onClick={handleWatchlistToggle} disabled={watchlistLoading} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-50 ${isWatchlisted ? 'bg-purple-600/30 border-purple-500/40 text-purple-300 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300' : 'bg-blue-600/10 border-blue-500/20 text-blue-300 hover:bg-blue-600/20 hover:border-blue-400/40'}`}>
                  {watchlistLoading
                    ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    : <img src="/Images/watchlist.webp" alt="" className={`w-3.5 h-3.5 ${isWatchlisted ? '' : 'opacity-60'}`} />}
                  {isWatchlisted ? 'Watchlisted' : 'Add to Watchlist'}
                </button>
                <a href={`https://www.roblox.com/catalog/${item.assetId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition">
                  View on Roblox ↗
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── Price chart ─────────────────────────────────────────────── */}
        {chartData.length > 1 && (
          <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
            <h2 className="text-base font-semibold text-white mb-5">Price History</h2>
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  ticks={xTicks}
                  tickFormatter={formatXTick}
                  stroke="#475569"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis ticks={yTicks} domain={[0, yNice]} tickFormatter={fmtY} stroke="#475569" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #7c3aed', borderRadius: '8px', fontSize: 12 }}
                  labelFormatter={formatTooltipLabel}
                  formatter={(value: number, name: string) => [`${fmt(value)} R$`, name === 'rap' ? 'RAP' : 'Price']}
                />
                {!hiddenLines.has('rap') && <Line type="linear" dataKey="rap" stroke="#34d399" strokeWidth={2} dot={false} name="rap" connectNulls={false} />}
                {!hiddenLines.has('price') && <Line type="linear" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} name="price" connectNulls={false} />}
              </LineChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-5 pt-3 mt-1 border-t border-slate-700/50">
              {legendItems.map(li => (
                <button key={li.dataKey} onClick={() => setHiddenLines(prev => { const next = new Set(prev); next.has(li.dataKey) ? next.delete(li.dataKey) : next.add(li.dataKey); return next; })}
                  className={`flex items-center gap-2 px-3 py-1 rounded-lg transition text-sm ${hiddenLines.has(li.dataKey) ? 'opacity-30 hover:opacity-60' : 'hover:opacity-80'}`}>
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: li.color }} />
                  <span className="text-slate-300">{li.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Market trends ───────────────────────────────────────────── */}
        {item.marketTrends && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Trend', value: item.marketTrends.trend, color: 'text-blue-400' },
              { label: 'Volatility', value: `${(item.marketTrends.volatility * 100).toFixed(1)}%`, color: 'text-purple-400' },
              { label: 'Demand', value: `${item.marketTrends.estimatedDemand}/10`, color: 'text-pink-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-800 rounded-2xl border border-purple-500/20 p-5">
                <p className="text-slate-400 text-[11px] uppercase tracking-wider mb-1">{label}</p>
                <p className={`${color} font-bold text-lg capitalize`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Owners / Hoards ──────────────────────────────────────────── */}
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-slate-700">
            {([
              { key: 'owners', label: 'Owners', badge: owners.length, accent: 'border-purple-500' },
              { key: 'hoards', label: 'Hoards', badge: null, accent: 'border-blue-500' },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeTab === tab.key ? `${tab.accent} text-white` : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}>
                {tab.label}
                {tab.badge !== null && !ownersLoading && (
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-700 text-slate-500'}`}>
                    {tab.badge.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Owners ────────────────────────────────────────────────── */}
          {activeTab === 'owners' && (
            <>
              {/* Controls bar */}
              <div className="px-5 py-3 border-b border-slate-700 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-slate-400 text-sm">
                    {scanning && progress
                      ? progress.total > 0
                        ? `Scanning… ${progress.processed}/${progress.total}`
                        : `Scanning… page ${progress.pagesFound ?? '?'}`
                      : `${owners.length.toLocaleString()} tracked owners`}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select value={ownerSort} onChange={e => setOwnerSort(e.target.value as any)}
                      className="bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg border border-slate-600 focus:border-purple-500/60 outline-none">
                      <option value="serial">Serial #</option>
                      <option value="username">Username A–Z</option>
                      <option value="recent">Acquired At</option>
                    </select>

                    <div className="flex items-center bg-slate-700/60 rounded-lg border border-slate-600 p-0.5">
                      {([10, 25, 50, 100] as const).map(n => (
                        <button key={n} onClick={() => setOwnerPageSize(n)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${ownerPageSize === n ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                          {n}
                        </button>
                      ))}
                    </div>

                    {isAdmin && (
                      <>
                        {/* Update Timestamps button */}
                        <button
                          onClick={handleScanOwners}
                          disabled={scanning || scanStarting}
                          className="flex items-center gap-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                        >
                          {scanning && activeScanType === 'timestamps'
                            ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Scanning…</>
                            : scanStarting && activeScanType === 'timestamps'
                            ? 'Starting…'
                            : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Update Timestamps</>}
                        </button>

                        {/* Full Scan button */}
                        <button
                          onClick={handleFullScan}
                          disabled={scanning || scanStarting}
                          className="flex items-center gap-1.5 bg-gradient-to-r from-orange-500 to-red-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                        >
                          {scanning && activeScanType === 'full'
                            ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Scanning…</>
                            : scanStarting && activeScanType === 'full'
                            ? 'Starting…'
                            : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Full Scan</>}
                        </button>

                        {scanning && !stopRequested && (
                          <button onClick={handleStopScan} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-red-900/30 border border-red-500/30 text-red-300 hover:bg-red-900/50 transition">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>Stop
                          </button>
                        )}
                        {stopRequested && <span className="text-yellow-400 text-xs">Stopping…</span>}
                      </>
                    )}
                  </div>
                </div>

                {/* Progress bar — only shown while scanning */}
                {scanning && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>
                        {progress
                          ? progress.total > 0
                            ? `${progress.processed}/${progress.total}${progress.failed > 0 ? ` · ${progress.failed} failed` : ''}`
                            : progress.pagesFound
                            ? `${progress.pagesFound} pages scanned…`
                            : 'Starting…'
                          : 'Starting…'}
                      </span>
                      <span className="flex gap-3">
                        {etaSec !== null && etaSec > 0 && <span>~{fmtEta(etaSec)} left</span>}
                        {progressPct !== null && (
                          <span className="text-purple-400 font-bold">{progressPct}%</span>
                        )}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      {progressPct !== null ? (
                        /* Known progress — solid fill */
                        <div
                          className="bg-gradient-to-r from-orange-500 to-red-500 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      ) : (
                        /* Unknown progress — indeterminate sliding animation */
                        <div className="h-1.5 rounded-full relative overflow-hidden bg-slate-700">
                          <div
                            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-orange-500 to-red-500 rounded-full"
                            style={{ animation: 'slide 1.5s ease-in-out infinite' }}
                          />
                          <style>{`
                            @keyframes slide {
                              0%   { left: -33%; }
                              100% { left: 100%; }
                            }
                          `}</style>
                        </div>
                      )}
                    </div>
                    {progress?.currentUser && (
                      <p className="text-slate-500 text-xs truncate">
                        Scanning: <span className="text-slate-300">{progress.currentUser}</span>
                      </p>
                    )}
                  </div>
                )}

                {scanMessage && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${scanMessage.ok ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {scanMessage.text}
                  </div>
                )}
              </div>

              {/* Table body */}
              {ownersLoading ? (
                <div className="py-14 text-center">
                  <div className="w-7 h-7 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Loading owners…</p>
                </div>
              ) : sortedOwners.length === 0 ? (
                <div className="py-14 text-center">
                  <div className="text-3xl mb-3">👤</div>
                  <p className="text-slate-400 text-sm">No tracked owners found.</p>
                  {isAdmin && <p className="text-slate-500 text-xs mt-1">Click "Full Scan" to index all owners, or "Update Timestamps" to refresh existing ones.</p>}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-700/30 border-b border-slate-700">
                        <tr><Th>Player</Th><Th>Serial</Th><Th>UAID</Th><Th>Acquired At</Th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {pagedOwners.map(owner => {
                          const tier = getGhostTier(item.isLimitedUnique, owner.serialNumber)
                            ?? getSerialTier(owner.serialNumber);
                          return (
                            <tr key={owner.userAssetId} className="hover:bg-slate-700/20 transition-colors">
                              <td className="px-5 py-3.5">
                                <a href={`/player/${owner.robloxUserId}`} className="flex items-center gap-3 group">
                                  {owner.avatarUrl
                                    ? <img src={owner.avatarUrl} alt={owner.username} className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-2 ring-purple-500/50" />
                                    : <div className="w-9 h-9 rounded-full bg-purple-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ring-2 ring-purple-500/50">{owner.username[0]?.toUpperCase()}</div>}
                                  <div>
                                    <p className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors leading-tight">{owner.displayName}</p>
                                    {owner.displayName !== owner.username && <p className="text-slate-500 text-xs">@{owner.username}</p>}
                                  </div>
                                </a>
                              </td>
                              <td className="px-5 py-3.5">
                                {tier === 'ghost' ? (
                                  <SpecialSerialText serial={null} tier="ghost" variant="badge" />
                                ) : owner.serialNumber !== null ? (
                                  tier
                                    ? <SpecialSerialText serial={owner.serialNumber} tier={tier} variant="badge" />
                                    : <span className="text-orange-400 font-bold text-sm">#{owner.serialNumber}</span>
                                ) : (
                                  <span className="text-slate-600">—</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                <a href={`/uaid/${owner.userAssetId}`} className="font-mono text-purple-300 text-xs bg-slate-700/50 px-2 py-1 rounded border border-purple-500/20 hover:border-purple-400/50 transition-colors">
                                  {owner.userAssetId}
                                </a>
                              </td>
                              <td className="px-5 py-3.5">
                                <AcquiredCell uaidUpdatedAt={owner.uaidUpdatedAt} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-5 py-3 border-t border-slate-700/60">
                    <Pagination
                      page={ownerPage}
                      totalPages={ownerTotalPages}
                      totalItems={sortedOwners.length}
                      pageSize={ownerPageSize}
                      onPageChange={setOwnerPage}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Hoards ────────────────────────────────────────────────── */}
          {activeTab === 'hoards' && <HoardsSection itemId={itemId} embedded />}
        </div>

      </div>
    </div>
  );
}