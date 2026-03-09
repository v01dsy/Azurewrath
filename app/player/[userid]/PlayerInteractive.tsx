'use client';

import { useState } from 'react';
import Link from 'next/link';
import InventoryGraph from './InventoryGraph';
import SnapshotModal from './SnapshotModal';
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
}

export default function PlayerInteractive({ graphData, user, isPrivate }: PlayerInteractiveProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<{ id: string; date: string } | null>(null);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);

  const handleGraphPointClick = (snapshotId: string, date: string) => {
    setSelectedSnapshot({ id: snapshotId, date });
    setShowModal(true);
  };

  return (
    <>
      {/* Description "View more" button */}
      {user.description && user.description.length > 40 && (
        <button
          onClick={() => setShowDescriptionModal(true)}
          className="text-purple-400 hover:text-purple-300 text-xs mt-1 transition"
        >
          View more
        </button>
      )}

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
    </>
  );
}