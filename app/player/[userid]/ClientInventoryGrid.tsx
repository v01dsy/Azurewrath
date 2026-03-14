'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSerialTier, getGhostTier, getCardGlowClass } from '@/lib/specialSerial';
import { SpecialSerialText } from '@/components/specialSerialText';

interface InventoryItemDisplay {
  assetId: string;
  name: string;
  imageUrl: string;
  rap: number;
  count: number;
  manipulated: boolean;
  isOnHold?: boolean | null;
  isLimitedUnique?: boolean | null;
  serialNumbers?: (number | null)[];
  userAssetIds?: string[];
  scannedAt: Date;
  scannedAts?: (Date | null)[];
  uaidUpdatedAts?: (Date | null)[];
}

export default function ClientInventoryGrid({ items }: { items: InventoryItemDisplay[] }) {
  const router = useRouter();
  const [sortBy, setSortBy] = useState('rap-high');
  const [showUAIDModal, setShowUAIDModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItemDisplay | null>(null);
  const [uaidSortBy, setUaidSortBy] = useState('index-reverse');

  const formatTimeSince = (date: Date | string) => {
    const now = new Date();
    const scannedDate = new Date(date);
    const diffMs = now.getTime() - scannedDate.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return '1d ago';
    if (diffDays < 30) return `${diffDays}d ago`;
    if (diffMonths < 12) return `${diffMonths}mo ago`;
    return `${Math.floor(diffMonths / 12)}y ago`;
  };

  const acquiredTimeSince = (date: Date | string) => {
    const diffMs = new Date().getTime() - new Date(date).getTime();
    const mins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(months / 12);
    if (years > 0) return `${years} year${years === 1 ? '' : 's'} ago`;
    if (months > 0) return `${months} month${months === 1 ? '' : 's'} ago`;
    if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
    if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  };

  const acquiredTimeLong = (date: Date | string) => {
    const diffMs = new Date().getTime() - new Date(date).getTime();
    const mins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(months / 12);
    if (years > 0) return `${years}y ${months % 12}mo ago`;
    if (months > 0) return `${months}mo ${days % 30}d ago`;
    if (days > 0) return `${days}d ${hours % 24}h ago`;
    if (hours > 0) return `${hours}h ${mins % 60}m ago`;
    return `${mins}m ago`;
  };

  const sortedItems = [...items].sort((a: any, b: any) => {
    switch (sortBy) {
      case 'rap-high': return b.rap - a.rap;
      case 'rap-low': return a.rap - b.rap;
      case 'total-high': return (b.rap * b.count) - (a.rap * a.count);
      case 'total-low': return (a.rap * a.count) - (b.rap * b.count);
      case 'name': return a.name.localeCompare(b.name);
      case 'serial-low':
        const aSerial = a.serialNumbers?.filter((s: number | null) => s !== null).sort((x: number, y: number) => x - y)[0] ?? Infinity;
        const bSerial = b.serialNumbers?.filter((s: number | null) => s !== null).sort((x: number, y: number) => x - y)[0] ?? Infinity;
        return aSerial - bSerial;
      default: return 0;
    }
  });

  const openModal = (item: InventoryItemDisplay, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItem(item);
    setShowUAIDModal(true);
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    setShowUAIDModal(false);
    setSelectedItem(null);
    document.body.style.overflow = 'unset';
  };

  return (
    <>
      <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-8 shadow-lg min-h-[400px] flex flex-col justify-center">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Inventory</h2>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[#1e1e1e] text-[#ccc] px-4 py-2 rounded-lg border border-white/10 focus:border-white/30 outline-none"
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
            const validSerials = item.serialNumbers?.filter((s: number | null) => s !== null).sort((a: number, b: number) => a - b) || [];
            const hasSerials = validSerials.length > 0;
            const showUAIDButton = item.count === 1 && item.userAssetIds && item.userAssetIds.length === 1;
            const uaid = showUAIDButton ? item.userAssetIds[0] : null;

            const bestSerial: number | null = validSerials[0] ?? null;

            const hasNoSerialAtAll = !item.serialNumbers || item.serialNumbers.every((s: number | null) => s === null);
            const tier = getGhostTier(item.isLimitedUnique, hasNoSerialAtAll ? null : bestSerial)
                      ?? getSerialTier(bestSerial);
            const isSpecial = tier !== null;
            const isGhost = tier === 'ghost';

            return (
              <div
                key={item.assetId}
                className="bg-white/5 rounded-lg p-4 pb-3 border border-white/10 hover:border-white/25 transition-all flex flex-col cursor-pointer h-full"
                onClick={() => router.push(`/item/${item.assetId}`)}
              >
                {/* ── Image ── */}
                <div className="aspect-square bg-white/5 rounded mb-2 overflow-hidden relative flex items-center justify-center">
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />

                  {/* Manipulated — top-left */}
                  {item.manipulated && (
                    <div className="absolute top-1 left-1">
                      <img src="/Images/manipulated1.png" alt="Manipulated"
                        title="This item's RAP may be manipulated"
                        className="w-6 h-6" />
                    </div>
                  )}

                  {/* On Hold — bottom-right */}
                  {item.isOnHold === true && (
                    <div className="absolute bottom-1 right-1">
                      <img src="/Images/hold.png" alt="On Hold"
                        title="This item is on hold and cannot be traded"
                        className="w-6 h-6" />
                    </div>
                  )}

                  {/* Copy count — bottom-left */}
                  {item.count > 1 && (
                    <div className="absolute bottom-0 left-1 translate-y-0">
                      <span className="text-sm font-bold italic leading-none block" style={{ color: '#4fc3f7', marginBottom: '3px' }}>x{item.count}</span>
                    </div>
                  )}

                  {/* Serial badge — top-right */}
                  {(hasSerials || isGhost) && (
                    <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded shadow-lg">
                      {isSpecial
                        ? <SpecialSerialText serial={bestSerial} tier={tier} variant="badge" />
                        : <span className="text-orange-400 text-xs font-bold">
                            #{validSerials[0]}{validSerials.length > 1 && ` +${validSerials.length - 1}`}
                          </span>
                      }
                    </div>
                  )}
                </div>

                {/* ── Name ── */}
                <p className="text-white text-sm font-semibold truncate hover:text-purple-400 transition-colors" title={item.name}>
                  {item.name}
                </p>

                {/* ── RAP row ── */}
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[#888] text-xs">RAP</span>
                  <div className="relative group flex items-center gap-1.5">
                    <span className="text-xs font-semibold" style={{ color: '#43e97b' }}>
                      {item.rap.toLocaleString()} R$
                    </span>
                    {item.count > 1 && (
                      <div className="absolute bottom-full right-0 mb-1.5 z-20 hidden group-hover:block pointer-events-none">
                        <div className="bg-[#111] border border-white/10 rounded-lg px-3 py-1.5 text-xs shadow-xl whitespace-nowrap">
                          <span className="text-[#888]">Total </span>
                          <span className="text-[#43e97b] font-bold">{(item.rap * item.count).toLocaleString()} R$</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Bottom section ── */}
                <div className="mt-auto pt-2">
                  {/* Only show Acquired At for single copies */}
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[#888] text-xs">Acquired</span>
                      <div className="relative group">
                        <span className="text-white font-medium text-xs whitespace-nowrap cursor-default">
                          {item.uaidUpdatedAts?.[0] ? acquiredTimeSince(item.uaidUpdatedAts[0]) : 'Pending'}
                        </span>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 hidden group-hover:block pointer-events-none">
                          <div className="bg-[#111] border border-white/10 rounded-lg px-3 py-1.5 text-xs shadow-xl whitespace-nowrap">
                            {item.uaidUpdatedAts?.[0] ? (
                              <>
                                <p className="text-[#ccc] font-bold mb-1 text-center">
                                  {acquiredTimeLong(item.uaidUpdatedAts[0])}
                                </p>
                                <p className="text-[#ccc] font-bold">
                                  {new Date(item.uaidUpdatedAts[0]).toLocaleString(undefined, {
                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                    hour: '2-digit', minute: '2-digit',
                                  })}
                                </p>
                              </>
                            ) : (
                              <span className="text-[#666]">Unknown</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  {item.count > 1 && (
                    <button
                      onClick={(e) => openModal(item, e)}
                      className={`w-full ${hasSerials ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-500 hover:bg-blue-600'} text-white text-xs font-semibold py-1.5 px-2 rounded-lg transition-colors mb-1`}
                    >
                      Owned Copies
                    </button>
                  )}
                  {showUAIDButton && (
                    <a
                      href={`/uaid/${uaid}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold py-1.5 px-2 rounded-lg transition-colors text-center mb-1"
                    >
                      Visit UAID Page
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── UAID Modal ── */}
      {showUAIDModal && selectedItem && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-[#1e1e1e] border border-white/10 rounded-xl p-6 max-w-xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-white font-bold text-lg">{selectedItem.name}</h3>
                <p className="text-[#aaa] text-sm">
                  {selectedItem.count} {selectedItem.count === 1 ? 'copy' : 'copies'} • {selectedItem?.rap?.toLocaleString()} R$ each
                </p>
              </div>
              <button onClick={closeModal} className="text-[#aaa] hover:text-white transition-colors text-xl leading-none">×</button>
            </div>

            <div className="mb-3">
              <select
                value={uaidSortBy}
                onChange={(e) => setUaidSortBy(e.target.value)}
                className="bg-[#1e1e1e] text-[#ccc] text-xs px-3 py-1.5 rounded-lg border border-white/10 focus:border-white/30 outline-none w-full"
              >
                <option value="uaid-low">Low to High</option>
                <option value="uaid-high">High to Low</option>
                <option value="index">Order Acquired (Oldest First)</option>
                <option value="index-reverse">Order Acquired (Newest First)</option>
              </select>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1">
              {(() => {
                const uaidData = selectedItem?.userAssetIds?.map((uaid, index) => ({
                  uaid,
                  index,
                  serial: selectedItem?.serialNumbers?.[index],
                  scannedAt: selectedItem?.scannedAts?.[index],
                  uaidUpdatedAt: selectedItem?.uaidUpdatedAts?.[index] ?? null,
                })) || [];

                const sortedUaidData = [...uaidData].sort((a, b) => {
                  switch (uaidSortBy) {
                    case 'index':
                      const aTime = a.scannedAt ? new Date(a.scannedAt).getTime() : 0;
                      const bTime = b.scannedAt ? new Date(b.scannedAt).getTime() : 0;
                      return aTime - bTime;
                    case 'index-reverse':
                      const aTimeR = a.scannedAt ? new Date(a.scannedAt).getTime() : 0;
                      const bTimeR = b.scannedAt ? new Date(b.scannedAt).getTime() : 0;
                      return bTimeR - aTimeR;
                    case 'uaid-low':
                      if (a.serial && b.serial) return a.serial - b.serial;
                      return (parseInt(a.uaid) || 0) - (parseInt(b.uaid) || 0);
                    case 'uaid-high':
                      if (a.serial && b.serial) return b.serial - a.serial;
                      return (parseInt(b.uaid) || 0) - (parseInt(a.uaid) || 0);
                    default: return 0;
                  }
                });

                return sortedUaidData.map(({ uaid, serial, uaidUpdatedAt }) => {
                  const btnTier = getGhostTier(selectedItem.isLimitedUnique, serial ?? null)
                               ?? getSerialTier(serial ?? null);
                  const isSpecialBtn = btnTier !== null;

                  return (
                    <div key={uaid} className="relative group">
                      <a href={`/uaid/${uaid}`}
                        className={`py-2 rounded-lg text-center transition-colors truncate block
                          bg-white/5 hover:bg-white/10 border
                          ${isSpecialBtn ? getCardGlowClass(btnTier) : (serial ? 'border-orange-500/40' : 'border-white/10')}`}
                        title=""
                        onClick={(e) => e.stopPropagation()}>
                        {serial != null
                          ? isSpecialBtn
                            ? <SpecialSerialText serial={serial} tier={btnTier} variant="button" />
                            : <span className="text-orange-400 text-xs font-bold">#{serial}</span>
                          : btnTier === 'ghost'
                            ? <SpecialSerialText serial={null} tier="ghost" variant="button" />
                            : <span className="text-blue-400 text-xs font-bold">{uaid}</span>
                        }
                      </a>
                       <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 hidden group-hover:block pointer-events-none">
                          <div className="bg-[#111] border border-white/10 rounded-lg px-3 py-1.5 text-xs shadow-xl whitespace-nowrap">
                            {uaidUpdatedAt ? (
                              <>
                                <p className="text-[#ccc] font-bold mb-1 text-center">{acquiredTimeLong(uaidUpdatedAt)}</p>
                                <p className="text-[#ccc] font-bold">
                                  {new Date(uaidUpdatedAt).toLocaleString(undefined, {
                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                    hour: '2-digit', minute: '2-digit',
                                  })}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-[#ccc] font-bold mb-1 text-center">Pending</p>
                                <p className="text-[#666]">Unknown</p>
                              </>
                            )}
                          </div>
                        </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}