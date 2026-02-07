'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import axios from 'axios';

export default function ItemPage({ params }: { params: { id: string } }) {
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchItem();
  }, [params.id]);

  const fetchItem = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/items/${params.id}`);
      setItem(res.data);
    } catch (err) {
      setError('Item not found');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-12">Loading item...</div>;
  if (error) return <div className="text-center py-12 text-red-400">{error}</div>;
  if (!item) return <div className="text-center py-12">Item not found</div>;

  const chartData = (item.priceHistory || [])
    .slice()
    .reverse()
    .slice(-30)
    .map((ph: any) => ({
      date: new Date(ph.timestamp).toLocaleDateString(),
      price: ph.price,
      rap: ph.rap,
      lowest: ph.lowestResale,
    }));

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-6">
        {item.imageUrl && (
          <img src={item.imageUrl} alt={item.name} className="w-48 h-48 object-contain" />
        )}
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-4xl font-bold glow-purple">{item.name}</h1>
            <p className="text-slate-400 mt-1">Asset ID: {item.assetId}</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-azure-500/10 to-transparent border border-azure-500/20 rounded-lg p-4">
              <div className="text-sm text-slate-400">Current Price</div>
              <div className="text-3xl font-bold">ᴿ {item.priceHistory?.[0]?.price.toLocaleString()}</div>
            </div>
            
            <div className="bg-gradient-to-br from-neon-purple/10 to-transparent border border-neon-purple/20 rounded-lg p-4">
              <div className="text-sm text-slate-400">7-Day Average</div>
              <div className="text-3xl font-bold">ᴿ {item.marketTrends?.avgPrice7d?.toLocaleString()}</div>
            </div>
            
            <div className="bg-gradient-to-br from-neon-magenta/10 to-transparent border border-neon-magenta/20 rounded-lg p-4">
              <div className="text-sm text-slate-400">Status</div>
              <div className="text-lg font-bold capitalize">{item.marketTrends?.trend || 'stable'}</div>
            </div>
            
            <div className="bg-gradient-to-br from-slate-500/10 to-transparent border border-slate-500/20 rounded-lg p-4">
              <div className="text-sm text-slate-400">Demand</div>
              <div className="text-lg font-bold capitalize">{item.marketTrends?.demandRating || 'moderate'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">30-Day Price History</h2>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" />
            <Tooltip 
              background={{ fill: '#1F2937' }}
              contentStyle={{ border: '1px solid #4B5563', borderRadius: '8px' }}
            />
            <Legend />
            <Line type="monotone" dataKey="price" stroke="#0066ff" dot={false} />
            <Line type="monotone" dataKey="rap" stroke="#8b5cf6" dot={false} />
            <Line type="monotone" dataKey="lowest" stroke="#ec4899" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
