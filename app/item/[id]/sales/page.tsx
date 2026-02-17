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
  rapAfterSale?: number;
  rapBeforeSale?: number;
  rapAtSale?: number;
  previousRap?: number;
  rapDifference?: number;
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
  const [currentRap, setCurrentRap] = useState<number | null>(null);
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
        setSales(salesRes.data.sales);
        setCurrentRap(salesRes.data.currentRap);
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-slate-400">Loading sales history...</p>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8">
            <h1 className="text-3xl font-bold text-red-400 mb-4">Error</h1>
            <p className="text-slate-400">{error || 'Item not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  const avgPrice = sales.length > 0
    ? sales.reduce((sum, s) => sum + s.salePrice, 0) / sales.length
    : 0;

  return (
    <div className="min-h-screen bg-slate-900 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Button */}
        <button
          onClick={() => router.push(`/item/${itemId}`)}
          className="text-purple-400 hover:text-purple-300 transition flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Item
        </button>

        {/* Header Card - Item Info */}
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
          <div className="flex items-start gap-6">
            {/* Item Thumbnail */}
            <div className="w-32 h-32 bg-slate-700/50 rounded-lg overflow-hidden flex-shrink-0">
              {item.imageUrl ? (
                <img 
                  src={item.imageUrl} 
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Item Details */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white mb-2">
                {item.name}
              </h1>
              <p className="text-slate-400 text-sm uppercase tracking-wider">Sales History</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">Current RAP</div>
            <div className="text-green-400 text-3xl font-bold">
              {currentRap ? currentRap.toLocaleString() : 'N/A'} R$
            </div>
          </div>
          <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">Average Sale Price</div>
            <div className="text-blue-400 text-3xl font-bold">
              {avgPrice > 0 ? Math.round(avgPrice).toLocaleString() : 'N/A'} R$
            </div>
          </div>
        </div>

        {/* Sales History Table */}
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-700">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Transaction History
            </h2>
            <p className="text-slate-400 text-sm mt-1">All recorded sales for this item</p>
          </div>
          
          {sales.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/30">
                  <tr className="border-b border-slate-700">
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">
                      Sale Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">
                      RAP
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">
                      Seller
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">
                      Buyer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">
                      Serial #
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {sales.map((sale) => {
                    const rapIncreased = sale.rapDifference && sale.rapDifference > 0;
                    const rapDecreased = sale.rapDifference && sale.rapDifference < 0;
                    
                    return (
                      <tr 
                        key={sale.id} 
                        className={`transition-colors ${
                          rapIncreased 
                            ? 'hover:bg-green-900/40 bg-green-900/30' 
                            : rapDecreased 
                            ? 'hover:bg-red-900/40 bg-red-900/30' 
                            : 'hover:bg-slate-700/20'
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="text-slate-300 text-sm">
                            {new Date(sale.saleDate).toLocaleString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-blue-400 font-semibold">
                            {sale.salePrice.toLocaleString()} R$
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-green-400 font-semibold">
                            {sale.rapAfterSale ? sale.rapAfterSale.toLocaleString() : 'N/A'} R$
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-slate-400 text-sm">
                            {sale.sellerUsername || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-slate-400 text-sm">
                            {sale.buyerUsername || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-sm font-semibold ${sale.serialNumber ? 'text-orange-400' : 'text-slate-500'}`}>
                            {sale.serialNumber ? `#${sale.serialNumber}` : 'N/A'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <div className="w-12 h-12 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-slate-500">No sales recorded yet</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}