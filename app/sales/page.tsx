// app/sales/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

interface Sale {
  id: string;
  itemId: string;
  salePrice: number;
  saleDate: string;
  sellerUsername: string | null;
  buyerUsername: string | null;
  serialNumber: number | null;
  itemName: string;
  assetId: number;
  thumbnailUrl: string | null;
  oldRap: number | null;
  newRap: number | null;
  manipulated: boolean;
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [newSaleIds, setNewSaleIds] = useState<Set<string>>(new Set());
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const prevSalesRef = useRef<Sale[]>([]);

  const fetchSales = async () => {
    try {
      const response = await fetch('/api/sales?limit=50');
      if (!response.ok) throw new Error('Failed to fetch sales');
      const data = await response.json();

      if (!isInitialLoad) {
        const prevIds = new Set(prevSalesRef.current.map(s => s.id));
        const newIds = new Set<string>();
        data.sales.forEach((sale: Sale) => {
          if (!prevIds.has(sale.id)) newIds.add(sale.id);
        });
        if (newIds.size > 0) {
          setNewSaleIds(newIds);
          setTimeout(() => setNewSaleIds(new Set()), 800);
        }
      }

      prevSalesRef.current = data.sales;
      setSales(data.sales);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      if (isInitialLoad) setIsInitialLoad(false);
    }
  };

  useEffect(() => { fetchSales(); }, []);

  useEffect(() => {
    if (!isMonitoring) return;
    const interval = setInterval(fetchSales, 1000);
    return () => clearInterval(interval);
  }, [isMonitoring]);

  const formatTime = (dateString: string) => {
    const normalized = dateString.endsWith('Z') ? dateString : dateString.replace(' ', 'T') + 'Z';
    return new Date(normalized).toLocaleTimeString(undefined, {
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });
  };

  const getRapChange = (sale: Sale) => {
    if (!sale.oldRap || !sale.newRap) return null;
    return sale.newRap > sale.oldRap ? 'up' : 'down';
  };

  const getDiscount = (sale: Sale) => {
    if (!sale.oldRap) return 0;
    return ((sale.oldRap - sale.salePrice) / sale.oldRap) * 100;
  };

  const getDealColor = (discount: number) => {
    if (discount >= 75) return '#ff4f81';
    if (discount >= 50) return '#ffd700';
    if (discount >= 40) return '#a259f7';
    if (discount >= 30) return '#4fc3f7';
    if (discount >= 20) return '#43e97b';
    return '#b0b8c1';
  };

  const getBorderColor = (sale: Sale) => {
    const rapChange = getRapChange(sale);
    if (rapChange === 'up') return '#43e97b';
    if (rapChange === 'down') return '#ef4444';
    return '#b0b8c1';
  };

