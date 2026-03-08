// app/player/[userid]/page.tsx
'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ClientInventoryGrid from './ClientInventoryGrid';
import InventoryGraph from './InventoryGraph';
import SnapshotModal from './SnapshotModal';
import DevLoginButton from '@/components/DevLoginButton';

interface User {
  id: string;
  robloxUserId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  description: string | null;
  role?: string | null;
}

interface InventoryItem {
  assetId: string;
  name: string;
  imageUrl: string | null;
  rap: number;
  count: number;
  userAssetIds: string[];
  serialNumbers: (number | null)[];
}

interface Stats {
  totalRAP: number;
  totalItems: number;
  uniqueItems: number;
  lastScanned: string | null;
}

interface GraphDataPoint {
  snapshotId: string;
  date: string;
  timestamp: number;
  rap: number;
  itemCount: number;
  uniqueCount: number;
}

interface PlayerData {
  user: User;
  inventory: InventoryItem[];
  stats: Stats;
  graphData: GraphDataPoint[];
  isPrivate?: boolean;
}

interface Ranks {
  rapRank: number | null;
  itemsRank: number | null;
  uniqueRank: number | null;
}

function getRankTier(rank: number): { color: string; label: string; glow: boolean } {
  if (rank === 1)    return { color: '#c2b506', label: '👑',       glow: true  };
  if (rank === 2)    return { color: '#f3f3f3', label: `#${rank}`, glow: true  };
  if (rank === 3)    return { color: '#cf7500', label: `#${rank}`, glow: true  };
  if (rank <= 10)    return { color: '#49e0ff', label: `#${rank}`, glow: true  };
  if (rank <= 50)    return { color: '#ff6dff', label: `#${rank}`, glow: true  };
  if (rank <= 100)   return { color: '#9ff400', label: `#${rank}`, glow: true  };
  if (rank <= 250)   return { color: '#ffa121', label: `#${rank}`, glow: true  };
  if (rank <= 500)   return { color: '#9d66f3', label: `#${rank}`, glow: false };
  if (rank <= 1000)  return { color: '#17c7b4', label: `#${rank}`, glow: false };
  if (rank <= 5000)  return { color: '#ff7967', label: `#${rank}`, glow: false };
  if (rank <= 10000) return { color: '#979797', label: `#${rank}`, glow: false };
  return               { color: '#666666',  label: `#${rank}`, glow: false };
}

