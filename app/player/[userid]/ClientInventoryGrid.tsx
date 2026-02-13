'use client';

import { useState } from 'react';

interface InventoryItemDisplay {
  assetId: string;
  name: string;
  imageUrl: string;
  rap: number;
  count: number;
  serialNumbers?: (number | null)[]; // Array of serial numbers for each copy
  userAssetIds?: string[]; // Array of UAIDs
  scannedAt: Date; // 👈 ONLY ADDED THIS LINE
}

export default function ClientInventoryGrid({ items }: { items: InventoryItemDisplay[] }) { // 👈 REMOVED scannedTime prop
  const [sortBy, setSortBy] = useState('rap-high');
  const [showUAIDModal, setShowUAIDModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItemDisplay | null>(null);
  const [uaidSortBy, setUaidSortBy] = useState('uaid-low'); // New state for UAID sorting
  
  // 👇 ADDED THIS FUNCTION
  const formatTimeSince = (date: Date | string) => {
    const now = new Date();
    const scannedDate = new Date(date);
    const diffMs = now.getTime() - scannedDate.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    if (diffDays === 1) return 'yesterday';
    return `${diffDays} days ago`;
  };
  
  // Sort items
  const sortedItems = [...items].sort((a: any, b: any) => {
    switch (sortBy) {
      case 'rap-high':
        return b.rap - a.rap;
      case 'rap-low':
        return a.rap - b.rap;
      case 'total-high':
        return (b.rap * b.count) - (a.rap * a.count);
      case 'total-low':
        return (a.rap * a.count) - (b.rap * b.count);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'serial-low':
        // Sort by lowest serial number (treating null as infinity)
        const aSerial = a.serialNumbers?.filter((s: number | null) => s !== null).sort((x: number, y: number) => x - y)[0] ?? Infinity;
        const bSerial = b.serialNumbers?.filter((s: number | null) => s !== null).sort((x: number, y: number) => x - y)[0] ?? Infinity;
        return aSerial - bSerial;
      default:
        return 0;
    }
  });

  const handleItemClick = (item: InventoryItemDisplay) => {
    if (item.count > 1) {
      setSelectedItem(item);
      setShowUAIDModal(true);
      document.body.style.overflow = 'hidden';
    }
  };

  const closeModal = () => {
    setShowUAIDModal(false);
    setSelectedItem(null);
    document.body.style.overflow = 'unset';
  };

  return (
    <>
      <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 shadow-lg min-h-[400px] flex flex-col justify-center">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Inventory</h2>
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-slate-700 text-white px-4 py-2 rounded-lg border border-purple-500/20 focus:border-purple-500/50 outline-none"
          >
            <option value="rap-high">RAP: High to Low</option>
            <option value="rap-low">RAP: Low to High</option>
            <option value="total-high">Total Value: High to Low</option>
            <option value="total-low">Total Value: Low to High</option>
            <option value="name">Name (A-Z)</option>
            <option value="serial-low">Serial Number: Low to High</option>
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
          {sortedItems.map((item: any) => {
            // Get unique serial numbers and sort them
            const validSerials = item.serialNumbers?.filter((s: number | null) => s !== null).sort((a: number, b: number) => a - b) || [];
            const hasSerials = validSerials.length > 0;

            // Only show UAID button for single-copy items
            const showUAIDButton = item.count === 1 && item.userAssetIds && item.userAssetIds.length === 1;
            const uaid = showUAIDButton ? item.userAssetIds[0] : null;

            return (
              <div 
                key={item.assetId} 
                className="bg-slate-700 rounded-lg p-4 border border-purple-500/10 hover:border-purple-500/30 transition-all flex flex-col"
              >
                <div className="aspect-square bg-slate-600 rounded mb-2 overflow-hidden relative flex items-center justify-center">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                  {/* Serial number badge overlay - ONLY display method */}
                  {hasSerials && (
                    <div className="absolute top-1 right-1 bg-orange-500/90 text-white text-xs font-bold px-2 py-1 rounded shadow-lg">
                      #{validSerials[0]}{validSerials.length > 1 && ` +${validSerials.length - 1}`}
                    </div>
                  )}
                </div>
                <p className="text-white text-sm font-semibold truncate" title={item.name}>
                  {item.name}
                </p>

                <div className="flex justify-between items-center mt-1">
                  {item.count > 1 && (
                    <p className="text-blue-400 text-xs font-bold">x{item.count}</p>
                  )}
                  <p className="text-green-400 text-xs font-semibold ml-auto">
                    {item.rap.toLocaleString()} R$
                  </p>
                </div>
                {item.count > 1 && (
                  <p className="text-slate-400 text-xs mt-1">
                    Total: {(item.rap * item.count).toLocaleString()} R$
                  </p>
                )}
                
                {/* Spacer to push buttons to bottom */}
                <div className="flex-grow"></div>
                
                {/* Buttons section - always at bottom */}
                <div className="mt-2">
                  {/* Owned Copies button for hoarded items */}
                  {item.count > 1 && (
                    <button
                      onClick={() => handleItemClick(item)}
                      className={`w-full ${hasSerials ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-500 hover:bg-blue-600'} text-white text-xs font-bold px-3 py-1 rounded-lg text-center transition-colors`}
                    >
                      Owned Copies
                    </button>
                  )}
                  
                  {/* Single UAID button */}
                  {showUAIDButton && uaid && (
                    
                      <a
                        href={`/uaid/${uaid}`}
                        className="block w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1 rounded-lg text-center transition-colors"
                        title="View UAID details"
                      >
                        Visit UAID Page
                      </a>
                  )}
                </div>
                
                {/* 👇 CHANGED THIS SECTION */}
                {item.scannedAt && (
                  <p className="text-slate-500 text-xs mt-2">
                    Scanned {formatTimeSince(item.scannedAt)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* UAID Modal */}
      {showUAIDModal && selectedItem && (
        <div
          className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 pt-20 p-8 overflow-y-auto"
          onClick={closeModal}
        >
          <div 
            className="bg-slate-800 rounded-2xl border border-purple-500/20 p-4 max-w-xl w-full my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-white text-lg font-semibold">{selectedItem?.name}</h3>
                <p className="text-slate-400 text-xs">
                  {selectedItem?.count} {selectedItem?.count === 1 ? 'copy' : 'copies'} • {selectedItem?.rap?.toLocaleString()} R$ each
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Sort dropdown for UAIDs */}
            <div className="mb-3">
              <select 
                value={uaidSortBy}
                onChange={(e) => setUaidSortBy(e.target.value)}
                className="bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg border border-purple-500/20 focus:border-purple-500/50 outline-none w-full"
              >
                <option value="uaid-low">Low to High</option>
                <option value="uaid-high">High to Low</option>
                <option value="index">Order Acquired</option>
              </select>
            </div>
            
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1">
              {(() => {
                // Create array of objects with index for sorting
                const uaidData = selectedItem?.userAssetIds?.map((uaid, index) => ({
                  uaid,
                  index,
                  serial: selectedItem?.serialNumbers?.[index]
                })) || [];

                // Sort based on selected option
                const sortedUaidData = [...uaidData].sort((a, b) => {
                  switch (uaidSortBy) {
                    case 'index':
                      return a.index - b.index;
                    case 'uaid-low':
                      // If item has serials, sort by serial, otherwise by UAID
                      if (a.serial && b.serial) {
                        return a.serial - b.serial;
                      }
                      const aUaidNum = parseInt(a.uaid) || 0;
                      const bUaidNum = parseInt(b.uaid) || 0;
                      return aUaidNum - bUaidNum;
                    case 'uaid-high':
                      // If item has serials, sort by serial, otherwise by UAID
                      if (a.serial && b.serial) {
                        return b.serial - a.serial;
                      }
                      const aUaidNumHigh = parseInt(a.uaid) || 0;
                      const bUaidNumHigh = parseInt(b.uaid) || 0;
                      return bUaidNumHigh - aUaidNumHigh;
                    default:
                      return 0;
                  }
                });

                return sortedUaidData.map(({ uaid, serial }) => (
                  <a
                    key={uaid}
                    href={`/uaid/${uaid}`}
                    className={`${serial ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-500 hover:bg-blue-600'} text-white text-sm font-mono px-2 py-2 rounded-lg text-center transition-colors truncate block`}
                    title={`UAID: ${uaid}${serial ? ` • Serial #${serial}` : ''}`}
                  >
                    {serial ? `#${serial}` : uaid}
                  </a>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}