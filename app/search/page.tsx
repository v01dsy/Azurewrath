'use client';

import { useState } from 'react';
import SearchMenu from '@/components/SearchMenu';

type SearchMode = 'limited' | 'player';

export default function SearchPage() {   
  const [searchMode, setSearchMode] = useState<SearchMode>('limited');

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <h1 className="text-4xl font-bold text-white glow-purple">Search</h1>

        {/* Main Search Card */}
        <div className="bg-slate-800/50 rounded-2xl border border-purple-500/20 p-6">
          {/* Mode Selector - Full Width */}
          <div className="grid grid-cols-2 gap-2 bg-slate-900/50 p-1 rounded-lg border border-slate-700 mb-6">
            <button
              onClick={() => setSearchMode('limited')}
              className={`px-4 py-2 rounded-md font-medium transition-all ${
                searchMode === 'limited'
                  ? 'bg-neon-purple text-white shadow-lg shadow-neon-purple/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Limited Search
            </button>
            <button
              onClick={() => setSearchMode('player')}
              className={`px-4 py-2 rounded-md font-medium transition-all ${
                searchMode === 'player'
                  ? 'bg-neon-blue text-white shadow-lg shadow-neon-blue/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Player Search
            </button>
          </div>

          <SearchMenu mode={searchMode} />
        </div>

        {/* Info Cards Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-slate-800/50 rounded-2xl border border-purple-500/20 p-6">
            <div className="text-3xl mb-3">💎</div>
            <h3 className="text-xl font-semibold mb-2 text-white">Best Deals</h3>
            <p className="text-slate-400">Discover the hottest deals on rare collectibles.</p>
          </div>

          <div className="bg-slate-800/50 rounded-2xl border border-purple-500/20 p-6">
            <div className="text-3xl mb-3">👤</div>
            <h3 className="text-xl font-semibold mb-2 text-white">Your Profile</h3>
            <p className="text-slate-400">Manage your inventory and watchlist.</p>
          </div>
        </div>

        {/* Coming Soon Card */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold mb-4 text-white">Coming Soon</h2>
          <p className="text-slate-400">The trading dashboard is under development. Check back soon!</p>
        </div>
      </div>
    </div>
  );
}