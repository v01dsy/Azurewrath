'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Pagination from '@/components/Pagination';

type Tab = 'limited' | 'player';

interface LimitedResult {
  assetId: string;
  name: string;
  imageUrl: string | null;
  manipulated?: boolean;
  isLimitedUnique?: boolean | null;
  priceHistory?: { rap?: number | null; price?: number | null }[];
}

interface PlayerResult {
  id: string;
  name: string;
  displayName?: string;
  imageUrl?: string;
}

const PAGE_SIZE = 24;

// ── Item card (mirrors trade/new request side exactly) ─────────────────────────
function ItemCard({
  item,
  onClick,
}: {
  item: LimitedResult;
  onClick: () => void;
}) {
  const rap = item.priceHistory?.[0]?.rap ?? null;

  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06] transition-all cursor-pointer text-left w-full"
      style={{ padding: '14px 10px 12px' }}
    >
      <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-black/40 flex-shrink-0 mb-2">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">?</div>
        )}
        {item.manipulated && (
          <img src="/Images/manipulated1.webp" alt="Manipulated" title="This item's RAP may be manipulated" className="absolute top-1 left-1 w-5 h-5 z-10" />
        )}
      </div>

      <p className="text-white text-xs font-medium leading-tight text-center w-full truncate px-1">
        {item.name}
      </p>
      {typeof rap === 'number' && rap > 0 && (
        <p className="text-white font-bold text-[11px] mt-1">{rap.toLocaleString()} R$</p>
      )}
    </button>
  );
}

export default function SearchPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('limited');
  const [query, setQuery] = useState('');
  const [limitedResults, setLimitedResults] = useState<LimitedResult[]>([]);
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Pagination (limited only)
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { document.title = 'Search | Azurewrath'; }, []);

  // Reset page on query/tab change
  useEffect(() => { setPage(1); }, [query, tab]);

  // Fetch — always fires (empty query shows all items sorted by RAP)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        if (tab === 'limited') {
          const res = await fetch(
            `/api/items/search?q=${encodeURIComponent(query.trim())}&page=${page}`
          );
          const data = await res.json();
          if (cancelled) return;
          setLimitedResults(Array.isArray(data.items) ? data.items : []);
          setTotalItems(data.total ?? 0);
          setTotalPages(data.totalPages ?? 1);
        } else {
          const res = await fetch(
            `/api/players/search?q=${encodeURIComponent(query.trim())}`
          );
          const data = await res.json();
          if (cancelled) return;
          setPlayerResults(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setLimitedResults([]);
          setPlayerResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Debounce typing, but fire immediately on page/tab changes
    const delay = query.trim().length > 0 ? 300 : 0;
    const t = setTimeout(run, delay);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, tab, page]);

  const isEmpty = !loading && (
    tab === 'limited' ? limitedResults.length === 0 : playerResults.length === 0
  );

  return (
    <div
      className="min-h-screen w-full text-white"
      style={{ background: 'rgba(10,10,10,0.6)', marginTop: '-80px', paddingTop: '104px', paddingBottom: '48px' }}
    >
      <div className="max-w-5xl mx-auto px-6">

        {/* Search card */}
        <div
          className="rounded-2xl border border-white/10 bg-[#0d0d0f] overflow-hidden mb-6"
          style={{ boxShadow: '0 2px 24px rgba(0,0,0,0.5)' }}
        >
          <div className="flex items-stretch border-b border-white/10">
            <div className="px-5 flex items-center flex-shrink-0 border-r border-white/10">
              <h1 className="text-lg font-bold text-white">Search</h1>
            </div>
            <button
              onClick={() => setTab('limited')}
              className={`flex-1 py-3.5 text-sm font-semibold transition border-b-2 ${
                tab === 'limited'
                  ? 'text-purple-300 border-purple-500 bg-purple-500/5'
                  : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              Limiteds
            </button>
            <button
              onClick={() => setTab('player')}
              className={`flex-1 py-3.5 text-sm font-semibold transition border-b-2 ${
                tab === 'player'
                  ? 'text-blue-300 border-blue-500 bg-blue-500/5'
                  : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              Players
            </button>
          </div>

          <div className="px-4 py-3">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={
                  tab === 'limited'
                    ? 'Filter by name or asset ID...'
                    : 'Search players by username...'
                }
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50 transition text-sm"
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {query && !loading && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Result count */}
        {!loading && tab === 'limited' && totalItems > 0 && (
          <p className="text-slate-500 text-xs mb-4">
            {query.trim()
              ? <>{totalItems.toLocaleString()} result{totalItems !== 1 ? 's' : ''} for <span className="text-slate-300">"{query}"</span></>
              : <>{totalItems.toLocaleString()} items · sorted by RAP</>
            }
          </p>
        )}

        {/* No results */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-slate-400 font-medium mb-1">No results found</p>
            <p className="text-slate-600 text-sm">Try a different search term</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/5 bg-white/[0.02] animate-pulse"
                style={{ height: 160 }}
              />
            ))}
          </div>
        )}

        {/* ── Limited grid ── */}
        {tab === 'limited' && !loading && limitedResults.length > 0 && (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {limitedResults.map(item => (
                <ItemCard
                  key={item.assetId}
                  item={item}
                  onClick={() => router.push(`/item/${item.assetId}`)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-6">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  pageSize={PAGE_SIZE}
                  onPageChange={p => {
                    setPage(p);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* ── Player grid ── */}
        {tab === 'player' && !loading && playerResults.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {playerResults.map(p => (
              <button
                key={p.id}
                onClick={() => router.push(`/player/${p.id}`)}
                className="flex flex-col items-center rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06] transition-all cursor-pointer p-4 gap-2"
              >
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    className="w-16 h-16 rounded-full object-cover bg-black/40"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center text-white/20 text-xs">
                    ?
                  </div>
                )}
                <div className="text-center">
                  <p className="text-white text-xs font-semibold truncate max-w-[110px]">
                    {p.displayName || p.name}
                  </p>
                  {p.displayName && p.displayName !== p.name && (
                    <p className="text-slate-500 text-[10px] truncate max-w-[110px]">@{p.name}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}