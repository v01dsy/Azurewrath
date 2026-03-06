// app/players/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
}

type SortKey = 'rap' | 'items' | 'unique';

const SORT_COLORS: Record<SortKey, string> = {
  rap: '#34d34e',
  items: '#29aaff',
  unique: '#bd4efd',
};

const RANK_TIERS = [
  { max: 1,        color: '#c2b506', name: 'Aurite',    glow: true,  desc: 'Rank #1' },
  { max: 2,        color: '#f3f3f3', name: 'Moonstone', glow: true,  desc: 'Rank #2' },
  { max: 3,        color: '#cf7500', name: 'Sunstone',  glow: true,  desc: 'Rank #3' },
  { max: 10,       color: '#5eff00', name: 'Uranium',   glow: true,  desc: 'Ranks #4 – #10' },
  { max: 50,       color: '#05daff', name: 'Diamond',   glow: true,  desc: 'Ranks #11 – #50' },
  { max: 100,      color: '#13b92f', name: 'Emerald',   glow: true,  desc: 'Ranks #51 – #100' },
  { max: 250,      color: '#ff3d3d', name: 'Ruby',      glow: true,  desc: 'Ranks #101 – #250' },
  { max: 500,      color: '#2e54ff', name: 'Sapphire',  glow: true,  desc: 'Ranks #251 – #500' },
  { max: 1000,     color: '#af66f3', name: 'Amethyst',  glow: true,  desc: 'Ranks #501 – #1,000' },
  { max: 5000,     color: '#e2e8f0', name: 'Platinum',  glow: true,  desc: 'Ranks #1,001 – #5,000' },
  { max: 10000,    color: '#ffd621', name: 'Gold',      glow: true,  desc: 'Ranks #5,001 – #10,000' },
  { max: 50000,    color: '#979797', name: 'Silver',    glow: false, desc: 'Ranks #10,001 – #50,000' },
  { max: Infinity, color: '#cd7f32', name: 'Bronze',    glow: false, desc: 'Ranks #50,001+' }, // mf said "too infinity, and beyond!" mayne shut tf up buzz lightyear!!!
] as const;

function getRankTier(rank: number): {
  color: string; label: string; glow: boolean; name: string; glowLevel: 0 | 1 | 2 | 3;
} {
  if (rank === 1)    return { color: '#c2b506', label: '👑',       glow: true,  name: 'Aurite',    glowLevel: 3 };
  if (rank === 2)    return { color: '#f3f3f3', label: `#${rank}`, glow: true,  name: 'Moonstone', glowLevel: 3 };
  if (rank === 3)    return { color: '#cf7500', label: `#${rank}`, glow: true,  name: 'Sunstone',  glowLevel: 3 };
  if (rank <= 10)    return { color: '#5eff00', label: `#${rank}`, glow: true,  name: 'Uranium',   glowLevel: 3 };
  if (rank <= 50)    return { color: '#05daff', label: `#${rank}`, glow: true,  name: 'Diamond',   glowLevel: 3 };
  if (rank <= 100)   return { color: '#13b92f', label: `#${rank}`, glow: true,  name: 'Emerald',   glowLevel: 2 };
  if (rank <= 250)   return { color: '#ff3d3d', label: `#${rank}`, glow: true,  name: 'Ruby',      glowLevel: 2 };
  if (rank <= 500)   return { color: '#2e54ff', label: `#${rank}`, glow: true,  name: 'Sapphire',  glowLevel: 2 };
  if (rank <= 1000)  return { color: '#af66f3', label: `#${rank}`, glow: true,  name: 'Amethyst',  glowLevel: 2 };
  if (rank <= 5000)  return { color: '#e2e8f0', label: `#${rank}`, glow: true,  name: 'Platinum',  glowLevel: 1 };
  if (rank <= 10000) return { color: '#ffd621', label: `#${rank}`, glow: true,  name: 'Gold',      glowLevel: 1 };
  if (rank <= 50000) return { color: '#979797', label: `#${rank}`, glow: false, name: 'Silver',    glowLevel: 0 };
  return               { color: '#cd7f32', label: `#${rank}`, glow: false, name: 'Bronze',    glowLevel: 0 };
}

