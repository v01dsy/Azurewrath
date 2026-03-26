'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSerialTier, getGhostTier, getCardGlowClass } from '@/lib/specialSerial';
import { SpecialSerialText } from '@/components/specialSerialText';
import Image from 'next/image';


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


const ITEMS_PER_PAGE = 280;

export default function ClientInventoryGrid({ items }: { items: InventoryItemDisplay[] }) {
  const router = useRouter();
  const gridRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState('rap-high');
  const [currentPage, setCurrentPage] = useState(1);
  const [showUAIDModal, setShowUAIDModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItemDisplay | null>(null);
  const [uaidSortBy, setUaidSortBy] = useState('index-reverse');
  const [splitHoards, setSplitHoards] = useState(false);

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
    if (years > 0) return `${years}y ${months % 12}mo ${days % 30}d ago`;
    if (months > 0) return `${months}mo ${days % 30}d ago`;
    if (days > 0) return `${days}d ${hours % 24}h ago`;
    if (hours > 0) return `${hours}h ${mins % 60}m ago`;
    return `${mins}m ago`;
  };

  // Split hoards into individual cards when splitHoards is enabled.
  // Sorting is applied after this so split cards are sorted by their own values.
  const displayItems = splitHoards
    ? items.flatMap(item =>
        item.count > 1
          ? (item.userAssetIds ?? []).map((uaid, i) => ({
              ...item,
              count: 1,
              userAssetIds: [uaid],
              serialNumbers: [item.serialNumbers?.[i] ?? null],
              scannedAts: [item.scannedAts?.[i] ?? null],
              uaidUpdatedAts: [item.uaidUpdatedAts?.[i] ?? null],
            }))
          : [item]
      )
    : items;

  const sortedDisplayItems = [...displayItems].sort((a, b) => {
    switch (sortBy) {
      case 'rap-high': return b.rap - a.rap;
      case 'rap-low': return a.rap - b.rap;
      case 'total-high': return (b.rap * b.count) - (a.rap * a.count);
      case 'total-low': return (a.rap * a.count) - (b.rap * b.count);
      case 'name': return a.name.localeCompare(b.name);
      case 'acquired-newest':
        const aLatestUaidUpdatedAt = Math.max(...(a.uaidUpdatedAts?.map((d) => d ? new Date(d).getTime() : 0) ?? [0]));
        const bLatestUaidUpdatedAt = Math.max(...(b.uaidUpdatedAts?.map((d) => d ? new Date(d).getTime() : 0) ?? [0]));
        return bLatestUaidUpdatedAt - aLatestUaidUpdatedAt;
      case 'serial-low':
        const aSerial = a.serialNumbers?.filter((s: number | null) => s !== null).sort((x: number, y: number) => x - y)[0] ?? Infinity;
        const bSerial = b.serialNumbers?.filter((s: number | null) => s !== null).sort((x: number, y: number) => x - y)[0] ?? Infinity;
        return aSerial - bSerial;
      default: return 0;
    }
  });

  const totalPages = Math.ceil(displayItems.length / ITEMS_PER_PAGE);
  const pagedItems = sortedDisplayItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

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
      <div ref={gridRef} className="bg-[#1e1e1e] rounded-xl border border-white/10 p-8 shadow-lg flex flex-col" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">
            Inventory
            <span className="text-[#555] font-normal text-base ml-2">{displayItems.length} items</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSplitHoards(h => !h); setCurrentPage(1); }}
              className={`px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                splitHoards
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                  : 'bg-white/5 border-white/10 text-[#aaa] hover:bg-white/10'
              }`}
            >
              Split Hoards
            </button>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
              className="bg-[#1e1e1e] text-[#ccc] px-4 py-2 rounded-lg border border-white/10 focus:border-white/30 outline-none"
            >
              <option value="rap-high">RAP: High to Low</option>
              <option value="rap-low">RAP: Low to High</option>
              <option value="total-high">Total Value: High to Low</option>
              <option value="total-low">Total Value: Low to High</option>
              <option value="name">Name (A-Z)</option>
              <option value="acquired-newest">Acquired: Newest First</option>
              <option value="serial-low">Serial Number: Low to High</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
          {pagedItems.map((item: any, index: number) => {
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
                key={`${item.assetId}-${index}`}
                className="bg-white/5 rounded-lg p-4 pb-3 border border-white/10 hover:border-white/25 transition-all flex flex-col cursor-pointer h-full"
                onClick={() => router.push(`/item/${item.assetId}`)}
              >
                {/* ── Image ── */}
                <div className="aspect-square bg-white/5 rounded mb-2 overflow-hidden relative flex items-center justify-center">
                  <Image
                    src={item.imageUrl || '/fallback.png'}
                    alt={item.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 15vw"
                    className="object-cover"
                    loading="lazy"
                  />

                  {item.manipulated && (
                    <div className="absolute top-1 left-1">
                      <Image src="/Images/manipulated1.png" alt="Manipulated" title="This item's RAP may be manipulated" width={24} height={24} />
                    </div>
                  )}

                  {item.isOnHold === true && (
                    <div className="absolute bottom-1 right-1">
                      <Image src="/Images/hold.png" alt="On Hold" title="This item is on hold and cannot be traded" width={24} height={24} />
                    </div>
                  )}

                  {item.count > 1 && (
                    <div className="absolute bottom-0 left-1 translate-y-0">
                      <span className="text-sm font-bold italic leading-none block" style={{ color: '#4fc3f7', marginBottom: '3px' }}>x{item.count}</span>
                    </div>
                  )}

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

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button
              onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); gridRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm disabled:opacity-30 hover:bg-white/10 transition"
            >
              ← Prev
            </button>
            <span className="text-[#888] text-sm">{currentPage} / {totalPages}</span>
            <button
              onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); gridRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm disabled:opacity-30 hover:bg-white/10 transition"
            >
              Next →
            </button>
          </div>
        )}
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
                  uaidUpdatedAt: selectedItem?.uaidUpdatedAts?.[index] ?? null,
                })) || [];

                const sortedUaidData = [...uaidData].sort((a, b) => {
                  switch (uaidSortBy) {
                    case 'index':
                      const aTime = a.uaidUpdatedAt ? new Date(a.uaidUpdatedAt).getTime() : 0;
                      const bTime = b.uaidUpdatedAt ? new Date(b.uaidUpdatedAt).getTime() : 0;
                      return aTime - bTime;
                    case 'index-reverse':
                      const aTimeR = a.uaidUpdatedAt ? new Date(a.uaidUpdatedAt).getTime() : 0;
                      const bTimeR = b.uaidUpdatedAt ? new Date(b.uaidUpdatedAt).getTime() : 0;
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
                              <p className="text-[#ccc] font-bold mb-1 text-center">{acquiredTimeSince(uaidUpdatedAt)}</p>
                              <p className="text-[#ccc] font-bold">
                                {new Date(uaidUpdatedAt).toLocaleString(undefined, {
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