'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Player {
  rank: number;
  robloxUserId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  totalRAP: number;
  totalItems: number;
  uniqueItems: number;
  lastScanned: string | null;
}

type SortKey = 'rap' | 'items' | 'unique';

// Stat label colors (fixed)
const SORT_COLORS: Record<SortKey, string> = {
  rap: '#34d34e',
  items: '#29aaff',
  unique: '#bd4efd',
};

// Rank tier color system — full GD leaderboard tiers
// #1           gold crown + glow
// #2-10        gold
// #11-50       silver/white
// #51-100      orange
// #101-200     lime green
// #201-500     cyan
// #501-1000    pink/magenta
// #1001-5000   salmon/peach
// #5001-10000  teal/mint
// #10001-50000 purple
// #50001+      grey
function getRankTier(rank: number): { color: string; label: string; glow: boolean } {
  if (rank === 1)      return { color: '#c2b506', label: '👑',       glow: true  }; // gold crown
  if (rank === 2)      return { color: '#f3f3f3', label: `#${rank}`, glow: true  }; // silver
  if (rank === 3)      return { color: '#cf7500', label: `#${rank}`, glow: true  }; // bronze
  if (rank <= 10)      return { color: '#49e0ff', label: `#${rank}`, glow: true }; // gold
  if (rank <= 50)      return { color: '#ff6dff', label: `#${rank}`, glow: true }; // silver/white
  if (rank <= 100)     return { color: '#9ff400', label: `#${rank}`, glow: true }; // lime green
  if (rank <= 250)     return { color: '#ffa121', label: `#${rank}`, glow: true }; // orange
  if (rank <= 500)     return { color: '#9d66f3', label: `#${rank}`, glow: false }; // purple
  if (rank <= 1000)    return { color: '#17c7b4', label: `#${rank}`, glow: false }; // teal/mint
  if (rank <= 5000)    return { color: '#ff7967', label: `#${rank}`, glow: false }; // bungee pink
  if (rank <= 10000)   return { color: '#979797', label: `#${rank}`, glow: false }; // grey
  if (rank <= 50000)   return { color: '#000000', label: `#${rank}`, glow: false }; // black
  return                 { color: '#64748b', label: `#${rank}`, glow: false };       // grey
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function PlayerCard({ p, sortKey, onClick }: { p: Player; sortKey: SortKey; onClick: () => void }) {
  const tier = getRankTier(p.rank);
  const color = tier.color;

  return (
    <div
      onClick={onClick}
      className="rounded-lg p-4 flex flex-col hover:scale-[1.02] cursor-pointer border-2 transition-all duration-200"
      style={{
        backgroundColor: color + '18',
        borderColor: tier.glow ? color : color + '44',
        boxShadow: tier.glow
          ? `0 0 16px 3px ${color}44`
          : `0 2px 8px 0 rgba(0,0,0,0.25)`,
        minHeight: 180,
      }}
    >
      {/* Rank + name row */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <span
          className="text-sm font-bold font-mono"
          style={{ color }}
        >
          {tier.label}
        </span>
        {p.lastScanned && (
          <span className="text-xs text-white/30">{timeAgo(p.lastScanned)}</span>
        )}
      </div>

      {/* Avatar + username */}
      <div className="flex flex-row items-center gap-3 mb-3 w-full">
        {p.avatarUrl ? (
          <img
            src={p.avatarUrl}
            alt={p.username}
            className="w-14 h-14 object-cover rounded-lg flex-shrink-0"
            style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}
          />
        ) : (
          <div
            className="w-14 h-14 rounded-lg flex-shrink-0 flex items-center justify-center text-xl font-bold"
          >
            {p.username[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex flex-col justify-center min-w-0">
          <span
            className="font-bold text-sm leading-tight truncate"
            style={{ color: '#fff', textShadow: '0 1px 4px #000' }}
          >
            {p.displayName || p.username}
          </span>
          {p.displayName && p.displayName !== p.username && (
            <span className="text-xs text-white/40 truncate">@{p.username}</span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-col gap-1 mt-auto">
        <div className="flex flex-row justify-between w-full gap-2">
          <span className="font-bold text-sm text-white/70 flex-shrink-0">RAP</span>
          <span className="text-white/90 font-mono text-sm truncate" style={{ color: SORT_COLORS.rap }}>
            {p.totalRAP.toLocaleString()} R$
          </span>
        </div>
        <div className="flex flex-row justify-between w-full gap-2">
          <span className="font-bold text-sm text-white/70 flex-shrink-0">Items</span>
          <span className="font-mono text-sm truncate" style={{ color: SORT_COLORS.items }}>
            {p.totalItems.toLocaleString()}
          </span>
        </div>
        <div className="flex flex-row justify-between w-full gap-2">
          <span className="font-bold text-sm text-white/70 flex-shrink-0">Unique</span>
          <span className="font-mono text-sm truncate" style={{ color: SORT_COLORS.unique }}>
            {p.uniqueItems.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
      >
        ← Prev
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-slate-600">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className="w-8 h-8 rounded-lg text-sm font-semibold transition-all border"
            style={
              p === page
                ? { background: 'rgba(139,92,246,0.2)', color: '#a78bfa', borderColor: '#8b5cf6' }
                : { background: 'transparent', color: '#64748b', borderColor: 'transparent' }
            }
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
      >
        Next →
      </button>
    </div>
  );
}

export default function PlayersPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('rap');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [allLoading, setAllLoading] = useState(false);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort, page: String(page) });
      const res = await fetch(`/api/players?${params}`);
      const data = await res.json();
      setPlayers(data.players || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [sort, page]);

  const fetchAll = useCallback(async () => {
    setAllLoading(true);
    try {
      const params = new URLSearchParams({ sort, page: '1', limit: '99999' } as any);
      const res = await fetch(`/api/players?${params}`);
      const data = await res.json();
      setAllPlayers(data.players || []);
    } catch {
      // silent fail
    } finally {
      setAllLoading(false);
    }
  }, [sort]);

  useEffect(() => {
    if (search) {
      fetchAll();
    } else {
      fetchPage();
    }
  }, [sort, page, search, fetchPage, fetchAll]);

  useEffect(() => {
    setPage(1);
  }, [sort]);

  useEffect(() => {
    document.title = 'Players | Azurewrath';
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const clearSearch = () => {
    setSearch('');
    setSearchInput('');
  };

  const displayed = search
    ? allPlayers.filter(p =>
        p.username.toLowerCase().includes(search.toLowerCase()) ||
        (p.displayName?.toLowerCase().includes(search.toLowerCase()))
      )
    : players;

  const isLoading = search ? allLoading : loading;

  const SORTS: { key: SortKey; label: string }[] = [
    { key: 'rap', label: 'RAP' },
    { key: 'items', label: 'Items' },
    { key: 'unique', label: 'Unique Items' },
  ];

  return (
    <div className="min-h-screen p-4 -mt-20 pt-24">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold text-white glow-purple">Players</h1>
            <p className="text-slate-400 mt-1">
              {search
                ? `${displayed.length} result${displayed.length !== 1 ? 's' : ''} · ${total.toLocaleString()} total tracked`
                : `${total.toLocaleString()} tracked player${total !== 1 ? 's' : ''}`
              }
            </p>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search username..."
              className="bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50 w-52"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm transition border border-white/10"
            >
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={clearSearch}
                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 text-sm transition"
              >
                ✕
              </button>
            )}
          </form>
        </div>

        {/* Sort Bar */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-4 flex flex-wrap gap-2 items-center">
          <span className="text-slate-400 text-xs uppercase tracking-wider mr-1">Sort</span>
          {SORTS.map(s => {
            const color = SORT_COLORS[s.key];
            return (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 flex items-center gap-1 border"
                style={
                  sort === s.key
                    ? { backgroundColor: color + '33', color: color, borderColor: color }
                    : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#94a3b8', borderColor: 'transparent' }
                }
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="py-20 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-20 text-center text-slate-500">
            {search ? `No players found for "${search}"` : 'No tracked players yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {displayed.map(p => (
              <PlayerCard
                key={p.robloxUserId}
                p={p}
                sortKey={sort}
                onClick={() => router.push(`/player/${p.robloxUserId}`)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!search && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={p => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {!isLoading && displayed.length > 0 && (
          <p className="text-center text-slate-600 text-xs">
            {search
              ? 'Showing all matches — ranks are preserved from the full leaderboard.'
              : `Page ${page} of ${totalPages} · Rankings based on latest scanned inventory.`
            }
          </p>
        )}
      </div>
    </div>
  );
}