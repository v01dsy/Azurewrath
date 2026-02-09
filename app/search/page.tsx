'use client';

import SearchMenu from '@/components/SearchMenu';

export default function DashboardPage() {   
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-4xl font-bold glow-purple">Dashboard</h1>
      
      <div className="bg-gradient-to-br from-slate-800/50 to-transparent border border-neon-blue/20 rounded-lg p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Search Items</h2>
        <SearchMenu />
      </div>
      
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-neon-purple/10 to-transparent border border-neon-purple/20 rounded-lg p-6">
          <div className="text-3xl mb-3">💎</div>
          <h3 className="text-xl font-semibold mb-2">Best Deals</h3>
          <p className="text-slate-400">Discover the hottest deals on rare collectibles.</p>
        </div>

        <div className="bg-gradient-to-br from-neon-magenta/10 to-transparent border border-neon-magenta/20 rounded-lg p-6">
          <div className="text-3xl mb-3">👤</div>
          <h3 className="text-xl font-semibold mb-2">Your Profile</h3>
          <p className="text-slate-400">Manage your inventory and watchlist.</p>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">Coming Soon</h2>
        <p className="text-slate-400">The trading dashboard is under development. Check back soon!</p>
      </div>
    </div>
  );
}
