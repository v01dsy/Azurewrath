// app/item/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getUserSession } from '@/lib/userSession';

interface ItemDetail {
  id: string;
  assetId: string;
  name: string;
  imageUrl?: string;
  description?: string;
  currentPrice?: number;
  currentRap?: number;
  priceHistory: Array<{
    id: string;
    price: number;
    rap?: number;
    lowestResale?: number;
    salesVolume?: number;
    timestamp: string;
  }>;
  marketTrends?: {
    id: string;
    trend: string;
    priceDirection: string;
    volatility: number;
    estimatedDemand: number;
  };
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

  const handleLegendClick = (dataKey: string) => {
    setHiddenLines(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dataKey)) {
        newSet.delete(dataKey);
      } else {
        newSet.add(dataKey);
      }
      return newSet;
    });
  };

  const legendItems = [
    { dataKey: 'rap', name: 'RAP', color: '#34d399' },
    { dataKey: 'price', name: 'Price', color: '#3b82f6' },
  ];

  useEffect(() => {
    const fetchItem = async () => {
      try {
        const response = await axios.get(`/api/items/${itemId}`);
        setItem(response.data);
      } catch (err) {
        setError('Failed to load item details');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (itemId) fetchItem();
  }, [itemId]);

  useEffect(() => {
    if (item?.name) {
      document.title = `${item.name} | Limited Item - Azurewrath`;
    }
  }, [item]);

  useEffect(() => {
    const checkWatchlist = async () => {
      const user = getUserSession();
      if (!user || !item) return;
      try {
        const response = await axios.get(`/api/items/${itemId}/watchlist?userId=${user.robloxUserId}`);
        setIsWatchlisted(response.data.isWatchlisted);
      } catch (err) {
        console.error('Failed to check watchlist status:', err);
      }
    };
    checkWatchlist();
  }, [item, itemId]);

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
      console.error('Watchlist error:', err);
      alert(err.response?.data?.error || 'Failed to update watchlist');
    } finally {
      setWatchlistLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white flex items-center justify-center -mt-20">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-slate-400">Loading item details...</p>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white flex items-center justify-center -mt-20">
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-red-400 mb-4">Oops!</h1>
          <p className="text-slate-400">{error || 'Item not found'}</p>
        </div>
      </div>
    );
  }

  const chartData = item.priceHistory
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

  const currentPrice = item.currentPrice;
  const currentRAP = item.currentRap;

  const displayImageUrl = item.imageUrl
    ?? `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=420&height=420&format=png`;

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white p-32 -mt-20">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Back Button */}
        <button
          onClick={() => router.push('/search')}
          className="text-purple-400 hover:text-purple-300 transition flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>

        {/* Header Card */}
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
          <div className="flex items-start gap-6">
            <div className="w-32 h-32 bg-slate-700/50 rounded-lg overflow-hidden flex-shrink-0">
              {displayImageUrl && (
                <img src={displayImageUrl} alt={item.name} className="w-full h-full object-cover" />
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white mb-1">{item.name}</h1>
              {item.description && (
                <p className="text-slate-400 text-sm">{item.description}</p>
              )}
              <p className="text-slate-500 text-xs mt-2 font-mono">Asset ID: {item.assetId}</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">Best Price</div>
            <div className="text-blue-400 text-3xl font-bold">
              {currentPrice?.toLocaleString() ?? 'N/A'} R$
            </div>
          </div>
          <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">Current RAP</div>
            <div className="text-green-400 text-3xl font-bold">
              {currentRAP?.toLocaleString() ?? 'N/A'} R$
            </div>
          </div>
        </div>

        {/* Price Chart */}
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
                    tick={({ x, y, payload }) => {
                      const parts = payload.value.split(', ');
                      const date = parts[0];
                      const time = parts[1];
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text x={0} y={0} dy={12} textAnchor="middle" fill="#94a3b8" fontSize={11}>
                            {date}
                          </text>
                          <text x={0} y={0} dy={26} textAnchor="middle" fill="#64748b" fontSize={10}>
                            {time}
                          </text>
                        </g>
                      );
                    }}
                    interval={Math.floor(chartData.length / 6)}
                    height={50}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    width={25}
                    tickFormatter={(value: number) => {
                      if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
                      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
                      if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
                      return value.toString();
                    }}
                    domain={[0, (dataMax: number) => {
                      const targetCeiling = dataMax * 1.2;
                      const magnitude = Math.pow(10, Math.floor(Math.log10(targetCeiling)));
                      const normalized = targetCeiling / magnitude;
                      const niceNumbers = [1, 2, 4, 5, 8, 10];
                      let closestNumber = niceNumbers[0];
                      let closestDiff = Math.abs(normalized - niceNumbers[0]);
                      for (const num of niceNumbers) {
                        const diff = Math.abs(normalized - num);
                        if (diff < closestDiff) {
                          closestDiff = diff;
                          closestNumber = num;
                        }
                      }
                      return closestNumber * magnitude;
                    }]}
                    ticks={(() => {
                      const dataMax = Math.max(...chartData.map(d => Math.max(d.price || 0, d.rap || 0)));
                      const targetCeiling = dataMax * 1.2;
                      const magnitude = Math.pow(10, Math.floor(Math.log10(targetCeiling)));
                      const normalized = targetCeiling / magnitude;
                      const niceNumbers = [1, 2, 4, 5, 8, 10];
                      let closestNumber = niceNumbers[0];
                      let closestDiff = Math.abs(normalized - niceNumbers[0]);
                      for (const num of niceNumbers) {
                        const diff = Math.abs(normalized - num);
                        if (diff < closestDiff) { closestDiff = diff; closestNumber = num; }
                      }
                      const ceiling = closestNumber * magnitude;
                      const increment = ceiling / 4;
                      return [0, increment, increment * 2, increment * 3, ceiling];
                    })()}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #a855f7',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#ffffff', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}
                    formatter={(value: number, name: string) => [
                      <span style={{ fontWeight: 'bold' }}>{value.toLocaleString()}</span>,
                      name === 'rap' ? 'RAP' : 'Price'
                    ]}
                  />
                  {!hiddenLines.has('rap') && (
                    <Line
                      type="monotone"
                      dataKey="rap"
                      stroke="#34d399"
                      strokeWidth={2}
                      dot={false}
                      name="rap"
                    />
                  )}
                  {!hiddenLines.has('price') && (
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      name="price"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
              {/* Clickable Legend */}
              <div className="flex justify-center gap-6 pt-2">
                {legendItems.map((legendItem) => (
                  <button
                    key={legendItem.dataKey}
                    onClick={() => handleLegendClick(legendItem.dataKey)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      hiddenLines.has(legendItem.dataKey)
                        ? 'opacity-40 hover:opacity-60'
                        : 'hover:opacity-80'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: legendItem.color }}
                    />
                    <span className="text-sm text-slate-300">{legendItem.name}</span>
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

        {/* Action Buttons */}
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