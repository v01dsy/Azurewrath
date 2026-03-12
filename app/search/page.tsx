'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type Tab = 'limited' | 'player';

interface LimitedResult {
  assetId: string;
  name: string;
  imageUrl: string | null;
  manipulated?: boolean;
  priceHistory?: { rap?: number | null; price?: number | null }[];
}

interface PlayerResult {
  id: string;
  name: string;
  displayName?: string;
  imageUrl?: string;
}

export default function SearchPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('limited');
  const [query, setQuery] = useState('');
  const [limitedResults, setLimitedResults] = useState<LimitedResult[]>([]);
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setLimitedResults([]);
      setPlayerResults([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        if (tab === 'limited') {
          const res = await fetch(`/api/items/search?q=${encodeURIComponent(query)}`);
          const data = await res.json();
          const sorted = (Array.isArray(data) ? data : []).sort((a: LimitedResult, b: LimitedResult) => {
            const rapA = a.priceHistory?.[0]?.rap ?? 0;
            const rapB = b.priceHistory?.[0]?.rap ?? 0;
            return rapB - rapA;
          });
          setLimitedResults(sorted);
        } else {
          const res = await fetch(`/api/players/search?q=${encodeURIComponent(query)}`);
          const data = await res.json();
          setPlayerResults(Array.isArray(data) ? data : []);
        }
      } catch {
        setLimitedResults([]);
        setPlayerResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, tab]);

  useEffect(() => {
    setLimitedResults([]);
    setPlayerResults([]);
    setSearched(false);
  }, [tab]);

  const results = tab === 'limited' ? limitedResults : playerResults;
  const isEmpty = searched && !loading && results.length === 0;

  return (
    <div className="min-h-screen w-full text-white" style={{ background: 'rgba(10,10,10,0.6)', marginTop: '-80px', paddingTop: '104px', paddingBottom: '48px' }}>
      <div className="max-w-5xl mx-auto px-6">

        {/* Search card */}
        <div className="rounded-2xl border border-white/10 bg-[#0d0d0f] overflow-hidden mb-6"
          style={{ boxShadow: '0 2px 24px rgba(0,0,0,0.5)' }}>
          <div className="flex items-stretch border-b border-white/10">
            <div className="px-5 flex items-center flex-shrink-0 border-r border-white/10">
              <h1 className="text-lg font-bold text-white">Search</h1>
            </div>
            <button
              onClick={() => setTab('limited')}
              className={`flex-1 py-3.5 text-sm font-semibold transition border-b-2 ${
                tab === 'limited' ? 'text-purple-300 border-purple-500 bg-purple-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              Limited Search
            </button>
            <button
              onClick={() => setTab('player')}
              className={`flex-1 py-3.5 text-sm font-semibold transition border-b-2 ${
                tab === 'player' ? 'text-blue-300 border-blue-500 bg-blue-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              Player Search
            </button>
          </div>
          <div className="px-4 py-3">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={tab === 'limited' ? 'Search limited items by name or asset ID...' : 'Search players by username...'}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50 transition text-sm"
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {query && !loading && (
                <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition text-sm">✕</button>
              )}
            </div>
          </div>
        </div>

        {/* Result count */}
        {searched && !loading && results.length > 0 && (
          <p className="text-slate-500 text-xs mb-4">
            {results.length} result{results.length !== 1 ? 's' : ''} for <span className="text-slate-300">"{query}"</span>
          </p>
        )}

        {/* Empty hint */}
        {!query && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-slate-600 text-sm">
              {tab === 'limited' ? 'Type a name or paste an asset ID to search' : 'Type a Roblox username to search'}
            </p>
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-slate-400 font-medium mb-1">No results found</p>
            <p className="text-slate-600 text-sm">Try a different search term</p>
          </div>
        )}

        {/* Limited grid — Rolimons style: name top, big image, rap + price below */}
        {tab === 'limited' && limitedResults.length > 0 && (
          <div className="grid grid-cols-6 gap-3">
            {limitedResults.map(item => {
              const rap = item.priceHistory?.[0]?.rap ?? null;
              const price = item.priceHistory?.[0]?.price ?? null;
              return (
                <button
                  key={item.assetId}
                  onClick={() => router.push(`/item/${item.assetId}`)}
                  className="relative flex flex-col rounded-xl border border-white/10 bg-[#111114] hover:border-purple-400/50 hover:bg-[#18181f] transition-all cursor-pointer group text-left overflow-hidden"
                >
                  {/* Name bar at top */}
                  <div className="px-2 pt-2 pb-2.5 flex items-center gap-1.5 min-h-[28px]">
                    <p className="text-white text-xs font-bold leading-tight truncate">{item.name}</p>
                  </div>

                  {/* Big image */}
                  <div className="mx-3 rounded-lg overflow-hidden bg-black/40 relative" style={{ height: '110px' }}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200" />
                      : <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">?</div>
                    }
                    {item.manipulated && (
                      <div className="absolute top-1.5 left-1.5">
                        <img src="/Images/manipulated1.png" alt="manipulated" className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  {/* RAP + Price */}
                  <div className="px-3 pt-2 pb-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[10px] uppercase tracking-wide font-medium">RAP</span>
                      <span className="text-green-400 text-xs font-bold">
                        {rap != null && rap > 0 ? rap.toLocaleString() : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[10px] uppercase tracking-wide font-medium">Price</span>
                      <span className="text-blue-400 text-xs font-bold">
                        {price != null && price > 0 ? price.toLocaleString() : '—'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Player grid */}
        {tab === 'player' && playerResults.length > 0 && (
          <div className="grid grid-cols-5 gap-3">
            {playerResults.map(player => (
              <button
                key={player.id}
                onClick={() => router.push(`/player/${player.id}`)}
                className="flex flex-col items-center rounded-xl border border-white/10 bg-[#111114] hover:border-blue-400/50 hover:bg-[#111820] transition-all cursor-pointer group"
                style={{ padding: '16px 12px 14px' }}
              >
                <div className="w-20 h-20 rounded-full overflow-hidden bg-black/40 flex-shrink-0 mb-3 ring-2 ring-white/5 group-hover:ring-blue-500/30 transition">
                  {player.imageUrl
                    ? <img src={player.imageUrl} alt={player.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-white/20 text-xl">?</div>
                  }
                </div>
                {player.displayName && player.displayName !== player.name && (
                  <p className="text-white text-sm font-semibold truncate w-full text-center">{player.displayName}</p>
                )}
                <p className="text-slate-400 text-xs truncate w-full text-center">@{player.name}</p>
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}