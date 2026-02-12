'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ClientInventoryGrid from './ClientInventoryGrid';
import InventoryGraph from './InventoryGraph';
import SnapshotModal from './SnapshotModal';

interface User {
  id: string;
  robloxUserId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  description: string | null;
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
  const params = use(paramsPromise); // Unwrap the Promise
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlayerData | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<{ id: string; date: string } | null>(null);

  useEffect(() => {
    fetchPlayerData();
  }, [params.userid]);

  const fetchPlayerData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch player data from API
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

  const handleRescan = async () => {
    if (!data) return;
    
    const confirmed = confirm('This will scan the inventory from Roblox and create a new snapshot. Continue?');
    if (!confirmed) return;

    try {
      setLoading(true);
      // Trigger rescan API endpoint (you'll need to create this)
      const response = await fetch(`/api/player/${params.userid}/rescan`, {
        method: 'POST'
      });

      if (response.ok) {
        // Refresh data after rescan
        await fetchPlayerData();
      } else {
        alert('Failed to rescan inventory');
      }
    } catch (err) {
      console.error('Rescan error:', err);
      alert('Failed to rescan inventory');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white text-2xl">Loading player data...</div>
      </div>
    );
  }

  if (error === 'User not found in database') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 text-center max-w-md">
          <h2 className="text-white text-2xl mb-4">User Not in Database</h2>
          <p className="text-slate-400 mb-6">
            This user isn't in the database yet. Would you like to add them?
          </p>
          <button 
            onClick={() => router.push(`/api/load-user/${params.userid}`)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Add User to Database
          </button>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white text-2xl">{error || 'Failed to load data'}</div>
      </div>
    );
  }

  const { user, inventory, stats, graphData } = data;
  const scannedTime = stats.lastScanned ? timeAgo(stats.lastScanned) : null;

  return (
    <div className="min-h-screen bg-slate-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Top Row - Sidebar + Graph */}
        <div className="flex items-stretch gap-6 mb-8">
          {/* Left Sidebar - Avatar & Profile Info */}
          <div className="w-80 flex-shrink-0">
            <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6 h-full">
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
                {user.description && (
                  <p className="text-slate-300 text-sm">{user.description}</p>
                )}
                <div className="text-slate-400 text-xs">
                  Roblox ID: {user.robloxUserId}
                </div>
                {/* Stats */}
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
                </div>

                {/* Rescan Button */}
                <button
                  onClick={handleRescan}
                  disabled={loading}
                  className="w-full mt-4 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                >
                  {loading ? 'Scanning...' : 'Rescan Inventory'}
                </button>
              </div>
            </div>
          </div>

          {/* Right Side - Graph */}
          <div className="flex-1 min-h-[400px]">
            <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 h-full">
              <InventoryGraph 
                data={graphData} 
                onPointClick={handleGraphPointClick}
              />
            </div>
          </div>
        </div>

        {/* Inventory Grid - Full Width Below */}
        <div>
          <ClientInventoryGrid items={inventory as any[]} scannedTime={scannedTime} />
        </div>
      </div>

      {/* Snapshot Modal */}
      <SnapshotModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        snapshotId={selectedSnapshot?.id || null}
        snapshotDate={selectedSnapshot?.date || ''}
      />
    </div>
  );
}