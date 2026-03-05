// app/watchlist/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { getUserSession } from '@/lib/userSession';

interface WatchlistItem {
  assetId: string;
  name: string;
  imageUrl?: string | null;
  manipulated: boolean;
  currentPrice?: number | null;
  currentRap?: number | null;
  lastUpdated?: string | null;
  addedAt: string;
}

function PriceBadge({ label, value, color }: { label: string; value?: number | null; color: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
      <span className={`font-bold text-lg ${color}`}>
        {value != null ? `${value.toLocaleString()} R$` : '—'}
      </span>
    </div>
  );
}

function DealBadge({ price, rap }: { price?: number | null; rap?: number | null }) {
  if (!price || !rap || price >= rap) return null;
  const pct = Math.round(((rap - price) / rap) * 100);
  if (pct < 2) return null;
  const color =
    pct >= 20 ? 'bg-green-500/20 text-green-400 border-green-500/40' :
    pct >= 10 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' :
    'bg-blue-500/20 text-blue-400 border-blue-500/40';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${color}`}>
      {pct}% below RAP
    </span>
  );
}

export default function WatchlistPage() {
  const router = useRouter();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const user = typeof window !== 'undefined' ? getUserSession() : null;

  const fetchWatchlist = useCallback(async () => {
    if (!user) return;
    try {
      const res = await axios.get(`/api/user/watchlist?userId=${user.robloxUserId}`);
      setItems(res.data.items);
    } catch {
      setError('Failed to load your watchlist.');
    } finally {
      setLoading(false);
    }
  }, [user?.robloxUserId]);

  useEffect(() => {
    if (!user) { router.push('/verify'); return; }
    fetchWatchlist();
  }, []);

  useEffect(() => { document.title = 'Watchlist | Azurewrath'; }, []);

  const handleRemove = async (assetId: string, name: string) => {
    if (!user) return;
    setRemoving(prev => new Set(prev).add(assetId));
    try {
      await axios.delete(`/api/items/${assetId}/watchlist`, { data: { userId: user.robloxUserId } });
      setItems(prev => prev.filter(i => i.assetId !== assetId));
    } catch {
      alert(`Failed to remove ${name} from watchlist.`);
    } finally {
      setRemoving(prev => { const next = new Set(prev); next.delete(assetId); return next; });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-slate-400">Loading your watchlist...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12 flex items-center justify-center">
        <p className="text-red-400 text-lg">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12 flex items-center justify-center">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold glow-purple">Your Watchlist is Empty</h1>
          <p className="text-slate-400 text-lg max-w-md mx-auto">
            Browse items and click <strong className="text-neon-blue">Add to Watchlist</strong> to track their prices here.
          </p>
          <button
            onClick={() => router.push('/search')}
            className="inline-block bg-gradient-to-r from-neon-blue to-neon-purple px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition"
          >
            Browse Items →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12">
      <div className="max-w-5xl mx-auto space-y-8">

        <div>
          <h1 className="text-4xl font-bold glow-purple">Watchlist</h1>
          <p className="text-slate-400 mt-1">{items.length} item{items.length !== 1 ? 's' : ''} tracked</p>
        </div>

        <div className="space-y-3">
          {items.map((item) => {
            const imgSrc = item.imageUrl ?? `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=150&height=150&format=png`;
            const isRemoving = removing.has(item.assetId);
            return (
              <div
                key={item.assetId}
                className="group flex items-center gap-4 bg-gradient-to-br from-slate-800/60 to-slate-900/40 border border-neon-blue/10 hover:border-neon-blue/30 rounded-xl p-4 transition-all duration-200"
              >
                <div
                  className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-slate-700 cursor-pointer hover:border-neon-blue/50 transition relative"
                  onClick={() => router.push(`/item/${item.assetId}`)}
                >
                  <img
                    src={imgSrc}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/Images/icon.png'; }}
                  />
                  {item.manipulated && (
                    <img src="/Images/manipulated1.png" alt="Manipulated" title="This item's RAP may be manipulated" className="absolute top-0.5 left-0.5 w-5 h-5" />
                  )}
                </div>

                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/item/${item.assetId}`)}>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white truncate group-hover:text-neon-blue transition-colors">{item.name}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500 font-mono">#{item.assetId}</span>
                    <DealBadge price={item.currentPrice} rap={item.currentRap} />
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-6 mr-4">
                  <PriceBadge label="Best Price" value={item.currentPrice} color="text-neon-blue" />
                  <PriceBadge label="RAP" value={item.currentRap} color="text-neon-purple" />
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => router.push(`/item/${item.assetId}`)}
                    className="hidden sm:block text-sm px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition"
                  >
                    View
                  </button>
                  <button
                    onClick={() => handleRemove(item.assetId, item.name)}
                    disabled={isRemoving}
                    title="Remove from watchlist"
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 hover:border-red-500/50 text-red-400 hover:text-red-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isRemoving ? (
                      <span className="animate-spin text-xs">⚙️</span>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}