// app/item/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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

  // Fetch item
  useEffect(() => {
    if (!itemId) return;
    const load = async () => {
      try {
        const res = await axios.get(`/api/items/${itemId}`);
        setItem(res.data);
      } catch {
        setError('Failed to load item details');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [itemId]);

  // Page title
  useEffect(() => {
    if (item?.name) {
      document.title = `${item.name} | Limited Item - Azurewrath`;
    }
  }, [item]);

  // Watchlist status
  useEffect(() => {
    if (!item) return;
    const check = async () => {
      const user = getUserSession();
      if (!user) return;
      try {
        const res = await axios.get(`/api/items/${itemId}/watchlist?userId=${user.robloxUserId}`);
        setIsWatchlisted(res.data.isWatchlisted);
      } catch {}
    };
    check();
  }, [item, itemId]);

  // User role
  useEffect(() => {
    const load = async () => {
      const user = getUserSession();
      if (!user) return;
      try {
        const res = await axios.get(`/api/user/role?userId=${user.robloxUserId}`);
        setUserRole(res.data.role ?? 'user');
      } catch {}
    };
    load();
  }, []);

  const handleWatchlistToggle = async () => {
    const user = getUserSession();
    if (!user) {
      alert('Please log in to add items to your watchlist');
      router.push('/');
      return;
    }
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
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
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
                  /* Admin/mod: only icon is clickable, text is separate */
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
                    {item.manipulated && (
                      <span className="text-red-400 text-sm font-bold">Manipulated</span>
                    )}
                  </div>
                ) : item.manipulated ? (
                  /* Regular user: read-only display */
                  <div className="flex items-center gap-1.5">
                    <img src="/Images/manipulated1.png" alt="Manipulated" className="w-8 h-8" />
                    <span className="text-red-400 text-sm font-bold">Manipulated</span>
                  </div>
                ) : null}

              </div>
              {item.description && (
                <p className="text-slate-400 text-sm">{item.description}</p>
              )}
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
                          <text x={0} y={0} dy={12} textAnchor="middle" fill="#94a3b8" fontSize={11}>
                            {parts[0]}
                          </text>
                          <text x={0} y={0} dy={26} textAnchor="middle" fill="#64748b" fontSize={10}>
                            {parts[1]}
                          </text>
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
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #a855f7',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#fff', marginBottom: 4, fontSize: 12, fontWeight: 'bold' }}
                    formatter={(value: number, name: string) => [fmt(value), name === 'rap' ? 'RAP' : 'Price']}
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
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                      hiddenLines.has(li.dataKey) ? 'opacity-40 hover:opacity-60' : 'hover:opacity-80'
                    }`}
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
              <div className="text-purple-400 text-xl font-bold">
                {(item.marketTrends.volatility * 100).toFixed(1)}%
              </div>
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
            className={`flex-1 px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition ${
              isWatchlisted
                ? 'bg-gradient-to-r from-red-500 to-pink-600'
                : 'bg-gradient-to-r from-blue-500 to-purple-600'
            }`}
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

      </div>
    </div>
  );
}