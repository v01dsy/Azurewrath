// app/trade/new/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getUserSession } from '@/lib/userSession';
import { getSerialTier, getGhostTier } from '@/lib/specialSerial';
import { SpecialSerialText } from '@/components/specialSerialText';

interface ApiInventoryItem {
  assetId: string;
  name: string;
  imageUrl: string | null;
  rap: number;
  count: number;
  isLimitedUnique?: boolean | null;
  userAssetIds: string[];
  serialNumbers: (number | null)[];
}

// A single copy of an item — used when stack is split
interface FlatInventoryItem {
  assetId: string;
  name: string;
  imageUrl: string | null;
  rap: number;
  isLimitedUnique?: boolean | null;
  userAssetId: string;
  serialNumber: number | null;
  // Keep full arrays for the serial picker
  allUserAssetIds: string[];
  allSerialNumbers: (number | null)[];
  count: number; // original stack count (for reference)
}

interface SelectedOfferItem {
  assetId: string;
  userAssetId: string | null;
  serialNumber: number | null;
  name: string;
  imageUrl: string | null;
  rap: number;
  isLimitedUnique?: boolean | null;
  userAssetIds: string[];
  serialNumbers: (number | null)[];
}

interface SelectedOfferItemWithSlot extends SelectedOfferItem {
  _slotIndex: number;
}

import Pagination from '@/components/Pagination';

interface SearchResult {
  assetId: string;
  name: string;
  imageUrl: string | null;
  isLimitedUnique?: boolean | null;
  priceHistory?: { rap?: number | null }[];
}

interface SelectedRequestItem {
  assetId: string;
  name: string;
  imageUrl: string | null;
  rap: number | null;
}

// ── Serial badge (mirrors ClientInventoryGrid exactly) ────────────────────────
function SerialBadge({
  serialNumbers,
  isLimitedUnique,
}: {
  serialNumbers: (number | null)[];
  isLimitedUnique?: boolean | null;
}) {
  const validSerials = serialNumbers
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b);

  const hasNoSerialAtAll = serialNumbers.every(s => s === null);
  const bestSerial: number | null = validSerials[0] ?? null;

  const tier =
    getGhostTier(isLimitedUnique, hasNoSerialAtAll ? null : bestSerial) ??
    getSerialTier(bestSerial);

  const isSpecial = tier !== null;
  const isGhost = tier === 'ghost';
  const hasSerials = validSerials.length > 0;

  if (!hasSerials && !isGhost) return null;

  return (
    <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded shadow-lg z-10">
      {isSpecial ? (
        <SpecialSerialText serial={bestSerial} tier={tier} variant="badge" />
      ) : (
        <span className="text-orange-400 text-xs font-bold">
          #{validSerials[0]}
          {validSerials.length > 1 && ` +${validSerials.length - 1}`}
        </span>
      )}
    </div>
  );
}

