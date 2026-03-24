// Replace the entire file with this:
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import InventoryGraph from './InventoryGraph';
import DevLoginButton from '@/components/DevLoginButton';

interface GraphDataPoint {
  snapshotId: string;
  date: string;
  timestamp: number;
  rap: number;
  itemCount: number;
  uniqueCount: number;
}

interface PlayerInteractiveProps {
  graphData: GraphDataPoint[];
  user: {
    robloxUserId: string;
    username: string;
    displayName: string | null;
    description: string | null;
  };
  isPrivate: boolean;
  hasInventory: boolean;
}

export default function PlayerInteractive({ graphData, user, isPrivate, hasInventory }: PlayerInteractiveProps) {
  const [scanning, setScanning] = useState(!hasInventory && !isPrivate);
  const [rescanning, setRescanning] = useState(false);
  const router = useRouter();

  // Always ping on mount to trigger background rescan if snapshot is stale
  useEffect(() => {
    if (isPrivate) return;
    fetch(`/api/player/${user.robloxUserId}`).catch(() => {});
  }, [user.robloxUserId, isPrivate]);

  // Poll ScanJob status to show rescanning indicator on existing inventories
  useEffect(() => {
    if (isPrivate || !hasInventory) return;

    let interval: NodeJS.Timeout;

    async function checkScanJob() {
      try {
        const res = await fetch(`/api/player/${user.robloxUserId}/scan-status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.scanning) {
          setRescanning(true);
          // Keep polling until done
          interval = setInterval(async () => {
            try {
              const r = await fetch(`/api/player/${user.robloxUserId}/scan-status`);
              const d = await r.json();
              if (!d.scanning) {
                clearInterval(interval);
                setRescanning(false);
                router.refresh();
              }
            } catch { /* silent */ }
          }, 3000);
        }
      } catch { /* silent */ }
    }

    checkScanJob();
    return () => clearInterval(interval);
  }, [hasInventory, isPrivate, user.robloxUserId, router]);

  // First-time scan: trigger + poll until inventory appears
  useEffect(() => {
    if (hasInventory || isPrivate) return;

    fetch(`/api/player/${user.robloxUserId}`).catch(() => {});

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/player/${user.robloxUserId}`);
        const data = await res.json();
        if (data.inventory?.length > 0) {
          clearInterval(interval);
          setScanning(false);
          router.refresh();
        }
      } catch { /* silent */ }
    }, 5000);

    return () => clearInterval(interval);
  }, [hasInventory, isPrivate, user.robloxUserId, router]);

  const handleGraphPointClick = (snapshotId: string, date: string) => {
    router.push(`/history/${user.robloxUserId}`);
  };

  return (
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
        ) : scanning ? (
          <div className="flex items-center justify-center flex-1">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500 mx-auto mb-4" />
              <p className="text-[#aaa] text-sm">Scanning inventory for the first time...</p>
              <p className="text-[#666] text-xs mt-1">This may take a moment</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            {rescanning && (
              <div className="flex items-center gap-2 text-xs text-purple-300 mb-3 px-1">
                <div className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                Refreshing inventory in background…
              </div>
            )}
            <div style={{ height: 'clamp(280px, 50vw, 540px)' }}>
              <InventoryGraph data={graphData} onPointClick={handleGraphPointClick} />
            </div>
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
  );
}