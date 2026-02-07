'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface Item {
  id: string;
  assetId: string;
  name: string;
  imageUrl: string;
  priceHistory: { price: number; timestamp: string }[];
  marketTrends: {
    avgPrice7d: number;
    priceChange7d: number;
    trend: string;
    demandRating: string;
  };
}

export default function DashboardPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/items?limit=50');
      setItems(res.data.items);
    } catch (err) {
      setError('Failed to load items');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="text-center py-12 text-red-400">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-azure-500/10 to-transparent border border-azure-500/20 rounded-lg p-4">
          <div className="text-sm text-slate-400">Total Items</div>
          <div className="text-3xl font-bold">{items.length}</div>
        </div>
        
        <div className="bg-gradient-to-br from-neon-purple/10 to-transparent border border-neon-purple/20 rounded-lg p-4">
          <div className="text-sm text-slate-400">Avg 7-Day Change</div>
          <div className="text-3xl font-bold text-green-400">+2.5%</div>
        </div>
        
        <div className="bg-gradient-to-br from-neon-magenta/10 to-transparent border border-neon-magenta/20 rounded-lg p-4">
          <div className="text-sm text-slate-400">High Demand</div>
          <div className="text-3xl font-bold">12</div>
        </div>
        
        <div className="bg-gradient-to-br from-slate-500/10 to-transparent border border-slate-500/20 rounded-lg p-4">
          <div className="text-sm text-slate-400">Last Updated</div>
          <div className="text-lg font-bold">2 min ago</div>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-900 border-b border-slate-700">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold">Item Name</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Asset ID</th>
              <th className="px-6 py-3 text-right text-sm font-semibold">Current Price</th>
              <th className="px-6 py-3 text-right text-sm font-semibold">7-Day Avg</th>
              <th className="px-6 py-3 text-right text-sm font-semibold">Trend</th>
              <th className="px-6 py-3 text-right text-sm font-semibold">Demand</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const currentPrice = item.priceHistory?.[0]?.price || 0;
              const avg7d = item.marketTrends?.avgPrice7d || 0;
              const change = item.marketTrends?.priceChange7d || 0;
              const trend = item.marketTrends?.trend || 'stable';
              const demand = item.marketTrends?.demandRating || 'moderate';

              return (
                <tr key={item.id} className="table-row-hover border-b border-slate-700">
                  <td className="px-6 py-4">
                    <a href={`/item/${item.assetId}`} className="text-neon-blue hover:underline">
                      {item.name}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-slate-400">{item.assetId}</td>
                  <td className="px-6 py-4 text-right font-mono">
                    ᴿ {currentPrice.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right font-mono">
                    ᴿ {avg7d.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={change > 0 ? 'price-up' : change < 0 ? 'price-down' : 'price-stable'}>
                      {change > 0 ? '↑' : change < 0 ? '↓' : '→'} {Math.abs(change).toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm uppercase">
                    <span className={
                      demand === 'high' ? 'text-green-400' : demand === 'low' ? 'text-red-400' : 'text-slate-300'
                    }>
                      {demand}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
