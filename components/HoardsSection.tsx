// components/HoardsSection.tsx
'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface HoardEntry {
  robloxUserId: string;
  username: string;
  avatarUrl: string | null;
  count: number;
  copies: { userAssetId: string; serialNumber: number | null }[];
  scannedAt: string;
}

interface HoardsSectionProps {
  itemId: string;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const intervals: [string, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of intervals) {
    const n = Math.floor(seconds / secs);
    if (n >= 1) return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

export default function HoardsSection({ itemId }: HoardsSectionProps) {
  const [hoards, setHoards] = useState<HoardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    axios
      .get(`/api/items/${itemId}/hoards`)
      .then((res) => setHoards(res.data.hoards || []))
      .catch(() => setHoards([]))
      .finally(() => setLoading(false));
  }, [itemId]);

  const toggleExpand = (userId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-2xl border border-orange-500/20 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            🐉 Hoards
          </h2>
        </div>
        <div className="px-6 py-10 text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading hoards...</p>
        </div>
      </div>
    );
  }

  if (hoards.length === 0) {
    return (
      <div className="bg-slate-800 rounded-2xl border border-orange-500/20 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            🐉 Hoards
            <span className="text-slate-400 text-sm font-normal">(0)</span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">Players holding 2+ copies of this item</p>
        </div>
        <div className="px-6 py-10 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-slate-400">No hoards detected — no tracked player holds multiple copies.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-2xl border border-orange-500/20 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-700">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          🐉 Hoards
          <span className="text-orange-400 text-sm font-normal">({hoards.length} hoarder{hoards.length !== 1 ? 's' : ''})</span>
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Tracked players holding 2 or more copies — sorted by count
        </p>
      </div>

      <div className="divide-y divide-slate-700">
        {hoards.map((h) => {
          const isExpanded = expanded.has(h.robloxUserId);
          return (
            <div key={h.robloxUserId} className="px-6 py-4">
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <a href={`/player/${h.robloxUserId}`} className="flex-shrink-0">
                  {h.avatarUrl ? (
                    <img
                      src={h.avatarUrl}
                      alt={h.username}
                      className="w-10 h-10 rounded-full border border-slate-600 hover:border-orange-400 transition"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center">
                      <span className="text-slate-400 text-xs">?</span>
                    </div>
                  )}
                </a>

                {/* Username + meta */}
                <div className="flex-1 min-w-0">
                  <a
                    href={`/player/${h.robloxUserId}`}
                    className="font-semibold text-white hover:text-orange-400 transition-colors truncate block"
                  >
                    {h.username}
                  </a>
                  <p className="text-slate-500 text-xs">Last scanned {timeAgo(h.scannedAt)}</p>
                </div>

                {/* Count badge */}
                <div className="flex items-center gap-3">
                  <span className="bg-orange-500/20 text-orange-400 border border-orange-500/40 text-sm font-bold px-3 py-1 rounded-full">
                    ×{h.count}
                  </span>

                  {/* Expand toggle */}
                  <button
                    onClick={() => toggleExpand(h.robloxUserId)}
                    className="text-slate-400 hover:text-white transition-colors text-xs"
                    title={isExpanded ? 'Hide copies' : 'Show copies'}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </button>
                </div>
              </div>

              {/* Expanded copies */}
              {isExpanded && (
                <div className="mt-3 ml-14 flex flex-wrap gap-2">
                  {h.copies.map((copy) => (
                    <a
                      key={copy.userAssetId}
                      href={`/uaid/${copy.userAssetId}`}
                      className="bg-slate-700/60 hover:bg-slate-700 border border-slate-600 hover:border-orange-400/50 text-xs text-white px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                    >
                      {copy.serialNumber !== null ? (
                        <span className="text-yellow-400 font-mono">#{copy.serialNumber}</span>
                      ) : (
                        <span className="text-slate-500 italic">no serial</span>
                      )}
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-400 font-mono text-xs">{copy.userAssetId}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}