const PAGE_CSS = `
  @keyframes floatUp {
    0%   { transform: translateY(0)      scale(1); opacity: 0; }
    20%  { opacity: 1; }
    80%  { opacity: 0.6; }
    100% { transform: translateY(-320px) scale(0); opacity: 0; }
  }
  @keyframes breathe3 {
    0%, 100% { opacity: 0.2; }
    50%       { opacity: 1; }
  }
  @keyframes breathe2 {
    0%, 100% { opacity: 0.2; }
    50%       { opacity: 1; }
  }
  .player-card {
    transition: transform 200ms ease;
    will-change: transform;
  }
  .player-card:hover { transform: scale(1.02); }
  .card-glow-3 .glow-ring { animation: breathe3 4s ease-in-out infinite; will-change: opacity; }
  .card-glow-2 .glow-ring { animation: breathe2 4s ease-in-out infinite; will-change: opacity; }
  .particle { will-change: transform, opacity; }

  .display-slide {
    display: inline-flex;
    align-items: center;
    max-width: 0;
    opacity: 0;
    overflow: hidden;
    white-space: nowrap;
    transform: translateX(-6px);
    transition:
      max-width 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.6s,
      opacity   0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.6s,
      transform 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.6s;
    flex-shrink: 0;
  }
  .group-name:hover .display-slide {
    max-width: 160px;
    opacity: 1;
    transform: translateX(0);
  }
`;