function RankTooltip({ rank, label }: { rank: number; label: string }) {
  const tier = getRankTier(rank);
  return (
    <div className="pointer-events-none absolute right-0 bottom-full mb-2 z-20
      opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col items-end">
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap"
        style={{
          backgroundColor: '#1a1a1a',
          border: `1px solid ${tier.color}55`,
          color: tier.color,
          boxShadow: tier.glow ? `0 0 10px ${tier.color}33` : 'none',
        }}
      >
        <span className="opacity-60">{label}</span>
        <span>{tier.label}</span>
      </div>
      <div
        className="w-2 h-2 rotate-45 mr-2 -mt-1"
        style={{
          backgroundColor: '#1a1a1a',
          border: `1px solid ${tier.color}55`,
          borderTop: 'none',
          borderLeft: 'none',
        }}
      />
    </div>
  );
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  const intervals: Record<string, number> = {
    year: 31536000, month: 2592000, week: 604800,
    day: 86400, hour: 3600, minute: 60,
  };
  for (const [unit, secs] of Object.entries(intervals)) {
    const n = Math.floor(seconds / secs);
    if (n >= 1) return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

export default function PlayerPage({ params: paramsPromise }: { params: Promise<{ userid: string }> }) {
  const params = use(paramsPromise);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlayerData | null>(null);
  const [ranks, setRanks] = useState<Ranks>({ rapRank: null, itemsRank: null, uniqueRank: null });
  const [showModal, setShowModal] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<{ id: string; date: string } | null>(null);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);

  useEffect(() => { fetchPlayerData(); }, [params.userid]);

  const fetchPlayerData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [response, rankRes] = await Promise.all([
        fetch(`/api/player/${params.userid}`),
        fetch(`/api/player/${params.userid}/rank`),
      ]);

      if (!response.ok) {
        setError(response.status === 404 ? 'User not found in database' : 'Failed to fetch player data');
        return;
      }

      const [playerData, rankData] = await Promise.all([
        response.json(),
        rankRes.ok ? rankRes.json() : Promise.resolve({ rapRank: null, itemsRank: null, uniqueRank: null }),
      ]);

      setData(playerData);
      setRanks(rankData);
    } catch {
      setError('Failed to load player data');
    } finally {
      setLoading(false);
    }
  };

  const handleGraphPointClick = (snapshotId: string, date: string) => {
    setSelectedSnapshot({ id: snapshotId, date });
    setShowModal(true);
  };

  if (loading && !data) return (
    <div className="min-h-screen w-full text-white -mt-20 pt-24 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4" />
        <p className="text-[#aaa]">Loading player data...</p>
      </div>
    </div>
  );

  if (error === 'User not found in database') return (
    <div className="min-h-screen w-full text-white -mt-20 pt-24 flex items-center justify-center">
      <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl p-8 text-center max-w-md">
        <h2 className="text-white text-2xl font-bold mb-4">User Not in Database</h2>
        <p className="text-[#aaa] mb-6">This user isn't in the database yet. Would you like to add them?</p>
        <button
          onClick={async () => {
            try {
              const res = await fetch(`/api/load-user/${params.userid}`, { method: 'POST' });
              if (res.ok) fetchPlayerData(); else alert('Failed to add user');
            } catch { alert('Error adding user'); }
          }}
          className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition"
        >
          Add User to Database
        </button>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen w-full text-white -mt-20 pt-24 flex items-center justify-center">
      <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-red-400 mb-2">Oops!</h1>
        <p className="text-[#aaa]">{error || 'Failed to load data'}</p>
      </div>
    </div>
  );

  const { user, inventory, stats, graphData, isPrivate } = data;

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white p-4 -mt-20 pt-24">
      <div className="max-w-7xl mx-auto">

        {/* ── Top row: sidebar + graph ─────────────────────────────── */}
        <div className="flex items-stretch gap-6 mb-6">

          {/* Sidebar */}
          <div className="w-80 flex-shrink-0">
            <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6 h-full relative">

              {/* Role badge */}
              {user.role && user.role !== 'user' && (
                <div className="absolute top-4 left-4 group z-10">
                  <img
                    src={`/Images/${user.role}.png`}
                    alt={user.role ?? ''}
                    className="w-7 h-7 object-contain opacity-90 hover:opacity-100 transition"
                  />
                  {(() => {
                    const roleStyles: Record<string, { bg: string; border: string; text: string }> = {
                      mod:   { bg: '#0a1a2e', border: '#3b82f6', text: '#93c5fd' },
                      admin: { bg: '#2e0a0a', border: '#ef4444', text: '#fca5a5' },
                      owner: { bg: '#1a0a2e', border: '#8b5cf6', text: '#c4b5fd' },
                    };
                    const s = roleStyles[user.role ?? ''] ?? roleStyles.owner;
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

              {/* Avatar */}
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={`${user.displayName || user.username}'s avatar`}
                  className="w-full h-auto rounded-lg mb-5"
                />
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
                  <div>
                    <p className="text-[#888] text-sm truncate">{user.description}</p>
                    {user.description.length > 40 && (
                      <button
                        onClick={() => setShowDescriptionModal(true)}
                        className="text-purple-400 hover:text-purple-300 text-xs mt-1 transition"
                      >
                        View more
                      </button>
                    )}
                  </div>
                )}

                <div className="text-[#777] text-xs">Roblox ID: {user.robloxUserId}</div>

                {isPrivate && (
                  <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-amber-400 text-sm">
                      <span>🔒</span>
                      <span className="font-medium">Inventory is Private</span>
                    </div>
                  </div>
                )}

                {!isPrivate && (
                  <div className="space-y-2 pt-4 border-t border-white/10">

                    {/* Total Items */}
                    <div className="group relative flex justify-between items-center cursor-default">
                      <span className="text-[#aaa] text-sm">Total Items</span>
                      <span className="font-semibold text-sm" style={{ color: '#4fc3f7' }}>
                        {stats.totalItems}
                      </span>
                      {ranks.itemsRank != null && (
                        <RankTooltip rank={ranks.itemsRank} label="Items rank" />
                      )}
                    </div>

                    {/* Unique Items */}
                    <div className="group relative flex justify-between items-center cursor-default">
                      <span className="text-[#aaa] text-sm">Unique Items</span>
                      <span className="font-semibold text-sm" style={{ color: '#a259f7' }}>
                        {stats.uniqueItems}
                      </span>
                      {ranks.uniqueRank != null && (
                        <RankTooltip rank={ranks.uniqueRank} label="Unique rank" />
                      )}
                    </div>

                    {/* Total RAP */}
                    <div className="group relative flex justify-between items-center cursor-default">
                      <span className="text-[#aaa] text-sm">Total RAP</span>
                      <span className="font-semibold text-sm" style={{ color: '#43e97b' }}>
                        {stats.totalRAP.toLocaleString()} R$
                      </span>
                      {ranks.rapRank != null && (
                        <RankTooltip rank={ranks.rapRank} label="RAP rank" />
                      )}
                    </div>

                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Graph */}
          <div className="flex-1 min-h-[400px]">
            <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6 h-full flex flex-col relative">
              {isPrivate ? (
                <div className="flex items-center justify-center flex-1">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🔒</div>
                    <h3 className="text-white text-2xl font-semibold mb-2">Inventory is Private</h3>
                    <p className="text-[#888]">This user has their inventory settings set to private.</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0">
                  <InventoryGraph data={graphData} onPointClick={handleGraphPointClick} />
                </div>
              )}
              <div className="absolute bottom-4 left-4">
                <DevLoginButton robloxUserId={user.robloxUserId} username={user.username} />
              </div>
              <Link
                href={`/history/${user.robloxUserId}`}
                className="absolute bottom-4 right-4 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all bg-[#a78bfa]/10 hover:bg-[#a78bfa]/20 border-[#a78bfa]/30 text-[#a78bfa]"
              >
                View History →
              </Link>
            </div>
          </div>
        </div>

        {/* ── Inventory grid ───────────────────────────────────────── */}
        {isPrivate ? (
          <div className="bg-[#1e1e1e] border border-white/10 rounded-xl p-12 text-center">
            <div className="text-[#888] text-xl mb-4">🔒</div>
            <h3 className="text-white text-2xl mb-2">Inventory is Private</h3>
            <p className="text-[#888]">This player has their inventory settings set to private.</p>
          </div>
        ) : (
          <ClientInventoryGrid items={inventory as any[]} />
        )}
      </div>

      {/* Snapshot modal */}
      <SnapshotModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        snapshotId={selectedSnapshot?.id || null}
        snapshotDate={selectedSnapshot?.date || ''}
      />

      {/* Description modal */}
      {showDescriptionModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setShowDescriptionModal(false)}
        >
          <div
            className="bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-white text-xl font-semibold">About {user.displayName || user.username}</h3>
              <button onClick={() => setShowDescriptionModal(false)} className="text-[#aaa] hover:text-white transition text-2xl leading-none">×</button>
            </div>
            <p className="text-[#ccc] whitespace-pre-wrap">{user.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}