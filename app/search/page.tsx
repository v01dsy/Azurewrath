// app/search/page.tsx
'use client';

import { useState } from 'react';
import SearchMenu from '@/components/SearchMenu';

type SearchMode = 'limited' | 'player';

export default function SearchPage() {   
  const [searchMode, setSearchMode] = useState<SearchMode>('limited');

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12">
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
      </div>
    </div>
  );
}