function CardParticles({ color, scale = 1 }: { color: string; scale?: number }) {
  const particles = useMemo(() =>
    Array.from({ length: 16 }, (_, i) => ({
      id:       i,
      left:     `${5 + Math.random() * 85}%`,
      delay:    `-${(i * (18 / 16)).toFixed(2)}s`,
      duration: `${(9 + Math.random() * 9).toFixed(2)}s`,
      size: parseFloat((1.2 + Math.random() * 2).toFixed(1)) * scale,
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  return (
    <>
      {particles.map(p => (
        <div
          key={p.id}
          className="particle absolute rounded-full pointer-events-none"
          style={{
            left:            p.left,
            bottom:          '-10px',
            width:           `${p.size}px`,
            height:          `${p.size}px`,
            backgroundColor: color,
            boxShadow:       `0 0 ${p.size * 2}px ${color}`,
            animation:       `floatUp ${p.duration} ${p.delay} infinite ease-out`,
          }}
        />
      ))}
    </>
  );
}

function PlayerCard({ p, onClick }: { p: Player; onClick: () => void }) {
  const tier  = getRankTier(p.rank);
  const color = tier.color;
  const gl    = tier.glowLevel;

  const glowStyle: React.CSSProperties = {};
  if (gl === 1) {
    glowStyle.boxShadow = `0 0 16px 3px ${color}44`;
  }

  const glowRingStyle: React.CSSProperties = gl >= 2 ? {
    position:      'absolute',
    inset:         0,
    borderRadius:  'inherit',
    pointerEvents: 'none',
    boxShadow:     gl === 3
      ? `inset 0 0 25px 6px ${color}88, inset 0 0 8px 2px ${color}55`
      : `inset 0 0 18px 4px ${color}66`,
  } : {};

  const hasDisplayName = p.displayName && p.displayName !== p.username;

  return (
    <div
      onClick={onClick}
      className={`card-glow-${gl} player-card relative rounded-xl flex flex-col cursor-pointer border-2 overflow-hidden`}
      style={{
        backgroundColor: color + '18',
        borderColor:     gl > 0 ? color : color + '44',
        height:          320,
        ...glowStyle,
      }}
    >
      {gl >= 2 && <div className="glow-ring" style={glowRingStyle} />}
      {gl === 3 && <CardParticles color={color} />}

      {/* Avatar */}
      <div
        className="relative w-full flex-1 overflow-hidden flex items-center justify-center"
        style={{ backgroundColor: color + '11', padding: '16px 12px' }}
      >
        {p.avatarUrl ? (
          <img
            src={p.avatarUrl}
            alt={p.username}
            className="h-full w-auto object-contain"
            loading="lazy"
            style={{
              maskImage: 'radial-gradient(ellipse at center, black 50%, transparent 72%)',
              WebkitMaskImage: 'radial-gradient(ellipse at center, black 50%, transparent 72%)',
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: color + '22' }}>
            <span className="text-4xl font-bold" style={{ color: color + '88' }}>{p.username[0]?.toUpperCase()}</span>
          </div>
        )}
        <div className="absolute top-2 left-2">
          <span
            className="text-xs font-bold font-mono px-1.5 py-0.5 rounded"
            style={{ color, backgroundColor: '#00000088', backdropFilter: 'blur(4px)' }}
          >
            {tier.label}
          </span>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-10"
          style={{ background: `linear-gradient(to bottom, transparent, ${color}18)` }}
        />
      </div>

      {/* Stats */}
      <div className="px-4 pb-3 pt-2 flex flex-col gap-2" style={{ backgroundColor: color + '10', minHeight: 130 }}>
        {/* Username always shown — display name slides in on hover */}
        <div className="group-name flex items-center overflow-hidden" style={{ height: 22 }}>
          <span className="font-bold text-base leading-none text-white flex-shrink-0">
            {p.username}
          </span>
          {hasDisplayName && (
            <span className="display-slide text-xs ml-1.5" style={{ color: color + '99' }}>
              {p.displayName}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between">
            <span className="text-sm text-white/50">RAP</span>
            <span className="text-sm font-mono font-bold" style={{ color: SORT_COLORS.rap }}>{p.totalRAP.toLocaleString()} R$</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-white/50">Items</span>
            <span className="text-sm font-mono font-bold" style={{ color: SORT_COLORS.items }}>{p.totalItems.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-white/50">Unique</span>
            <span className="text-sm font-mono font-bold" style={{ color: SORT_COLORS.unique }}>{p.uniqueItems.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RankGuideModal({ onClose }: { onClose: () => void }) {
  const rowTiers = [
    { tier: RANK_TIERS[0],  gl: 3 },  // Aurite    rank 1
    { tier: RANK_TIERS[1],  gl: 3 },  // Moonstone rank 2
    { tier: RANK_TIERS[2],  gl: 3 },  // Sunstone  rank 3
    { tier: RANK_TIERS[3],  gl: 3 },  // Uranium   rank 4-10
    { tier: RANK_TIERS[4],  gl: 3 },  // Diamond   rank 11-50
    { tier: RANK_TIERS[5],  gl: 2 },  // Emerald   rank 51-100
    { tier: RANK_TIERS[6],  gl: 2 },  // Ruby      rank 101-250
    { tier: RANK_TIERS[7],  gl: 2 },  // Sapphire  rank 251-500
    { tier: RANK_TIERS[8],  gl: 2 },  // Amethyst  rank 501-1000
    { tier: RANK_TIERS[9],  gl: 1 },  // Platinum  rank 1001-5000
    { tier: RANK_TIERS[10], gl: 1 },  // Gold      rank 5001-10000
    { tier: RANK_TIERS[11], gl: 0 },  // Silver    rank 10001-50000
    { tier: RANK_TIERS[12], gl: 0 },  // Bronze    rank 50001+
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#111] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white text-lg font-bold">Rank Guide</h2>
            <p className="text-slate-500 text-xs mt-0.5">Rankings are based on Total RAP</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition text-2xl leading-none">×</button>
        </div>
        <div className="space-y-2">
          {rowTiers.map(({ tier, gl }, i) => (
            <div
              key={i}
              className={`card-glow-${gl} relative overflow-hidden flex items-center gap-3 px-3 py-2.5 rounded-lg`}
              style={{
                backgroundColor: tier.color + '18',
                border: `1px solid ${gl > 0 ? tier.color : tier.color + '44'}`,
                boxShadow: undefined,
              }}
            >
              {gl >= 2 && (
                <div
                  className="glow-ring"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 'inherit',
                    pointerEvents: 'none',
                    boxShadow: gl === 3
                      ? `inset 0 0 25px 6px ${tier.color}88, inset 0 0 8px 2px ${tier.color}55`
                      : `inset 0 0 18px 4px ${tier.color}66`,
                  }}
                />
              )}
              {gl === 3 && <CardParticles color={tier.color} scale={.7} />}
              <div
                className="w-3 h-3 rounded-full flex-shrink-0 relative z-10"
                style={{
                  backgroundColor: tier.color,
                  boxShadow: gl > 0 ? `0 0 8px 2px ${tier.color}99` : 'none',
                }}
              />
              <span className="font-bold text-sm w-20 flex-shrink-0 relative z-10" style={{ color: tier.color }}>{tier.name}</span>
              <span className="text-white/80 text-xs font-semibold relative z-10">{tier.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <button onClick={() => onChange(page - 1)} disabled={page === 1}
        className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition">
        ← Prev
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`e-${i}`} className="px-2 text-slate-600">…</span>
        ) : (
          <button key={p} onClick={() => onChange(p)}
            className="w-8 h-8 rounded-lg text-sm font-semibold transition-all border"
            style={p === page
              ? { background: 'rgba(139,92,246,0.2)', color: '#a78bfa', borderColor: '#8b5cf6' }
              : { background: 'transparent', color: '#64748b', borderColor: 'transparent' }}>
            {p}
          </button>
        )
      )}
      <button onClick={() => onChange(page + 1)} disabled={page === totalPages}
        className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition">
        Next →
      </button>
    </div>
  );
}

export default function PlayersPage() {
  const router = useRouter();
  const [players,       setPlayers]       = useState<Player[]>([]);
  const [total,         setTotal]         = useState(0);
  const [totalPages,    setTotalPages]    = useState(1);
  const [loading,       setLoading]       = useState(true);
  const [sort,          setSort]          = useState<SortKey>('rap');
  const [page,          setPage]          = useState(1);
  const [searchInput,   setSearchInput]   = useState('');
  const [search,        setSearch]        = useState('');
  const [allPlayers,    setAllPlayers]    = useState<Player[]>([]);
  const [allLoading,    setAllLoading]    = useState(false);
  const [showRankGuide, setShowRankGuide] = useState(false);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort, page: String(page) });
      const res  = await fetch(`/api/players?${params}`);
      const data = await res.json();
      setPlayers(data.players    || []);
      setTotal(data.total        || 0);
      setTotalPages(data.totalPages || 1);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [sort, page]);

  const fetchAll = useCallback(async () => {
    setAllLoading(true);
    try {
      const params = new URLSearchParams({ sort, page: '1', limit: '99999' } as any);
      const res  = await fetch(`/api/players?${params}`);
      const data = await res.json();
      setAllPlayers(data.players || []);
    } catch { /* silent */ } finally { setAllLoading(false); }
  }, [sort]);

  useEffect(() => {
    if (search) fetchAll();
    else        fetchPage();
  }, [sort, page, search, fetchPage, fetchAll]);

  useEffect(() => { setPage(1); }, [sort]);
  useEffect(() => { document.title = 'Players | Azurewrath'; }, []);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setSearch(searchInput.trim()); setPage(1); };
  const clearSearch  = () => { setSearch(''); setSearchInput(''); };

  const displayed = search
    ? allPlayers.filter(p =>
        p.username.toLowerCase().includes(search.toLowerCase()) ||
        p.displayName?.toLowerCase().includes(search.toLowerCase())
      )
    : players;

  const isLoading = search ? allLoading : loading;

  const SORTS: { key: SortKey; label: string }[] = [
    { key: 'rap',    label: 'RAP' },
    { key: 'items',  label: 'Items' },
    { key: 'unique', label: 'Unique Items' },
  ];

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12">
      <style>{PAGE_CSS}</style>

      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-bold text-white glow-purple">Players</h1>
              <button
                onClick={() => setShowRankGuide(true)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#94a3b8' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; }}
              >
                Rank Guide
              </button>
            </div>
            <p className="text-slate-400 mt-1">
              {search
                ? `${displayed.length} result${displayed.length !== 1 ? 's' : ''} · ${total.toLocaleString()} total tracked`
                : `${total.toLocaleString()} tracked player${total !== 1 ? 's' : ''}`}
            </p>
          </div>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Search username..."
              className="bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50 w-52" />
            <button type="submit" className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm transition border border-white/10">Search</button>
            {search && (
              <button type="button" onClick={clearSearch} className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 text-sm transition">✕</button>
            )}
          </form>
        </div>

        <div className="bg-[#111] border border-white/10 rounded-xl p-4 flex flex-wrap gap-2 items-center">
          <span className="text-slate-400 text-xs uppercase tracking-wider mr-1">Sort</span>
          {SORTS.map(s => {
            const color = SORT_COLORS[s.key];
            return (
              <button key={s.key} onClick={() => setSort(s.key)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 flex items-center gap-1 border"
                style={sort === s.key
                  ? { backgroundColor: color + '33', color, borderColor: color }
                  : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#94a3b8', borderColor: 'transparent' }}>
                {s.label}
              </button>
            );
          })}
        </div>

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
              <PlayerCard key={p.robloxUserId} p={p} onClick={() => router.push(`/player/${p.robloxUserId}`)} />
            ))}
          </div>
        )}

        {!search && (
          <Pagination page={page} totalPages={totalPages} onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        )}

        {!isLoading && displayed.length > 0 && (
          <p className="text-center text-slate-600 text-xs">
            {search
              ? 'Showing all matches — ranks are preserved from the full leaderboard.'
              : `Page ${page} of ${totalPages} · Rankings based on latest scanned inventory.`}
          </p>
        )}
      </div>

      {showRankGuide && <RankGuideModal onClose={() => setShowRankGuide(false)} />}
    </div>
  );
}