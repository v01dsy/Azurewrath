'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ItemDetail {
  id: string;
  assetId: string;
  name: string;
  imageUrl?: string;
  description?: string;
  priceHistory: Array<{
    id: string;
    price: number;
    rap?: number;
    lowestResale?: number;
    salesVolume?: number;
    timestamp: string;
  }>;
  marketTrends?: {
    id: string;
    trend: string;
    priceDirection: string;
    volatility: number;
    estimatedDemand: number;
  };
}

export default function ItemPage() {
  const params = useParams();
  const router = useRouter();
  const itemId = params.id as string;
  
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchItem = async () => {
      try {
        const response = await axios.get(`/api/items/${itemId}`);
        setItem(response.data);
      } catch (err) {
        setError('Failed to load item details');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (itemId) {
      fetchItem();
    }
  }, [itemId]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="animate-spin text-4xl">⚙️</div>
        <p className="text-slate-400 mt-4">Loading item details...</p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold text-red-400 mb-4">Oops!</h1>
        <p className="text-slate-400">{error || 'Item not found'}</p>
      </div>
    );
  }

  const chartData = item.priceHistory
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(ph => ({
      timestamp: new Date(ph.timestamp).toLocaleDateString(),
      price: ph.price,
      rap: ph.rap,
    }));

  const currentPrice = item.priceHistory[0]?.lowestResale ?? item.priceHistory[0]?.price;
  const currentRAP = item.priceHistory[0]?.rap;
  const displayImageUrl = item.imageUrl
    ?? `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=420&height=420&format=png`;

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <button
        onClick={() => window.history.back()}
        className="text-neon-blue hover:text-neon-blue/80 transition"
      >
        ← Back
      </button>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Left: Image & Basic Info */}
        <div className="md:col-span-1 space-y-4">
          {displayImageUrl && (
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg overflow-hidden border border-neon-blue/20 aspect-square flex items-center justify-center">
              <img
                src={displayImageUrl}
                alt={item.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="bg-gradient-to-br from-slate-800/50 to-transparent border border-neon-blue/20 rounded-lg p-6 space-y-4">
            <div>
              <p className="text-slate-400 text-sm mb-1">Asset ID</p>
              <p className="text-white font-mono">{item.assetId}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm mb-1">Current Price</p>
              <p className="text-3xl font-bold text-neon-blue">
                {currentPrice?.toLocaleString() || 'N/A'} Robux
              </p>
            </div>
            {currentRAP && (
              <div>
                <p className="text-slate-400 text-sm mb-1">Recent Average Price</p>
                <p className="text-xl text-neon-purple">{currentRAP.toLocaleString()} Robux</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Details & Chart */}
        <div className="md:col-span-2 space-y-6">
          <div>
            <h1 className="text-4xl font-bold glow-purple mb-2">{item.name}</h1>
            {item.description && (
              <p className="text-slate-400 text-lg">{item.description}</p>
            )}
          </div>

          {/* Price Trend Chart */}
          {chartData.length > 0 && (
            <div className="bg-gradient-to-br from-slate-800/50 to-transparent border border-neon-blue/20 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Price History</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="timestamp" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #60a5fa',
                      borderRadius: '8px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#3b82f6"
                    dot={false}
                    strokeWidth={2}
                    name="Price"
                  />
                  {chartData[0].rap && (
                    <Line
                      type="monotone"
                      dataKey="rap"
                      stroke="#a855f7"
                      dot={false}
                      strokeWidth={2}
                      name="RAP"
                      strokeDasharray="5 5"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Market Trends */}
          {item.marketTrends && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-neon-blue/10 to-transparent border border-neon-blue/30 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-1">Trend</p>
                <p className="text-lg font-semibold text-neon-blue capitalize">
                  {item.marketTrends.trend}
                </p>
              </div>
              <div className="bg-gradient-to-br from-neon-purple/10 to-transparent border border-neon-purple/30 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-1">Volatility</p>
                <p className="text-lg font-semibold text-neon-purple">
                  {(item.marketTrends.volatility * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-gradient-to-br from-neon-magenta/10 to-transparent border border-neon-magenta/30 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-1">Demand</p>
                <p className="text-lg font-semibold text-neon-magenta">
                  {item.marketTrends.estimatedDemand}/10
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={() => router.push(`/items/${item.assetId}/sales`)}
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition"
            >
              View Sales History 📊
            </button>
            <button className="flex-1 bg-gradient-to-r from-neon-blue to-neon-purple px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition">
              Add to Watchlist 👁️
            </button>
            <a
              href={`https://www.roblox.com/catalog/${item.assetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-gradient-to-r from-neon-purple to-neon-magenta px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition text-center"
            >
              View on Roblox 🔗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
