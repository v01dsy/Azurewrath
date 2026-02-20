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

  // Fetch sales with embedded RAP data
  const fetchSales = async () => {
    try {
      const response = await fetch('/api/sales?limit=50');
      if (!response.ok) throw new Error('Failed to fetch sales');
      
      const data = await response.json();
      
      // Detect new sales (only if not initial load)
      if (!isInitialLoad) {
        const prevIds = new Set(prevSalesRef.current.map(s => s.id));
        const newIds = new Set<string>();
        
        data.sales.forEach((sale: Sale) => {
          if (!prevIds.has(sale.id)) {
            newIds.add(sale.id);
          }
        });
        
        if (newIds.size > 0) {
          setNewSaleIds(newIds);
          setTimeout(() => {
            setNewSaleIds(new Set());
          }, 800);
        }
      }
      
      prevSalesRef.current = data.sales;
      setSales(data.sales);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  useEffect(() => {
    if (!isMonitoring) return;
    const interval = setInterval(() => {
      fetchSales();
    }, 1000);
    return () => clearInterval(interval);
  }, [isMonitoring]);

  const formatTime = (dateString: string) => {
    const normalized = dateString.endsWith('Z') ? dateString : dateString.replace(' ', 'T') + 'Z';
    const date = new Date(normalized);
    return date.toLocaleTimeString(undefined, { 
      hour: 'numeric', 
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
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

  const getCardStyle = (sale: Sale) => {
    const rapChange = getRapChange(sale);
    if (rapChange === 'up') {
      return { borderColor: 'border-l-[#43e97b]', bgColor: 'bg-[#43e97b]/10' };
    } else if (rapChange === 'down') {
      return { borderColor: 'border-l-[#ef4444]', bgColor: 'bg-[#ef4444]/10' };
    }
    return { borderColor: 'border-l-[#b0b8c1]', bgColor: 'bg-[#1a1a1a]' };
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white p-32 -mt-20">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white p-32 -mt-20">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-6 text-center">
            <p className="text-red-400">Error: {error}</p>
            <button 
              onClick={() => fetchSales()}
              className="mt-4 px-4 py-2 bg-red-500 hover:bg-red-600 rounded transition"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white p-32 -mt-20">
      <style jsx>{`
        @keyframes slideInFromRight {
          from { opacity: 0; transform: translateX(500px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInFromLeft {
          from { opacity: 0; transform: translateX(-500px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes pushDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">
            Roblox Limited Sales
          </h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg">
              <div className={`w-3 h-3 rounded-full ${isMonitoring ? 'bg-green-500' : 'bg-red-500'} ${isMonitoring ? 'animate-pulse' : ''}`}></div>
              <span className="text-sm text-gray-300">
                {isMonitoring ? 'Monitoring' : 'Paused'}
              </span>
            </div>
            <button
              onClick={() => setIsMonitoring(!isMonitoring)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-sm"
            >
              {isMonitoring ? 'Pause' : 'Live'}
            </button>
          </div>
        </div>

        {/* Sales List */}
        <div className="space-y-1">
          {sales.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>No sales recorded yet</p>
            </div>
          ) : (
            sales.map((sale) => {
              const cardStyle = getCardStyle(sale);
              const rapChange = getRapChange(sale);
              const discount = getDiscount(sale);
              const dealColor = getDealColor(discount);
              const isNew = newSaleIds.has(sale.id);
              const direction = sale.id.charCodeAt(0) % 2 === 0 ? 'Right' : 'Left';

              return (
                <div
                  key={sale.id}
                  className={`${cardStyle.bgColor} border-l-4 ${cardStyle.borderColor} rounded-lg p-2 transition-all duration-700 flex items-center justify-between`}
                  style={{
                    animation: isNew
                      ? `slideInFrom${direction} 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`
                      : 'none',
                    transition: 'all 0.5s ease-out'
                  }}
                >
                  {/* Left: Item Info */}
                  <div className="flex items-center gap-4 flex-1">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                      {sale.thumbnailUrl ? (
                        <Image
                          src={sale.thumbnailUrl}
                          alt={sale.itemName}
                          width={64}
                          height={64}
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600">
                          ?
                        </div>
                      )}
                    </div>

                    {/* Item Name & Time */}
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-lg font-semibold text-white">
                          {sale.itemName}
                        </h3>
                        {sale.manipulated && (
                          <img
                            src="/Images/manipulated1.png"
                            alt="Manipulated"
                            title="This item's RAP may be manipulated"
                            className="w-5 h-5 flex-shrink-0"
                          />
                        )}
                      </div>
                      <p className="text-sm text-gray-400">
                        {formatTime(sale.saleDate)}
                      </p>
                      {rapChange === 'down' && discount > 0 && (
                        <p className="text-sm font-bold mt-1" style={{ color: dealColor }}>
                          {discount.toFixed(1)}% discount
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Center: Actions */}
                  <div className="flex items-center gap-3">
                    <a
                      href={`https://www.roblox.com/catalog/${sale.assetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-gray-700 rounded transition"
                      title="View on Roblox"
                    >
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                    <a
                      href={`/item/${sale.assetId}`}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition text-sm font-medium"
                    >
                      Details
                    </a>
                  </div>

                  {/* Right: Price Info */}
                  <div className="flex gap-6 ml-6">
                    {sale.salePrice != null && (
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-1">Sale Price</p>
                        <span className="text-lg font-bold text-white">
                          {sale.salePrice.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {sale.oldRap && (
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-1">Old RAP</p>
                        <span className="text-lg font-semibold text-gray-300">
                          {sale.oldRap.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {sale.newRap && (
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-1">New RAP</p>
                        <span
                          className={`text-lg font-semibold ${
                            rapChange === 'up' ? 'text-green-400' :
                            rapChange === 'down' ? 'text-red-400' :
                            'text-gray-300'
                          }`}
                        >
                          {sale.newRap.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Showing {sales.length} recent sales • Auto-refreshing every second</p>
        </div>
      </div>
    </div>
  );
}