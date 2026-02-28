// app/item/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getUserSession } from '@/lib/userSession';
import { getSerialTier } from '@/lib/specialSerial';
import { SpecialSerialText } from '@/components/specialSerialText';
import HoardsSection from '@/components/HoardsSection';

interface PricePoint {
  id: string;
  price: number;
  rap?: number;
  lowestResale?: number;
  salesVolume?: number;
  timestamp: string;
}

interface ItemDetail {
  assetId: string;
  name: string;
  imageUrl?: string;
  description?: string;
  manipulated: boolean;
  currentPrice?: number;
  currentRap?: number;
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
}

interface ScanProgress {
  total: number;
  processed: number;
  failed: number;
  currentUser: string | null;
  startedAt: number;
}

interface ScanState {
  scanning: boolean;
  stopRequested: boolean;
  progress: ScanProgress | null;
}

function fmt(n: number) {
  return n.toLocaleString();
}

export default function ItemPage() {
  const params = useParams();
  const router = useRouter();
  const itemId = params.id as string;

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const [userRole, setUserRole] = useState<string>('user');
  const [manipulatedLoading, setManipulatedLoading] = useState(false);

  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(true);
  const [ownerSort, setOwnerSort] = useState<'serial' | 'username' | 'recent'>('serial');
  const [scanMessage, setScanMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [scanState, setScanState] = useState<ScanState>({
    scanning: false,
    stopRequested: false,
    progress: null,
  });
  const [scanStarting, setScanStarting] = useState(false);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const legendItems = [
    { dataKey: 'rap', name: 'RAP', color: '#34d399' },
    { dataKey: 'price', name: 'Price', color: '#3b82f6' },
  ];

  const toggleLine = (dataKey: string) => {
    setHiddenLines(prev => {
      const next = new Set(prev);
      next.has(dataKey) ? next.delete(dataKey) : next.add(dataKey);
      return next;
    });
  };

  const fetchOwners = async () => {
    try {
      const res = await axios.get(`/api/items/${itemId}/owners`);
      setOwners(res.data.owners || []);
    } catch {
      setOwners([]);
    } finally {
      setOwnersLoading(false);
    }
  };

  const startPolling = () => {
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
          await fetchOwners();
        }
      } catch {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setScanState(prev => ({ ...prev, scanning: false }));
      }
    }, 2000);
  };

  const handleScanOwners = async () => {
    const user = getUserSession();
    if (!user) return;
    setScanMessage(null);
    setScanStarting(true);
    try {
      const res = await axios.post(`/api/items/${itemId}/scan-owners`, {
        userId: user.robloxUserId,
      });
      setScanState({ scanning: true, stopRequested: false, progress: null });
      setScanMessage({ text: `🔄 ${res.data.message}`, ok: true });
      startPolling();
    } catch (err: any) {
      setScanMessage({ text: `❌ ${err.response?.data?.error || 'Scan failed'}`, ok: false });
    } finally {
      setScanStarting(false);
    }
  };

  const handleStopScan = async () => {
    const user = getUserSession();
    if (!user) return;
    try {
      await axios.post(`/api/items/${itemId}/scan-owners`, {
        userId: user.robloxUserId,
        action: 'stop',
      });
      setScanState(prev => ({ ...prev, stopRequested: true }));
      setScanMessage({ text: '🛑 Stop requested — finishing current user then halting...', ok: true });
    } catch {
      setScanMessage({ text: '❌ Failed to send stop request', ok: false });
    }
  };

  // Check on mount if a scan is already running
  useEffect(() => {
    if (!itemId) return;
    axios.get(`/api/items/${itemId}/scan-owners`).then(res => {
      const data: ScanState = res.data;
      setScanState(data);
      if (data.scanning) {
        setScanMessage({ text: '🔄 A scan is already running for this item...', ok: true });
        startPolling();
      }
    }).catch(() => {});
  }, [itemId]);

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Fetch item
  useEffect(() => {
    if (!itemId) return;
    axios.get(`/api/items/${itemId}`)
      .then(res => setItem(res.data))
      .catch(() => setError('Failed to load item details'))
      .finally(() => setLoading(false));
  }, [itemId]);

  // Fetch owners
  useEffect(() => {
    if (!itemId) return;
    fetchOwners();
  }, [itemId]);

  // Page title
  useEffect(() => {
    if (item?.name) document.title = `${item.name} | Limited Item - Azurewrath`;
  }, [item]);

  // Watchlist status
  useEffect(() => {
    if (!item) return;
    const user = getUserSession();
    if (!user) return;
    axios.get(`/api/items/${itemId}/watchlist?userId=${user.robloxUserId}`)
      .then(res => setIsWatchlisted(res.data.isWatchlisted))
      .catch(() => {});
  }, [item, itemId]);

  // User role
  useEffect(() => {
    const user = getUserSession();
    if (!user) return;
    axios.get(`/api/user/role?userId=${user.robloxUserId}`)
      .then(res => setUserRole(res.data.role ?? 'user'))
      .catch(() => {});
  }, []);

  const handleWatchlistToggle = async () => {
    const user = getUserSession();
    if (!user) { alert('Please log in to add items to your watchlist'); router.push('/'); return; }
    setWatchlistLoading(true);
    try {
      if (isWatchlisted) {
        await axios.delete(`/api/items/${itemId}/watchlist`, { data: { userId: user.robloxUserId } });
        setIsWatchlisted(false);
      } else {
        await axios.post(`/api/items/${itemId}/watchlist`, { userId: user.robloxUserId });
        setIsWatchlisted(true);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update watchlist');
    } finally {
      setWatchlistLoading(false);
    }
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
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to toggle manipulated');
    } finally {
      setManipulatedLoading(false);
    }
  };

  const canToggleManipulated = ['admin', 'moderator'].includes(userRole);
  const isAdmin = userRole === 'admin';
  const { scanning, stopRequested, progress } = scanState;

  const sortedOwners = [...owners].sort((a, b) => {
    if (ownerSort === 'serial') {
      if (a.serialNumber === null && b.serialNumber === null) return 0;
      if (a.serialNumber === null) return 1;
      if (b.serialNumber === null) return -1;
      return a.serialNumber - b.serialNumber;
    }
    if (ownerSort === 'username') return a.username.localeCompare(b.username);
    if (ownerSort === 'recent') return new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime();
    return 0;
  });

  if (loading) {
    return (
      <div className="min-h-screen w-full text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-slate-400">Loading item details...</p>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen w-full text-white flex items-center justify-center">
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-red-400 mb-4">Oops!</h1>
          <p className="text-slate-400">{error || 'Item not found'}</p>
        </div>
      </div>
    );
  }

  const chartData = [...item.priceHistory]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(ph => ({
      timestamp: new Date(ph.timestamp).toLocaleString(undefined, {
        month: 'numeric', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      }),
      price: ph.price,
      rap: ph.rap,
    }));

  const displayImageUrl =
    item.imageUrl ??
    `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=420&height=420&format=png`;

  const yMax = Math.max(...chartData.map(d => Math.max(d.price || 0, d.rap || 0)));
  const targetCeiling = yMax * 1.2;
  const magnitude = Math.pow(10, Math.floor(Math.log10(targetCeiling)));
  const niceNumbers = [1, 2, 4, 5, 8, 10];
  const closestNice = niceNumbers.reduce((best, n) =>
    Math.abs(n - targetCeiling / magnitude) < Math.abs(best - targetCeiling / magnitude) ? n : best
  );
  const ceiling = closestNice * magnitude;
  const inc = ceiling / 4;
  const yTicks = [0, inc, inc * 2, inc * 3, ceiling];

  const formatY = (v: number) => {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return v.toString();
  };

  const progressPct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;

  const elapsedSec = progress ? Math.round((Date.now() - progress.startedAt) / 1000) : 0;
  const rate = elapsedSec > 0 && progress ? progress.processed / elapsedSec : 0;
  const etaSec = rate > 0 && progress ? Math.round((progress.total - progress.processed) / rate) : null;
  const fmtEta = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white p-32 -mt-20">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Back */}
        <button
          onClick={() => router.push('/search')}
          className="text-purple-400 hover:text-purple-300 transition flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>

        {/* Header */}
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
          <div className="flex items-start gap-6">
            <div className="w-32 h-32 bg-slate-700/50 rounded-lg overflow-hidden flex-shrink-0">
              <img src={displayImageUrl} alt={item.name} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-3xl font-bold text-white">{item.name}</h1>
                {canToggleManipulated ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleManipulatedToggle}
                      disabled={manipulatedLoading}
                      className="hover:opacity-80 transition"
                      title={item.manipulated ? 'Mark as not manipulated' : 'Mark as manipulated'}
                    >
                      <img
                        src={item.manipulated ? '/Images/manipulated1.png' : '/Images/manipulated0.png'}
                        alt="Toggle Manipulated"
                        className="w-8 h-8"
                      />
                    </button>
                    {item.manipulated && <span className="text-red-400 text-sm font-bold">Manipulated</span>}
                  </div>
                ) : item.manipulated ? (
                  <div className="flex items-center gap-1.5">
                    <img src="/Images/manipulated1.png" alt="Manipulated" className="w-8 h-8" />
                    <span className="text-red-400 text-sm font-bold">Manipulated</span>
                  </div>
                ) : null}
              </div>
              <p className="text-slate-500 text-xs mt-2 font-mono">Asset ID: {item.assetId}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">Best Price</div>
            <div className="text-blue-400 text-3xl font-bold">
              {item.currentPrice === -1 ? 'No Sellers' : item.currentPrice != null ? fmt(item.currentPrice) + ' R$' : 'N/A'}
            </div>
          </div>
          <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">Current RAP</div>
            <div className="text-green-400 text-3xl font-bold">
              {item.currentRap != null ? fmt(item.currentRap) : 'N/A'} R$
            </div>
          </div>
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <>
            <h2 className="text-2xl font-bold text-white">Price History</h2>
            <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
              <ResponsiveContainer width="100%" height={450}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="timestamp"
                    stroke="#94a3b8"
                    height={50}
                    interval={Math.floor(chartData.length / 6)}
                    tick={({ x, y, payload }: any) => {
                      const parts = (payload.value as string).split(', ');
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text x={0} y={0} dy={12} textAnchor="middle" fill="#94a3b8" fontSize={11}>{parts[0]}</text>
                          <text x={0} y={0} dy={26} textAnchor="middle" fill="#64748b" fontSize={10}>{parts[1]}</text>
                        </g>
                      );
                    }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    width={25}
                    tickFormatter={formatY}
                    domain={[0, ceiling]}
                    ticks={yTicks}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #a855f7', borderRadius: '8px' }}
                    labelStyle={{ color: '#fff', marginBottom: 4, fontSize: 12, fontWeight: 'bold' }}
                    formatter={(value: number, name: string) => [
                      <span style={{ fontWeight: 700 }}>{fmt(value)}</span>,
                      name === 'rap' ? 'RAP' : 'Price'
                    ]}
                  />
                  {!hiddenLines.has('rap') && (
                    <Line type="monotone" dataKey="rap" stroke="#34d399" strokeWidth={2} dot={false} name="rap" />
                  )}
                  {!hiddenLines.has('price') && (
                    <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} name="price" />
                  )}
                </LineChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 pt-2">
                {legendItems.map(li => (
                  <button
                    key={li.dataKey}
                    onClick={() => toggleLine(li.dataKey)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${hiddenLines.has(li.dataKey) ? 'opacity-40 hover:opacity-60' : 'hover:opacity-80'}`}
                  >
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: li.color }} />
                    <span className="text-sm text-slate-300">{li.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Market Trends */}
        {item.marketTrends && (
          <div className="grid grid-cols-3 gap-6">
            <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
              <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">Trend</div>
              <div className="text-blue-400 text-xl font-bold capitalize">{item.marketTrends.trend}</div>
            </div>
            <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
              <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">Volatility</div>
              <div className="text-purple-400 text-xl font-bold">{(item.marketTrends.volatility * 100).toFixed(1)}%</div>
            </div>
            <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
              <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">Demand</div>
              <div className="text-pink-400 text-xl font-bold">{item.marketTrends.estimatedDemand}/10</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={() => router.push(`/item/${item.assetId}/sales`)}
            className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition"
          >
            View Sales History 📊
          </button>
          <button
            onClick={handleWatchlistToggle}
            disabled={watchlistLoading}
            className={`flex-1 px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition ${isWatchlisted ? 'bg-gradient-to-r from-red-500 to-pink-600' : 'bg-gradient-to-r from-blue-500 to-purple-600'}`}
          >
            {watchlistLoading ? '...' : isWatchlisted ? 'Remove from Watchlist ❌' : 'Add to Watchlist 👁️'}
          </button>
          <a
            href={`https://www.roblox.com/catalog/${item.assetId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition text-center"
          >
            View on Roblox 🔗
          </a>
        </div>

        {/* ── Owners List ─────────────────────────────────────────── */}
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-700">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Known Owners
                  {!ownersLoading && (
                    <span className="text-slate-400 text-sm font-normal">
                      ({owners.length.toLocaleString()} tracked
                      {scanning && progress ? ` · ${progress.processed}/${progress.total} scanned` : ''})
                    </span>
                  )}
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  {scanning
                    ? 'Scanning inventories in the background — owners appear as each scan completes'
                    : 'Players currently holding this item in their latest scanned inventory'
                  }
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={ownerSort}
                  onChange={e => setOwnerSort(e.target.value as any)}
                  className="bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg border border-purple-500/20 focus:border-purple-500/50 outline-none"
                >
                  <option value="serial">Serial ↑</option>
                  <option value="username">Username A–Z</option>
                  <option value="recent">Recently Scanned</option>
                </select>

                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleScanOwners}
                      disabled={scanning}
                      className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-1.5 rounded-lg transition"
                      title="Fetch all owners from Roblox and scan their full inventories"
                    >
                      {scanning ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Scanning...
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Scan All Owners
                        </>
                      )}
                    </button>

                    {scanning && !stopRequested && (
                      <button
                        onClick={handleStopScan}
                        className="flex items-center gap-1.5 bg-slate-700 hover:bg-red-600/80 border border-red-500/40 hover:border-red-500 text-red-400 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                        title="Stop after current user completes"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <rect x="6" y="6" width="12" height="12" rx="1" />
                        </svg>
                        Stop
                      </button>
                    )}

                    {stopRequested && (
                      <span className="text-yellow-400 text-xs py-1.5 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/>
                        </svg>
                        Stopping...
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {scanning && progress && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span>
                    {progress.processed} / {progress.total} owners
                    {progress.failed > 0 && (
                      <span className="text-red-400 ml-2">· {progress.failed} failed</span>
                    )}
                  </span>
                  <span className="flex items-center gap-3">
                    {etaSec !== null && etaSec > 0 && (
                      <span className="text-slate-500">~{fmtEta(etaSec)} left</span>
                    )}
                    <span className="text-purple-400 font-bold">{progressPct}%</span>
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-orange-500 to-red-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {progress.currentUser && (
                  <div className="text-slate-500 text-xs truncate">
                    Scanning: <span className="text-slate-300">{progress.currentUser}</span>
                  </div>
                )}
              </div>
            )}

            {scanMessage && (
              <div className={`mt-3 text-sm px-3 py-2 rounded-lg ${
                scanMessage.ok
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {scanMessage.text}
              </div>
            )}
          </div>

          {ownersLoading ? (
            <div className="px-6 py-12 text-center">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Loading owners...</p>
            </div>
          ) : sortedOwners.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="text-4xl mb-3">👤</div>
              <p className="text-slate-400">No tracked owners found for this item.</p>
              <p className="text-slate-500 text-sm mt-1">
                {isAdmin
                  ? 'Click "Scan All Owners" above to fetch and scan every owner\'s inventory.'
                  : "Owners appear once a player's inventory has been scanned."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/30">
                  <tr className="border-b border-slate-700">
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">Player</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">Serial</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">UAID</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {sortedOwners.map(owner => {
                    const tier = getSerialTier(owner.serialNumber);
                    return (
                      <tr key={owner.userAssetId} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-6 py-4">
                          <a href={`/player/${owner.robloxUserId}`} className="flex items-center gap-3 group">
                            {owner.avatarUrl ? (
                              <img src={owner.avatarUrl} alt={owner.username} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                                {owner.username[0]?.toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="text-white font-semibold group-hover:text-purple-400 transition-colors">
                                {owner.displayName}
                              </div>
                              {owner.displayName !== owner.username && (
                                <div className="text-slate-500 text-xs">@{owner.username}</div>
                              )}
                            </div>
                          </a>
                        </td>
                        <td className="px-6 py-4">
                          {owner.serialNumber !== null ? (
                            tier
                              ? <SpecialSerialText serial={owner.serialNumber} tier={tier} variant="badge" />
                              : <span className="text-orange-400 font-bold text-sm">#{owner.serialNumber.toLocaleString()}</span>
                          ) : (
                            <span className="text-slate-500 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <a
                            href={`/uaid/${owner.userAssetId}`}
                            className="font-mono text-purple-300 text-xs bg-slate-700/50 px-2 py-1 rounded border border-purple-500/20 hover:border-purple-400/50 transition-colors"
                          >
                            {owner.userAssetId}
                          </a>
                        </td>
                        <td className="px-6 py-4 text-slate-400 text-sm">
                          {new Date(owner.scannedAt).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Hoards ──────────────────────────────────────────────── */}
        <HoardsSection itemId={itemId} />

      </div>
    </div>
  );
}