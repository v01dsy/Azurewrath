// app/player/[userid]/SnapshotModal.tsx
'use client';

import { useState, useEffect } from 'react';

interface SnapshotItem {
  assetId: string;
  name: string;
  imageUrl: string;
  rapThen: number;
  rapNow: number;
  count: number;
}

interface SnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshotId: string | null;
  snapshotDate: string;
}

export default function SnapshotModal({ isOpen, onClose, snapshotId, snapshotDate }: SnapshotModalProps) {
  const [items, setItems] = useState<SnapshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalRapThen, setTotalRapThen] = useState(0);
  const [totalRapNow, setTotalRapNow] = useState(0);

  useEffect(() => {
    if (isOpen && snapshotId) {
      fetchSnapshotData();
    }
  }, [isOpen, snapshotId]);

  const fetchSnapshotData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/snapshot/${snapshotId}`);
      const data = await response.json();
      setItems(data.items);
      setTotalRapThen(data.totalRapThen);
      setTotalRapNow(data.totalRapNow);
    } catch (error) {
      console.error('Failed to fetch snapshot:', error);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  const rapDifference = totalRapNow - totalRapThen;
  const percentChange = totalRapThen > 0 ? ((rapDifference / totalRapThen) * 100).toFixed(2) : 0;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 rounded-2xl border border-purple-500/20 max-w-6xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Snapshot from {snapshotDate}</h2>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-slate-400">RAP Then: </span>
                  <span className="text-purple-400 font-semibold">{totalRapThen.toLocaleString()} R$</span>
                </div>
                <div>
                  <span className="text-slate-400">RAP Now: </span>
                  <span className="text-green-400 font-semibold">{totalRapNow.toLocaleString()} R$</span>
                </div>
                {Math.abs(rapDifference) > 0.01 && (
                  <div>
                    <span className="text-slate-400">Change: </span>
                    <span className={rapDifference > 0 ? 'text-green-400' : 'text-red-400'}>
                      {rapDifference > 0 ? '+' : ''}{rapDifference.toLocaleString()} R$ ({percentChange}%)
                    </span>
                  </div>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">×</button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="text-center text-slate-400 py-12">Loading...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {items.map((item, idx) => {
                const itemDiff = item.rapNow - item.rapThen;
                const itemPercent = item.rapThen > 0 ? ((itemDiff / item.rapThen) * 100).toFixed(1) : '0';
                
                return (
                  <div key={idx} className="bg-slate-700/50 rounded-lg p-3 border border-slate-600/50 hover:border-purple-500/50 transition-colors">
                    <img src={item.imageUrl} alt={item.name} className="w-full aspect-square rounded mb-2" />
                    <h3 className="text-white text-sm font-semibold truncate mb-1">{item.name}</h3>
                    {item.count > 1 && (
                      <div className="text-blue-400 text-xs mb-1">×{item.count}</div>
                    )}
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Then:</span>
                        <span className="text-300">{(item.rapThen * item.count).toLocaleString()} R$</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Now:</span>
                        <span className="text-green-300">{(item.rapNow * item.count).toLocaleString()} R$</span>
                      </div>
                      {Math.abs(itemDiff) > 0.01 && (
                        <div className={`flex justify-between font-semibold ${itemDiff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          <span>{itemDiff > 0 ? '+' : ''}{itemPercent}%</span>
                          <span>{itemDiff > 0 ? '+' : ''}{(itemDiff * item.count).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}