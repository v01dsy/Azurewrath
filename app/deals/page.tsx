"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";

const getColor = (percent: number) => {
  if (percent >= 75) return "#ff4f81"; // Vibrant pink
  if (percent >= 50) return "#ffd700"; // Gold
  if (percent >= 40) return "#a259f7"; // Soft purple
  if (percent >= 30) return "#4fc3f7"; // Sky blue
  if (percent >= 20) return "#43e97b"; // Mint green
  return "#b0b8c1"; // Soft grey
};

const getBorderColor = (percent: number) => {
  if (percent >= 75) return "#c2185b"; // Deep pink
  if (percent >= 50) return "#bfa600"; // Deep gold
  if (percent >= 40) return "#6c2eb7"; // Deep purple
  if (percent >= 30) return "#1976d2"; // Deep blue
  if (percent >= 20) return "#1b8a5a"; // Deep green
  return "#7b8794"; // Deep grey
};

interface DealItem {
  id: string;
  assetId: string;
  name: string;
  imageUrl?: string;
  percent: number;
  rap: number;
  bestPrice: number;
}

export default function Deals() {
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Deals | Azurewrath";
    
    // Fetch from the new deals endpoint
    axios.get("/api/deals")
      .then(res => setDeals(res.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center">Loading deals...</div>;

  return (
    <div className="container mx-auto px-2 py-8">
      <h1 className="text-3xl font-bold mb-6">deals deals deals!</h1>
      <div className="mx-auto max-w-6xl px-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {deals.map(item => (
            <Link href={`/items/${item.assetId}`} key={item.id}>
              <div
                className="rounded-lg p-4 flex flex-col hover:scale-105 transition cursor-pointer border-2"
                style={{
                  background: getColor(item.percent) + '55', // 20% opacity
                  color: '#fff',
                  minHeight: 120,
                  maxWidth: 320,
                  borderColor: getBorderColor(item.percent),
                  boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10)',
                }}
              >
                <h2 className="text-base font-bold mb-3 text-left truncate w-full" title={item.name} style={{color:'#fff',textShadow:'0 1px 4px #000', fontWeight:600, letterSpacing:'0.01em'}}>{item.name}</h2>
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
                        <span className="font-bold flex-shrink-0">Deal</span>
                        <span className="text-white/90 truncate">{item.percent}%</span>
                      </div>
                      <div className="flex flex-row justify-between w-full gap-2">
                        <span className="font-bold flex-shrink-0">RAP</span>
                        <span className="text-white/90 truncate">{item.rap.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}