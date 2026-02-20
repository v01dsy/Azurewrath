"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import axios from "axios";

const getColor = (percent: number) => {
  if (percent >= 75) return "#ff4f81";
  if (percent >= 50) return "#ffd700";
  if (percent >= 40) return "#a259f7";
  if (percent >= 30) return "#4fc3f7";
  if (percent >= 20) return "#43e97b";
  return "#b0b8c1";
};

const getBorderColor = (percent: number) => {
  if (percent >= 75) return "#c2185b";
  if (percent >= 50) return "#bfa600";
  if (percent >= 40) return "#6c2eb7";
  if (percent >= 30) return "#1976d2";
  if (percent >= 20) return "#1b8a5a";
  return "#7b8794";
};

interface DealItem {
  assetId: string;
  name: string;
  imageUrl?: string;
  manipulated: boolean;
  percent: number;
  rap: number;
  bestPrice: number;
  timestamp?: string;
}

type SortKey = "deal" | "rap" | "price" | "recent";
type SortDir = "asc" | "desc";

const DEAL_PRESETS = [
  { label: "All", min: 0 },
  { label: "10%+", min: 10 },
  { label: "20%+", min: 20 },
  { label: "30%+", min: 30 },
  { label: "40%+", min: 40 },
  { label: "50%+", min: 50 },
  { label: "75%+", min: 75 },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Deals() {
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [newDealIds, setNewDealIds] = useState<Set<string>>(new Set());
  const [priceDropIds, setPriceDropIds] = useState<Set<string>>(new Set());
  const prevDealsRef = useRef<Map<string, DealItem>>(new Map());
  const isInitialLoad = useRef(true);

  // Filter state
  const [sortKey, setSortKey] = useState<SortKey>("deal");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [dealMin, setDealMin] = useState(10);
  const [rapMin, setRapMin] = useState("");
  const [rapMax, setRapMax] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [hideManipulated, setHideManipulated] = useState(true); // default: hide manipulated

  const fetchDeals = useCallback(async () => {
    try {
      const res = await axios.get("/api/deals");
      const incoming: DealItem[] = res.data;

      if (!isInitialLoad.current) {
        const newIds = new Set<string>();
        const dropIds = new Set<string>();

        incoming.forEach(d => {
          const prev = prevDealsRef.current.get(d.assetId);
          if (!prev) {
            newIds.add(d.assetId);
          } else if (d.bestPrice < prev.bestPrice) {
            dropIds.add(d.assetId);
          }
        });

        if (newIds.size > 0) {
          setNewDealIds(newIds);
          setTimeout(() => setNewDealIds(new Set()), 3000);
        }
        if (dropIds.size > 0) {
          setPriceDropIds(dropIds);
          setTimeout(() => setPriceDropIds(new Set()), 3000);
        }
      }

      const nextMap = new Map<string, DealItem>();
      incoming.forEach(d => nextMap.set(d.assetId, d));
      prevDealsRef.current = nextMap;

      setDeals(incoming);
      setLastUpdated(new Date());
      isInitialLoad.current = false;
    } catch (e) {
      console.error("Failed to fetch deals", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Deals | Azurewrath";
    fetchDeals();
  }, [fetchDeals]);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(fetchDeals, 1000);
    return () => clearInterval(interval);
  }, [isLive, fetchDeals]);

  const filtered = useMemo(() => {
    let result = [...deals];

    if (hideManipulated) result = result.filter(d => !d.manipulated);
    if (dealMin > 0) result = result.filter(d => d.percent >= dealMin);
    if (rapMin !== "") result = result.filter(d => d.rap >= Number(rapMin));
    if (rapMax !== "") result = result.filter(d => d.rap <= Number(rapMax));
    if (priceMin !== "") result = result.filter(d => d.bestPrice >= Number(priceMin));
    if (priceMax !== "") result = result.filter(d => d.bestPrice <= Number(priceMax));

    result.sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === "deal") { av = a.percent; bv = b.percent; }
      else if (sortKey === "rap") { av = a.rap; bv = b.rap; }
      else if (sortKey === "price") { av = a.bestPrice; bv = b.bestPrice; }
      else if (sortKey === "recent") {
        av = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        bv = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });

    return result;
  }, [deals, sortKey, sortDir, dealMin, rapMin, rapMax, priceMin, priceMax, hideManipulated]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const clearFilters = () => {
    setDealMin(10);
    setRapMin(""); setRapMax("");
    setPriceMin(""); setPriceMax("");
    setSortKey("deal");
    setSortDir("desc");
    setHideManipulated(true);
  };

  const hasActiveFilters = dealMin !== 10 || rapMin || rapMax || priceMin || priceMax || sortKey !== "deal" || sortDir !== "desc" || !hideManipulated;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4" />
        <p className="text-slate-400">Loading deals...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 pb-8 px-4">
      <div className="container mx-auto max-w-7xl">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="text-3xl font-bold">deals deals deals!</h1>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-slate-500 text-xs">
                Updated {timeAgo(lastUpdated.toISOString())}
              </span>
            )}
            <span className="text-slate-400 text-sm">{filtered.length} deal{filtered.length !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-2 bg-[#111] border border-white/10 px-3 py-1.5 rounded-lg">
              <div className={`w-2 h-2 rounded-full ${isLive ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
              <span className="text-xs text-slate-300">{isLive ? "Live" : "Paused"}</span>
            </div>
            <button
              onClick={() => setIsLive(l => !l)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm transition"
            >
              {isLive ? "Pause" : "Resume"}
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-4 mb-6 flex flex-col gap-4">

          {/* Row 1: Sort buttons */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-slate-400 text-xs uppercase tracking-wider mr-1">Sort</span>
            {(["deal", "rap", "price", "recent"] as SortKey[]).map(key => (
              <button
                key={key}
                onClick={() => handleSort(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 flex items-center gap-1 ${
                  sortKey === key
                    ? "bg-purple-600 text-white"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {key === "deal" ? "Deal %" : key === "rap" ? "RAP" : key === "price" ? "Price" : "Recent"}
                {sortKey === key && (
                  <span className="text-xs">{sortDir === "desc" ? "↓" : "↑"}</span>
                )}
              </button>
            ))}

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-all"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Row 2: Deal % presets */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-slate-400 text-xs uppercase tracking-wider mr-1">Deal</span>
            {DEAL_PRESETS.map(preset => (
              <button
                key={preset.min}
                onClick={() => setDealMin(preset.min)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                  dealMin === preset.min
                    ? "bg-pink-600 text-white"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Row 3: RAP + Price range inputs */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs uppercase tracking-wider">RAP</span>
              <input
                type="number"
                placeholder="Min"
                value={rapMin}
                onChange={e => setRapMin(e.target.value)}
                className="w-24 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-purple-500 transition"
              />
              <span className="text-slate-500">–</span>
              <input
                type="number"
                placeholder="Max"
                value={rapMax}
                onChange={e => setRapMax(e.target.value)}
                className="w-24 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-purple-500 transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs uppercase tracking-wider">Price</span>
              <input
                type="number"
                placeholder="Min"
                value={priceMin}
                onChange={e => setPriceMin(e.target.value)}
                className="w-24 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-purple-500 transition"
              />
              <span className="text-slate-500">–</span>
              <input
                type="number"
                placeholder="Max"
                value={priceMax}
                onChange={e => setPriceMax(e.target.value)}
                className="w-24 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-purple-500 transition"
              />
            </div>

            {/* Manipulated toggle */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs uppercase tracking-wider">Manipulated</span>
              <button
                onClick={() => setHideManipulated(h => !h)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                  hideManipulated
                    ? "bg-red-600/40 text-red-300 border border-red-500/40"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {hideManipulated ? "Hidden" : "Shown"}
              </button>
            </div>
          </div>
        </div>

        {/* Deals Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 text-slate-500">
            No deals match your filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(item => {
              const isNew = newDealIds.has(item.assetId);
              const isPriceDrop = priceDropIds.has(item.assetId);
              const isHighlighted = isNew || isPriceDrop;
              return (
                <Link href={`/item/${item.assetId}`} key={item.assetId}>
                  <div
                    className="rounded-lg p-4 flex flex-col hover:scale-105 cursor-pointer border-2"
                    style={{
                      backgroundColor: getColor(item.percent) + (isHighlighted ? '44' : '22'),
                      color: '#fff',
                      minHeight: 120,
                      maxWidth: 320,
                      borderColor: isHighlighted ? getColor(item.percent) : getBorderColor(item.percent),
                      boxShadow: isHighlighted ? `0 0 16px 3px ${getColor(item.percent)}55` : '0 2px 8px 0 rgba(0,0,0,0.10)',
                      transition: 'all 0.4s ease',
                    }}
                  >
                    <div className="flex items-start gap-1.5 mb-3 w-full">
                      <h2
                        className="text-base font-bold text-left truncate flex-1 min-w-0"
                        title={item.name}
                        style={{ color: '#fff', textShadow: '0 1px 4px #000', fontWeight: 600, letterSpacing: '0.01em' }}
                      >
                        {isNew && (
                          <span className="text-xs bg-green-500 text-black px-1.5 py-0.5 rounded font-bold mr-1.5">NEW</span>
                        )}
                        {isPriceDrop && !isNew && (
                          <span className="text-xs bg-orange-500 text-black px-1.5 py-0.5 rounded font-bold mr-1.5">↓ DROP</span>
                        )}
                        {item.name}
                      </h2>
                      {item.manipulated && (
                        <img
                          src="/Images/manipulated1.png"
                          alt="Manipulated"
                          title="This item's RAP may be manipulated"
                          className="w-6 h-6 flex-shrink-0 mt-0.5"
                        />
                      )}
                    </div>
                    <div className="flex flex-row items-start w-full gap-3">
                      <img
                        src={item.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=220&height=220&format=png`}
                        alt={item.name}
                        className="w-24 h-24 object-contain flex-shrink-0"
                        style={{ background: 'transparent', boxShadow: 'none', border: 'none' }}
                      />
                      <div className="flex flex-col justify-between flex-1 min-w-0">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-row justify-between w-full gap-2">
                            <span className="font-bold flex-shrink-0">Price</span>
                            <span className="text-white/90 truncate">{item.bestPrice.toLocaleString()}</span>
                          </div>
                          <div className="flex flex-row justify-between w-full gap-2">
                            <span className="font-bold flex-shrink-0">RAP</span>
                            <span className="text-white/90 truncate">{item.rap.toLocaleString()}</span>
                          </div>
                          <div className="flex flex-row justify-between w-full gap-2">
                            <span className="font-bold flex-shrink-0">Deal</span>
                            <span style={{ color: getColor(item.percent) }} className="font-bold truncate">
                              {item.percent}%
                            </span>
                          </div>
                          {item.timestamp && (
                            <div className="flex flex-row justify-between w-full gap-2 mt-1">
                              <span className="text-white/40 text-xs truncate">
                                {timeAgo(item.timestamp)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}