  const getBgColor = (sale: Sale) => {
    const rapChange = getRapChange(sale);
    if (rapChange === 'up') return 'rgba(67,233,123,0.07)';
    if (rapChange === 'down') return 'rgba(239,68,68,0.07)';
    return 'rgba(26,26,26,1)';
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-24 px-4 pb-8 flex items-center justify-center">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-24 px-4 pb-8">
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-6 text-center">
          <p className="text-red-400">Error: {error}</p>
          <button onClick={fetchSales} className="mt-4 px-4 py-2 bg-red-500 hover:bg-red-600 rounded transition">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-24 px-4 md:px-32 pb-8 md:pb-12">
      <style jsx>{`
        @keyframes slideInFromRight {
          from { opacity: 0; transform: translateX(500px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInFromLeft {
          from { opacity: 0; transform: translateX(-500px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-white">Roblox Limited Sales</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-lg">
              <div className={`w-2.5 h-2.5 rounded-full ${isMonitoring ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-300">{isMonitoring ? 'Monitoring' : 'Paused'}</span>
            </div>
            <button
              onClick={() => setIsMonitoring(!isMonitoring)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-sm"
            >
              {isMonitoring ? 'Pause' : 'Live'}
            </button>
          </div>
        </div>

        {/* Sales List */}
        <div className="space-y-1">
          {sales.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No sales recorded yet</div>
          ) : (
            sales.map((sale) => {
              const rapChange = getRapChange(sale);
              const discount = getDiscount(sale);
              const dealColor = getDealColor(discount);
              const isNew = newSaleIds.has(sale.id);
              const direction = sale.id.charCodeAt(0) % 2 === 0 ? 'Right' : 'Left';

              return (
                <div
                  key={sale.id}
                  className="rounded-lg p-2 transition-all duration-700"
                  style={{
                    background: getBgColor(sale),
                    borderLeft: `4px solid ${getBorderColor(sale)}`,
                    animation: isNew
                      ? `slideInFrom${direction} 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`
                      : 'none',
                  }}
                >
                  {/* ── DESKTOP layout (md+): original single-row ── */}
                  <div className="hidden md:flex md:items-center md:justify-between">
                    {/* Left: thumbnail + name/time */}
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-16 h-16 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                        {sale.thumbnailUrl ? (
                          <Image src={sale.thumbnailUrl} alt={sale.itemName} width={64} height={64} className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-600">?</div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-lg font-semibold text-white">{sale.itemName}</h3>
                          {sale.manipulated && (
                            <Image src="/Images/manipulated1.webp" alt="Manipulated" title="This item's RAP may be manipulated" width={20} height={20} className="flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-gray-400">{formatTime(sale.saleDate)}</p>
                        {rapChange === 'down' && discount > 0 && (
                          <p className="text-sm font-bold mt-1" style={{ color: dealColor }}>{discount.toFixed(1)}% discount</p>
                        )}
                      </div>
                    </div>
                    {/* Center: actions */}
                    <div className="flex items-center gap-3">
                      <a href={`https://www.roblox.com/catalog/${sale.assetId}`} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-gray-700 rounded transition" title="View on Roblox">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                      <a href={`/item/${sale.assetId}`} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition text-sm font-medium">Details</a>
                    </div>
                    {/* Right: price stats */}
                    <div className="flex gap-6 ml-6">
                      {sale.salePrice != null && (
                        <div className="text-center">
                          <p className="text-xs text-gray-400 mb-1">Sale Price</p>
                          <span className="text-lg font-bold text-white">{sale.salePrice.toLocaleString()}</span>
                        </div>
                      )}
                      {sale.oldRap != null && (
                        <div className="text-center">
                          <p className="text-xs text-gray-400 mb-1">Old RAP</p>
                          <span className="text-lg font-semibold text-gray-300">{sale.oldRap.toLocaleString()}</span>
                        </div>
                      )}
                      {sale.newRap != null && (
                        <div className="text-center">
                          <p className="text-xs text-gray-400 mb-1">New RAP</p>
                          <span className={`text-lg font-semibold ${rapChange === 'up' ? 'text-green-400' : rapChange === 'down' ? 'text-red-400' : 'text-gray-300'}`}>
                            {sale.newRap.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── MOBILE layout (below md): compact two-row ── */}
                  <div className="md:hidden">
                    {/* Row 1: thumbnail + name/time + actions */}
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                        {sale.thumbnailUrl ? (
                          <Image src={sale.thumbnailUrl} alt={sale.itemName} width={48} height={48} className="object-cover w-full h-full" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-600">?</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <h3 className="font-semibold text-white text-sm truncate">{sale.itemName}</h3>
                          {sale.manipulated && (
                            <Image src="/Images/manipulated1.webp" alt="Manipulated" width={14} height={14} className="flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{formatTime(sale.saleDate)}</p>
                        {rapChange === 'down' && discount > 0 && (
                          <p className="text-xs font-bold" style={{ color: dealColor }}>{discount.toFixed(1)}% discount</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <a href={`https://www.roblox.com/catalog/${sale.assetId}`} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-gray-700 rounded transition">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                        <a href={`/item/${sale.assetId}`} className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition text-xs font-medium whitespace-nowrap">Details</a>
                      </div>
                    </div>
                    {/* Row 2: price stats */}
                    <div className="flex gap-4 mt-2 pt-2 border-t border-white/5">
                      {sale.salePrice != null && (
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Sale Price</p>
                          <span className="text-sm font-bold text-white">{sale.salePrice.toLocaleString()}</span>
                        </div>
                      )}
                      {sale.oldRap != null && (
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Old RAP</p>
                          <span className="text-sm font-semibold text-gray-300">{sale.oldRap.toLocaleString()}</span>
                        </div>
                      )}
                      {sale.newRap != null && (
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide">New RAP</p>
                          <span className={`text-sm font-semibold ${rapChange === 'up' ? 'text-green-400' : rapChange === 'down' ? 'text-red-400' : 'text-gray-300'}`}>
                            {sale.newRap.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          Showing {sales.length} recent sales · Auto-refreshing every second
        </div>
      </div>
    </div>
  );
}