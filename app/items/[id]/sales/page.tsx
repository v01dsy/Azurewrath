'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import axios from 'axios';

interface Sale {
  id: string;
  salePrice: number;
  sellerUsername?: string;
  buyerUsername?: string;
  serialNumber?: number;
  saleDate: string;
}

interface ItemInfo {
  id: string;
  name: string;
  assetId: string;
  imageUrl?: string;
}

export default function SalesHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const itemId = params.id as string;
  
  const [item, setItem] = useState<ItemInfo | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    if (item?.name) {
    document.title = `${item.name} | Limited Sales - Azurewrath`;
    }
  }, [item]);



  useEffect(() => {
    const fetchData = async () => {
      try {
        const [itemRes, salesRes] = await Promise.all([
          axios.get(`/api/items/${itemId}`),
          axios.get(`/api/items/${itemId}/sales`),
        ]);
        
        setItem({
          id: itemRes.data.id,
          name: itemRes.data.name,
          assetId: itemRes.data.assetId,
          imageUrl: itemRes.data.imageUrl,
        });
        setSales(salesRes.data);
      } catch (err) {
        setError('Failed to load sales data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (itemId) {
      fetchData();
    }
  }, [itemId]);

  
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="animate-spin text-4xl">⚙️</div>
        <p className="text-slate-400 mt-4">Loading sales history...</p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold text-red-400 mb-4">Error</h1>
        <p className="text-slate-400">{error || 'Item not found'}</p>
      </div>
    );
  }

  const totalSales = sales.length;
  const avgPrice = sales.length > 0
    ? sales.reduce((sum, s) => sum + s.salePrice, 0) / sales.length
    : 0;
  const lowestSale = sales.length > 0
    ? Math.min(...sales.map(s => s.salePrice))
    : 0;
  const highestSale = sales.length > 0
    ? Math.max(...sales.map(s => s.salePrice))
    : 0;

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <button
        onClick={() => router.push(`/items/${itemId}`)}
        className="text-neon-blue hover:text-neon-blue/80 transition"
      >
        ← Back to Item
      </button>

      {/* Header */}
      <div className="flex items-center gap-4">
        {item.imageUrl && (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-20 h-20 rounded-lg border border-neon-blue/30"
          />
        )}
        <div>
          <h1 className="text-4xl font-bold glow-purple">{item.name}</h1>
          <p className="text-slate-400">Sales History</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-neon-blue/10 to-transparent border border-neon-blue/30 rounded-lg p-4">
          <p className="text-slate-400 text-sm mb-1">Total Sales</p>
          <p className="text-2xl font-bold text-neon-blue">{totalSales}</p>
        </div>
        <div className="bg-gradient-to-br from-neon-purple/10 to-transparent border border-neon-purple/30 rounded-lg p-4">
          <p className="text-slate-400 text-sm mb-1">Average Price</p>
          <p className="text-2xl font-bold text-neon-purple">
            {avgPrice > 0 ? avgPrice.toLocaleString() : 'N/A'}
          </p>
        </div>
        <div className="bg-gradient-to-br from-green-500/10 to-transparent border border-green-500/30 rounded-lg p-4">
          <p className="text-slate-400 text-sm mb-1">Lowest Sale</p>
          <p className="text-2xl font-bold text-green-400">
            {lowestSale > 0 ? lowestSale.toLocaleString() : 'N/A'}
          </p>
        </div>
        <div className="bg-gradient-to-br from-red-500/10 to-transparent border border-red-500/30 rounded-lg p-4">
          <p className="text-slate-400 text-sm mb-1">Highest Sale</p>
          <p className="text-2xl font-bold text-red-400">
            {highestSale > 0 ? highestSale.toLocaleString() : 'N/A'}
          </p>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-gradient-to-br from-slate-800/50 to-transparent border border-neon-blue/20 rounded-lg overflow-hidden">
        {sales.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/80">
                <tr className="text-left">
                  <th className="px-6 py-4 text-sm font-semibold text-slate-300">Date</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-300">Price</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-300">Seller</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-300">Buyer</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-300">Serial #</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {new Date(sale.saleDate).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-neon-blue">
                      {sale.salePrice.toLocaleString()} R$
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {sale.sellerUsername || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {sale.buyerUsername || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {sale.serialNumber ? `#${sale.serialNumber}` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-semibold mb-2">No Sales Yet</h3>
            <p className="text-slate-400">
              Sales tracking is active. Check back soon to see transaction history!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
