// app/player/[userid]/page.tsx
'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

// Helper function for "time ago"
function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };
  
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
    }
  }
  
  return 'just now';
}

export default function PlayerPage({ params: paramsPromise }: { params: Promise<{ userid: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlayerData | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<{ id: string; date: string } | null>(null);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);

  useEffect(() => {
    fetchPlayerData();
  }, [params.userid]);

  const fetchPlayerData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/player/${params.userid}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('User not found in database');
        } else {
          throw new Error('Failed to fetch player data');
        }
        return;
      }

      const playerData: PlayerData = await response.json();
      setData(playerData);

    } catch (err) {
      console.error('Error fetching player data:', err);
      setError('Failed to load player data');
    } finally {
      setLoading(false);
    }
  };

  const handleGraphPointClick = (snapshotId: string, date: string) => {
    setSelectedSnapshot({ id: snapshotId, date });
    setShowModal(true);
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-24 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading player data...</p>
        </div>
      </div>
    );
  }

  if (error === 'User not found in database') {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-24 flex items-center justify-center">
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 text-center max-w-md">
          <h2 className="text-white text-2xl font-bold mb-4">User Not in Database</h2>
          <p className="text-slate-400 mb-6">
            This user isn't in the database yet. Would you like to add them?
          </p>
          <button 
            onClick={async () => {
              try {
                const response = await fetch(`/api/load-user/${params.userid}`, {
                  method: 'POST'
                });
                if (response.ok) {
                  fetchPlayerData();
                } else {
                  alert('Failed to add user');
                }
              } catch (err) {
                alert('Error adding user');
              }
            }}
            className="bg-gradient-to-r from-neon-blue to-neon-purple text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition"
          >
            Add User to Database
          </button>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-24 flex items-center justify-center">
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-red-400 mb-2">Oops!</h1>
          <p className="text-slate-400">{error || 'Failed to load data'}</p>
        </div>
      </div>
    );
  }

  const { user, inventory, stats, graphData, isPrivate } = data;
  const scannedTime = stats.lastScanned ? timeAgo(stats.lastScanned) : null;

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white p-4 -mt-20 pt-24">
      <div className="max-w-7xl mx-auto">
        {/* Top Row - Sidebar + Graph */}
        <div className="flex items-stretch gap-6 mb-8">
          {/* Left Sidebar - Avatar & Profile Info */}
          <div className="w-80 flex-shrink-0">
            <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6 h-full relative">
              {/* Role icon — top-right corner, only for non-user roles */}
              {user.role && user.role !== 'user' && (
                <div className="absolute top-4 left-4 group z-10">
                  <img
                    src={`/Images/${user.role}.png`}
                    alt={user.role}
                    className="w-7 h-7 object-contain opacity-90 hover:opacity-100 transition"
                  />
                  <div className="absolute left-0 top-full mt-1.5 px-2 py-1 rounded-md bg-[#1a0a2e] border border-purple-500/60 text-xs font-semibold text-purple-200 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg capitalize">
                    {user.role}
                  </div>
                </div>
              )}
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={`${user.displayName || user.username}'s avatar`}
                  className="w-full h-auto rounded-lg mb-6"
                />
              ) : (
                <div className="w-full aspect-square bg-slate-700/50 rounded-lg flex items-center justify-center mb-6">
                  <span className="text-slate-400">No avatar</span>
                </div>
              )}

              {/* Profile Info */}
              <div className="space-y-3">
                <div>
                  <h1 className="text-2xl font-bold text-white">{user.displayName || user.username}</h1>
                  <p className="text-purple-300">@{user.username}</p>
                </div>

                {/* Dev Login Button — only visible locally */}
                <DevLoginButton
                  robloxUserId={user.robloxUserId}
                  username={user.username}
                />
                
                {/* Description with View More */}
                {user.description && (
                  <div>
                    <p className="text-slate-400 text-sm truncate">
                      {user.description}
                    </p>
                    <button
                      onClick={() => setShowDescriptionModal(true)}
                      className="text-purple-400 hover:text-purple-300 text-xs mt-1 transition"
                    >
                      View more
                    </button>
                  </div>
                )}
                
                <div className="text-slate-500 text-xs">
                  Roblox ID: {user.robloxUserId}
                </div>

                {/* Show private warning if inventory is private */}
                {isPrivate && (
                  <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-amber-400 text-sm">
                      <span>🔒</span>
                      <span className="font-medium">Inventory is Private</span>
                    </div>
                  </div>
                )}

                {/* Stats - only show if not private */}
                {!isPrivate && (
                  <div className="space-y-2 pt-4 border-t border-slate-700">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Total Items</span>
                      <span className="text-blue-400 font-semibold">{stats.totalItems}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Unique Items</span>
                      <span className="text-purple-400 font-semibold">{stats.uniqueItems}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Total RAP</span>
                      <span className="text-green-400 font-semibold">{stats.totalRAP.toLocaleString()} R$</span>
                    </div>
                    {scannedTime && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-sm">Last Scanned</span>
                        <span className="text-slate-500 text-sm">{scannedTime}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Side - Graph */}
          <div className="flex-1 min-h-[400px]">
            <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 h-full">
              {isPrivate ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🔒</div>
                    <h3 className="text-white text-2xl font-semibold mb-2">
                      Inventory is Private
                    </h3>
                    <p className="text-slate-400">
                      This user has their inventory settings set to private.
                    </p>
                  </div>
                </div>
              ) : (
                <InventoryGraph 
                  data={graphData} 
                  onPointClick={handleGraphPointClick}
                />
              )}
            </div>
          </div>
        </div>

        {/* Inventory Grid - Full Width Below */}
        <div>
          {isPrivate ? (
            <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-12 text-center">
              <div className="text-slate-400 text-xl mb-4">🔒</div>
              <h3 className="text-white text-2xl mb-2">Inventory is Private</h3>
              <p className="text-slate-400">
                This player has their inventory settings set to private.
              </p>
            </div>
          ) : (
            <ClientInventoryGrid items={inventory as any[]} />
          )}
        </div>
      </div>

      {/* Snapshot Modal */}
      <SnapshotModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        snapshotId={selectedSnapshot?.id || null}
        snapshotDate={selectedSnapshot?.date || ''}
      />

      {/* Description Modal */}
      {showDescriptionModal && (
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setShowDescriptionModal(false)}
        >
          <div 
            className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-white text-xl font-semibold">About {user.displayName || user.username}</h3>
              <button
                onClick={() => setShowDescriptionModal(false)}
                className="text-slate-400 hover:text-white transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-slate-300 whitespace-pre-wrap">
              {user.description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}