// ── Item card ─────────────────────────────────────────────────────────────────
function InventoryCard({
  name,
  imageUrl,
  rap,
  count,
  inOffer,
  disabled,
  isLimitedUnique,
  serialNumbers,
  onClick,
}: {
  name: string;
  imageUrl: string | null;
  rap: number;
  count: number;
  inOffer: boolean;
  disabled: boolean;
  isLimitedUnique?: boolean | null;
  serialNumbers: (number | null)[];
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center rounded-xl border transition-all text-left w-full
        ${disabled
          ? 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed'
          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06] cursor-pointer'
        }`}
      style={{ padding: '14px 10px 12px' }}
    >
      {/* In-offer indicator — small dot only, no card highlight */}
      {inOffer && (
        <div className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-purple-400/80 z-10" />
      )}

      <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-black/40 flex-shrink-0 mb-2">
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">?</div>
        )}
        {/* Stack count badge */}
        {count > 1 && (
          <div className="absolute top-0.5 right-0.5 bg-black/80 text-white/70 text-[9px] font-bold px-1 py-0.5 rounded leading-none z-10">
            ×{count}
          </div>
        )}
        {/* Serial badge — top-right of image, exactly like player inventory */}
        <SerialBadge serialNumbers={serialNumbers} isLimitedUnique={isLimitedUnique} />
      </div>

      <p className="text-white text-xs font-medium leading-tight text-center w-full truncate px-1">
        {name}
      </p>
      {rap > 0 && (
        <p className="text-white font-bold text-[11px] mt-1">{rap.toLocaleString()} R$</p>
      )}
    </button>
  );
}

// ── Trade slot row ────────────────────────────────────────────────────────────
function TradeSlot({
  item,
  onRemove,
  onCopyClick,
}: {
  item?: {
    name: string;
    imageUrl: string | null;
    rap: number | null;
    serialNumber?: number | null;
    isLimitedUnique?: boolean | null;
  };
  onRemove?: () => void;
  onCopyClick?: () => void;
}) {
  if (!item) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-3 py-2.5 opacity-25">
        <div className="w-10 h-10 rounded-lg bg-white/5 flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2 rounded bg-white/5 w-3/4" />
          <div className="h-2 rounded bg-white/5 w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 group relative">
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-black/40 flex-shrink-0">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">?</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{item.name}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {item.rap != null && item.rap > 0 && (
            <p className="text-white font-bold text-xs">{item.rap.toLocaleString()} R$</p>
          )}
          {item.serialNumber != null && (
            <span className="text-[10px] text-white/50 font-mono">#{item.serialNumber}</span>
          )}
          {onCopyClick && (
            <button
              onClick={onCopyClick}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition underline"
            >
              {item.serialNumber != null ? 'change copy' : 'pick copy'}
            </button>
          )}
        </div>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="w-5 h-5 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs font-bold flex items-center justify-center transition opacity-0 group-hover:opacity-100 flex-shrink-0"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── Robux input row ───────────────────────────────────────────────────────────
function RobuxRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 pb-1">
      <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
        + Robux
      </span>
      <div className="relative flex-1">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-400 text-xs font-bold pointer-events-none">
          R$
        </span>
        <input
          type="number"
          min={0}
          max={999999999}
          placeholder="0"
          value={value}
          onChange={e => {
            const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
            onChange(n === 0 ? '' : String(n));
          }}
          className="w-full pl-8 pr-2 py-1.5 rounded-lg bg-white/5 border border-purple-500/20 text-purple-300 text-xs outline-none focus:border-purple-400/50 transition placeholder-slate-700"
        />
      </div>
      {Number(value) > 0 && (
        <button
          onClick={() => onChange('')}
          className="text-slate-600 hover:text-red-400 transition text-base leading-none"
        >
          ×
        </button>
      )}
    </div>
  );
}

type Tab = 'offer' | 'request';

export default function NewTradePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [inventory, setInventory] = useState<ApiInventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [offerItems, setOfferItems] = useState<SelectedOfferItem[]>([]);
  const [requestItems, setRequestItems] = useState<SelectedRequestItem[]>([]);
  const [note, setNote] = useState('');
  const [offerRobux, setOfferRobux] = useState('');
  const [requestRobux, setRequestRobux] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('offer');
  const [inventorySearch, setInventorySearch] = useState('');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestResults, setRequestResults] = useState<SearchResult[]>([]);
  const [requestSearching, setRequestSearching] = useState(false);
  const [requestPage, setRequestPage] = useState(1);
  const [requestItemCount, setRequestItemCount] = useState(0);
  const [requestTotalPages, setRequestTotalPages] = useState(0);
  const REQUEST_PAGE_SIZE = 24;
  const [serialPickerItem, setSerialPickerItem] = useState<SelectedOfferItemWithSlot | null>(null);
  const [splitSerials, setSplitSerials] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (!userId) return;
    fetch('/api/trade/cooldown')
      .then(r => r.json())
      .then(d => { if (d.secondsLeft > 0) setCooldownSeconds(d.secondsLeft); })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const t = setInterval(() => setCooldownSeconds(s => {
      if (s <= 1) { clearInterval(t); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [cooldownSeconds]);

  const formatCooldown = (s: number) => s >= 60 ? `${Math.ceil(s / 60)}m` : `${s}s`;

  useEffect(() => {
    const session = getUserSession();
    if (!session) { router.replace('/verify'); return; }
    setUserId(session.robloxUserId);
  }, [router]);

  useEffect(() => {
    if (!userId) return;
    setInventoryLoading(true);
    fetch(`/api/player/${userId}`)
      .then(r => r.json())
      .then(data => {
        const items: ApiInventoryItem[] = (data.inventory ?? [])
          .map((i: any) => ({
            assetId: i.assetId.toString(),
            name: i.name ?? 'Unknown',
            imageUrl: i.imageUrl ?? null,
            rap: Number(i.rap) || 0,
            count: Number(i.count) || 1,
            isLimitedUnique: i.isLimitedUnique ?? null,
            userAssetIds: (i.userAssetIds ?? []).map(String),
            serialNumbers: i.serialNumbers ?? [],
          }))
          .sort((a: ApiInventoryItem, b: ApiInventoryItem) => b.rap - a.rap);
        setInventory(items);
      })
      .catch(() => setInventory([]))
      .finally(() => setInventoryLoading(false));
  }, [userId]);

  // Single effect: debounce search changes (reset page), immediate on page change
  useEffect(() => {
    let cancelled = false;
    const isSearchChange = true; // page resets happen via setRequestPage before this runs

    const run = async () => {
      setRequestSearching(true);
      try {
        const res = await fetch(`/api/items/search?q=${encodeURIComponent(requestSearch)}&page=${requestPage}`);
        const data = await res.json();
        if (cancelled) return;
        setRequestResults(Array.isArray(data.items) ? data.items : []);
        setRequestItemCount(data.total ?? 0);
        setRequestTotalPages(data.totalPages ?? 0);
      } catch {
        if (!cancelled) setRequestResults([]);
      } finally {
        if (!cancelled) setRequestSearching(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [requestSearch, requestPage]);

  // Build flat item list (one card per copy) for split mode
  // Only Limited U items get split into individual copies; regular limiteds stay stacked
  const flatInventory: FlatInventoryItem[] = inventory
    .filter(item => item.isLimitedUnique === true)
    .flatMap(item =>
      item.userAssetIds.map((uaid, i) => ({
        assetId: item.assetId,
        name: item.name,
        imageUrl: item.imageUrl,
        rap: item.rap,
        isLimitedUnique: item.isLimitedUnique,
        userAssetId: uaid,
        serialNumber: item.serialNumbers[i] ?? null,
        allUserAssetIds: item.userAssetIds,
        allSerialNumbers: item.serialNumbers,
        count: item.count,
      }))
    );

  const filteredInventory = inventory.filter(i =>
    i.name.toLowerCase().includes(inventorySearch.toLowerCase())
  );
  // In split mode: flat limitedU copies + stacked regular limiteds
  const filteredFlatInventory = flatInventory.filter(i =>
    i.name.toLowerCase().includes(inventorySearch.toLowerCase())
  );
  const filteredStackedNonU = inventory.filter(i =>
    i.isLimitedUnique !== true &&
    i.name.toLowerCase().includes(inventorySearch.toLowerCase())
  );

  // ── Offer toggle (stacked mode) ────────────────────────────────────────────
  const toggleOfferItem = (item: ApiInventoryItem) => {
    const existing = offerItems.filter(o => o.assetId === item.assetId);
    if (existing.length >= item.count) {
      setOfferItems(prev => prev.filter(o => o.assetId !== item.assetId));
      return;
    }
    if (offerItems.length >= 4) return;
    setOfferItems(prev => [
      ...prev,
      {
        assetId: item.assetId,
        userAssetId: item.userAssetIds[existing.length] ?? null,
        serialNumber: item.serialNumbers[existing.length] ?? null,
        name: item.name,
        imageUrl: item.imageUrl,
        rap: item.rap,
        isLimitedUnique: item.isLimitedUnique,
        userAssetIds: item.userAssetIds,
        serialNumbers: item.serialNumbers,
      },
    ]);
  };

  // ── Offer toggle (split mode — single copy per card) ──────────────────────
  const toggleOfferFlat = (flat: FlatInventoryItem) => {
    const alreadyIn = offerItems.findIndex(o => o.userAssetId === flat.userAssetId);
    if (alreadyIn !== -1) {
      setOfferItems(prev => prev.filter((_, i) => i !== alreadyIn));
      return;
    }
    if (offerItems.length >= 4) return;
    setOfferItems(prev => [
      ...prev,
      {
        assetId: flat.assetId,
        userAssetId: flat.userAssetId,
        serialNumber: flat.serialNumber,
        name: flat.name,
        imageUrl: flat.imageUrl,
        rap: flat.rap,
        isLimitedUnique: flat.isLimitedUnique,
        userAssetIds: flat.allUserAssetIds,
        serialNumbers: flat.allSerialNumbers,
      },
    ]);
  };

  const removeOfferItem = (idx: number) => {
    setOfferItems(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleRequestItem = (item: SearchResult) => {
    const rap = item.priceHistory?.[0]?.rap ?? null;
    const existingCount = requestItems.filter(r => r.assetId === item.assetId).length;
    if (requestItems.length >= 4) {
      if (existingCount === 0) return;
      const lastIdx = [...requestItems.map((r, i) => ({ r, i }))]
        .reverse()
        .find(({ r }) => r.assetId === item.assetId)?.i ?? -1;
      if (lastIdx !== -1) setRequestItems(prev => prev.filter((_, i) => i !== lastIdx));
      return;
    }
    setRequestItems(prev => [
      ...prev,
      {
        assetId: item.assetId,
        name: item.name,
        imageUrl: item.imageUrl,
        rap: typeof rap === 'number' ? rap : null,
      },
    ]);
  };

  const selectSerial = (slotIndex: number, userAssetId: string, serialNumber: number | null) => {
    setOfferItems(prev =>
      prev.map((item, i) => (i === slotIndex ? { ...item, userAssetId, serialNumber } : item))
    );
    setSerialPickerItem(null);
  };

 const handleSubmit = async () => {
    if (cooldownSeconds > 0) return;
    if (offerItems.length === 0) { setError('You must offer at least one item.'); return; }
    if (requestItems.length === 0) { setError('You must request at least one item.'); return; }
    const offerRobuxInt = Math.max(0, Math.floor(Number(offerRobux) || 0));
    const requestRobuxInt = Math.max(0, Math.floor(Number(requestRobux) || 0));
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerItems: offerItems.map(i => ({
            assetId: i.assetId,
            userAssetId: i.userAssetId,
            serialNumber: i.serialNumber,
          })),
          requestItems: requestItems.map(i => ({ assetId: i.assetId })),
          note: note.trim() || null,
          offerRobux: offerRobuxInt,
          requestRobux: requestRobuxInt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 && data.secondsLeft) {
          setCooldownSeconds(data.secondsLeft);
        } else {
          setError(data.error ?? 'Failed to post trade ad');
        }
        return;
      }
      router.push(`/trade/${data.id}`);
    } catch {
      setError('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const offerTotal = offerItems.reduce((s, i) => s + i.rap, 0);
  const requestTotal = requestItems.reduce((s, i) => s + (i.rap ?? 0), 0);

  const offerCountByAsset = offerItems.reduce<Record<string, number>>((acc, i) => {
    acc[i.assetId] = (acc[i.assetId] ?? 0) + 1;
    return acc;
  }, {});
  const offerUAIDSet = new Set(offerItems.map(i => i.userAssetId).filter(Boolean));

  return (
    <div
      className="min-h-screen w-full text-white"
      style={{ background: 'rgba(10,10,10,0.6)', marginTop: '-80px', paddingTop: '104px', paddingBottom: '48px' }}
    >
      {/* Header */}
      <div className="px-6 max-w-7xl mx-auto mb-6">
        <Link href="/trade" className="text-slate-500 hover:text-white text-sm transition inline-flex items-center gap-1 mb-4">
          ← Trade Ads
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Post Trade Ad</h1>
            <p className="text-slate-500 text-sm mt-0.5">Build your trade and let the community find you</p>
          </div>
          <div className="flex items-center gap-3">
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={submitting || cooldownSeconds > 0 || offerItems.length === 0 || requestItems.length === 0}
              className="px-6 py-2 rounded-xl font-bold text-sm bg-purple-600 hover:bg-purple-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Posting…' : cooldownSeconds > 0 ? `Wait ${formatCooldown(cooldownSeconds)}` : 'Post Trade Ad'}
            </button>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="px-6 max-w-7xl mx-auto flex gap-5 items-start">

        {/* LEFT: Item picker */}
        <div
          className="flex-1 min-w-0 rounded-2xl border border-white/10 bg-[#0d0d0f] overflow-hidden"
          style={{ boxShadow: '0 2px 24px rgba(0,0,0,0.5)' }}
        >
          {/* Tabs */}
          <div className="flex border-b border-white/10">
            {(['offer', 'request'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-sm font-semibold transition border-b-2 ${activeTab === tab
                    ? 'text-white border-white/50 bg-white/5'
                    : 'text-slate-500 border-transparent hover:text-slate-300'
                  }`}
              >
                {tab === 'offer' ? 'Your Inventory' : 'Request'}
                <span
                  className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab ? 'bg-white/10 text-white/70' : 'bg-white/5 text-slate-600'
                    }`}
                >
                  {tab === 'offer' ? offerItems.length : requestItems.length}/4
                </span>
              </button>
            ))}
          </div>

          {/* Search bar + split toggle (offer tab only) */}
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <input
              type="text"
              placeholder={activeTab === 'offer' ? 'Filter your inventory...' : 'Search items...'}
              value={activeTab === 'offer' ? inventorySearch : requestSearch}
              onChange={e =>
                activeTab === 'offer'
                  ? setInventorySearch(e.target.value)
                  : (v => { setRequestSearch(v); setRequestPage(1); })(e.target.value)
              }
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-white/25 transition"
            />
            {activeTab === 'offer' && (
              <button
                onClick={() => setSplitSerials(v => !v)}
                title="Show each Limited U copy as its own card with its serial number"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap ${splitSerials
                    ? 'border-purple-500/50 bg-purple-500/10 text-purple-300'
                    : 'border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300 hover:border-white/20'
                  }`}
              >
                {/* 2×2 grid icon */}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
                  <rect x="0.5" y="0.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="7" y="0.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="0.5" y="7" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="7" y="7" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                Split Serials
              </button>
            )}
          </div>

          {/* Grid */}
          <div className="p-4 overflow-y-auto overflow-x-hidden" style={{ minHeight: 200 }}>
            {activeTab === 'offer' ? (
              inventoryLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              ) : filteredInventory.length === 0 ? (
                <p className="text-slate-600 text-sm text-center py-20">
                  {inventorySearch
                    ? 'No items match your search'
                    : 'No inventory found — make sure your account is verified and scanned'}
                </p>
              ) : splitSerials ? (
                // ── Split mode: Limited U copies split individually, regular limiteds stay stacked ──
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                  {filteredFlatInventory.map(flat => {
                    const inOffer = offerUAIDSet.has(flat.userAssetId);
                    const isDisabled = offerItems.length >= 4 && !inOffer;
                    return (
                      <InventoryCard
                        key={`${flat.assetId}-${flat.userAssetId}`}
                        name={flat.name}
                        imageUrl={flat.imageUrl}
                        rap={flat.rap}
                        count={1}
                        inOffer={inOffer}
                        disabled={isDisabled}
                        isLimitedUnique={flat.isLimitedUnique}
                        serialNumbers={flat.serialNumber !== null ? [flat.serialNumber] : []}
                        onClick={() => toggleOfferFlat(flat)}
                      />
                    );
                  })}
                  {filteredStackedNonU.map(item => {
                    const selectedCount = offerCountByAsset[item.assetId] ?? 0;
                    const isDisabled = offerItems.length >= 4 && selectedCount === 0;
                    return (
                      <div key={item.assetId} className="relative">
                        <InventoryCard
                          name={item.name}
                          imageUrl={item.imageUrl}
                          rap={item.rap}
                          count={item.count}
                          inOffer={selectedCount > 0}
                          disabled={isDisabled}
                          isLimitedUnique={item.isLimitedUnique}
                          serialNumbers={item.serialNumbers}
                          onClick={() => toggleOfferItem(item)}
                        />
                        {selectedCount > 1 && (
                          <div className="absolute -top-1 -left-1 w-5 h-5 bg-white/80 rounded-full flex items-center justify-center text-[9px] text-black font-bold z-20">
                            {selectedCount}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // ── Stacked mode: grouped by assetId, showing best serial ────
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                  {filteredInventory.map(item => {
                    const selectedCount = offerCountByAsset[item.assetId] ?? 0;
                    const isDisabled = offerItems.length >= 4 && selectedCount === 0;
                    return (
                      <div key={item.assetId} className="relative">
                        <InventoryCard
                          name={item.name}
                          imageUrl={item.imageUrl}
                          rap={item.rap}
                          count={item.count}
                          inOffer={selectedCount > 0}
                          disabled={isDisabled}
                          isLimitedUnique={item.isLimitedUnique}
                          serialNumbers={item.serialNumbers}
                          onClick={() => toggleOfferItem(item)}
                        />
                        {selectedCount > 1 && (
                          <div className="absolute -top-1 -left-1 w-5 h-5 bg-white/80 rounded-full flex items-center justify-center text-[9px] text-black font-bold z-20">
                            {selectedCount}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              // ── Request tab ──────────────────────────────────────────────────
              <div>
                {requestSearching && (
                  <div className="flex justify-center py-20">
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
                {!requestSearching && requestResults.length === 0 && (
                  <p className="text-slate-600 text-sm text-center py-20">No items found</p>
                )}
                {!requestSearching && requestResults.length > 0 && (
                  <>
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                      {requestResults.map(item => {
                        const selectedCount = requestItems.filter(r => r.assetId === item.assetId).length;
                        const disabled = requestItems.length >= 4 && selectedCount === 0;
                        const rap = item.priceHistory?.[0]?.rap ?? null;
                        return (
                          <div key={item.assetId} className="relative">
                            <InventoryCard
                              name={item.name}
                              imageUrl={item.imageUrl}
                              rap={typeof rap === 'number' ? rap : 0}
                              count={0}
                              inOffer={selectedCount > 0}
                              disabled={disabled}
                              isLimitedUnique={null}
                              serialNumbers={[]}
                              onClick={() => toggleRequestItem(item)}
                            />
                            {selectedCount > 1 && (
                              <div className="absolute -top-1 -left-1 w-5 h-5 bg-white/80 rounded-full flex items-center justify-center text-[9px] text-black font-bold z-20">
                                {selectedCount}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {requestTotalPages > 1 && (
                      <div className="mt-4">
                        <Pagination
                          page={requestPage}
                          totalPages={requestTotalPages}
                          totalItems={requestItemCount}
                          pageSize={REQUEST_PAGE_SIZE}
                          onPageChange={p => setRequestPage(p)}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Trade slots + note */}
        <div className="w-72 flex-shrink-0 space-y-4">

          {/* Offer panel */}
          <div
            className="rounded-2xl border border-white/10 bg-[#0d0d0f] overflow-hidden"
            style={{ boxShadow: '0 2px 24px rgba(0,0,0,0.5)' }}
          >
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <p className="text-white text-sm font-bold uppercase tracking-wider">Offering</p>
              {offerTotal > 0 && (
                <p className="text-white/50 text-xs font-bold">{offerTotal.toLocaleString()} R$</p>
              )}
            </div>
            <div className="p-3 space-y-2">
              <RobuxRow value={offerRobux} onChange={setOfferRobux} />
              {[0, 1, 2, 3].map(i => {
                const item = offerItems[i];
                return (
                  <TradeSlot
                    key={i}
                    item={item ?? undefined}
                    onRemove={item ? () => removeOfferItem(i) : undefined}
                    onCopyClick={(() => {
                      if (!item || item.userAssetIds.length <= 1) return undefined;
                      const hasAnySerial = item.serialNumbers.some(s => s !== null);
                      const isGhost = item.isLimitedUnique === true && !hasAnySerial;
                      if (!hasAnySerial && !isGhost) return undefined;
                      return () => setSerialPickerItem({ ...item, _slotIndex: i });
                    })()}
                  />
                );
              })}
            </div>
          </div>

          {/* RAP diff */}
          {(() => {
            const offerTotal = offerItems.reduce((s, i) => s + i.rap, 0) + (Number(offerRobux) || 0);
            const requestTotal = requestItems.reduce((s, i) => s + (i.rap ?? 0), 0) + (Number(requestRobux) || 0);
            const diff = requestTotal - offerTotal;
            if (offerTotal === 0 && requestTotal === 0) return null;
            const pct = requestTotal > 0 ? Math.round((diff / requestTotal) * 100) : null;
            const up = diff >= 0;
            return (
              <div className="flex items-center justify-center">
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm"
                  style={{
                    background: up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    border: `1px solid ${up ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: up ? '#4ade80' : '#f87171',
                  }}
                >
                  <span style={{ fontSize: 15 }}>{up ? '▲' : '▼'}</span>
                  <span>
                    {up ? '+' : ''}{diff.toLocaleString()} RAP
                    {pct !== null && ` (${up ? '+' : ''}${pct}%)`}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Request panel */}
          <div
            className="rounded-2xl border border-white/10 bg-[#0d0d0f] overflow-hidden"
            style={{ boxShadow: '0 2px 24px rgba(0,0,0,0.5)' }}
          >
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <p className="text-white text-sm font-bold uppercase tracking-wider">Requesting</p>
              {requestTotal > 0 && (
                <p className="text-white/50 text-xs font-bold">{requestTotal.toLocaleString()} R$</p>
              )}
            </div>
            <div className="p-3 space-y-2">
              <RobuxRow value={requestRobux} onChange={setRequestRobux} />
              {[0, 1, 2, 3].map(i => {
                const item = requestItems[i];
                return (
                  <TradeSlot
                    key={i}
                    item={item ?? undefined}
                    onRemove={
                      item ? () => setRequestItems(prev => prev.filter((_, idx) => idx !== i)) : undefined
                    }
                  />
                );
              })}
            </div>
          </div>

          {/* Note */}
          <div
            className="rounded-2xl border border-white/10 bg-[#0d0d0f] p-3 space-y-2"
            style={{ boxShadow: '0 2px 24px rgba(0,0,0,0.5)' }}
          >
            <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Note (optional)</p>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={200}
              placeholder="e.g. open to overpay, DM me on Discord..."
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:border-white/25 transition"
              rows={2}
            />
            <p className="text-slate-700 text-xs text-right">{note.length}/200</p>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || cooldownSeconds > 0 || offerItems.length === 0 || requestItems.length === 0}
            className="w-full py-3 rounded-xl font-bold text-sm bg-purple-600 hover:bg-purple-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Posting…' : cooldownSeconds > 0 ? `Wait ${formatCooldown(cooldownSeconds)}` : 'Post Trade Ad'}
          </button>
        </div>
      </div>

      {/* Serial picker modal */}
      {serialPickerItem && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setSerialPickerItem(null)}
        >
          <div
            className="bg-[#0d0d0f] border border-white/10 rounded-2xl p-4 w-full max-w-sm max-h-[60vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white font-bold">Select Copy</h3>
              <button
                onClick={() => setSerialPickerItem(null)}
                className="text-slate-400 hover:text-white transition text-xl leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-slate-500 text-xs mb-3">{serialPickerItem.name}</p>
            <div className="overflow-y-auto flex-1 space-y-1">
              <button
                onClick={() => {
                  setOfferItems(prev =>
                    prev.map((item, i) =>
                      i === serialPickerItem._slotIndex
                        ? { ...item, userAssetId: null, serialNumber: null }
                        : item
                    )
                  );
                  setSerialPickerItem(null);
                }}
                className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition text-left"
              >
                <span className="text-slate-300 text-sm">Any copy</span>
                <span className="text-slate-500 text-xs">no preference</span>
              </button>
              {serialPickerItem.userAssetIds.map((uaid, i) => {
                const serial = serialPickerItem.serialNumbers[i] ?? null;
                const btnTier =
                  getGhostTier(serialPickerItem.isLimitedUnique, serial) ?? getSerialTier(serial);
                return (
                  <button
                    key={uaid}
                    onClick={() => selectSerial(serialPickerItem._slotIndex, uaid, serial)}
                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition text-left"
                  >
                    <span className="text-sm font-mono">
                      {btnTier ? (
                        <SpecialSerialText serial={serial} tier={btnTier} variant="button" />
                      ) : serial != null ? (
                        <span className="text-orange-400 font-bold">#{serial}</span>
                      ) : (
                        <span className="text-slate-400">No serial</span>
                      )}
                    </span>
                    <span className="text-slate-600 text-xs font-mono truncate ml-2">{uaid}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}