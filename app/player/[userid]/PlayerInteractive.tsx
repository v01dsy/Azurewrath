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
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();

  // On mount: trigger a background rescan if the snapshot is stale.
  // When the scan is in flight, show a "Refreshing inventory…" badge and keep
  // polling until the Python worker marks the job done, then auto-refresh so
  // newly acquired items appear without the user having to reload the page.
  useEffect(() => {
    if (isPrivate || !hasInventory) return;

    let active = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function triggerAndPoll() {
      try {
        // Initial ping — also queues a ScanJob if snapshot is > 5 min old.
        const res = await fetch(`/api/player/${user.robloxUserId}`);
        if (!res.ok || !active) return;
        const data = await res.json();

        // If no scan job was queued (data is already fresh), nothing to do.
        if (!data.scanning || !active) return;

        setSyncing(true);

        // Poll every 8 seconds until the job is no longer pending/running.
        pollInterval = setInterval(async () => {
          if (!active) return;
          try {
            const pr = await fetch(`/api/player/${user.robloxUserId}`);
            if (!pr.ok) return;
            const pd = await pr.json();
            if (!pd.scanning) {
              clearInterval(pollInterval!);
              if (timeoutId) clearTimeout(timeoutId);
              if (active) {
                setSyncing(false);
                router.refresh();
              }
            }
          } catch { /* ignore transient errors */ }
        }, 8_000);

        // Safety valve: stop after 5 minutes regardless.
        timeoutId = setTimeout(() => {
          active = false;
          if (pollInterval) clearInterval(pollInterval);
          setSyncing(false);
        }, 5 * 60 * 1_000);
      } catch { /* ignore transient errors */ }
    }

    triggerAndPoll();

    return () => {
      active = false;
      if (pollInterval) clearInterval(pollInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [user.robloxUserId, isPrivate, hasInventory, router]);

  // Trigger scan + poll until inventory appears
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
        {/* Subtle badge shown while a background scan is in flight */}
        {syncing && (
          <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/30 rounded-full px-2.5 py-1 z-10">
            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
            <span className="text-purple-400 text-xs font-medium">Refreshing inventory…</span>
          </div>
        )}
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
  );
}