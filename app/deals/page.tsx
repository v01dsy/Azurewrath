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
  priceHistory: Array<{
    price: number;
    rap?: number;
    lowestResale?: number;
    timestamp: string;
  }>;
}

export default function Deals() {
  const [items, setItems] = useState<DealItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get("/api/items/search", { params: { q: "" } })
      .then(res => setItems(res.data))
      .finally(() => setLoading(false));
  }, []);

  const deals = items
    .map(item => {
      const latest = item.priceHistory[0];
      const rap = latest?.rap ?? 0;
      const bestPrice = latest?.lowestResale ?? latest?.price ?? 0;
      const percent = rap && bestPrice ? Math.round(((rap - bestPrice) / rap) * 100) : 0;
      return { ...item, percent, rap, bestPrice };
    })
    .filter(item => item.percent > 0)
    .sort((a, b) => b.percent - a.percent);

  if (loading) return <div className="p-8 text-center">Loading deals...</div>;

  return (
    <div className="container mx-auto px-2 py-8">
      <h1 className="text-3xl font-bold mb-6">Deals</h1>
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
                <div className="flex flex-col w-full h-full">
                  <h2
                    className="text-base font-bold mb-2 text-left w-full truncate fade-right"
                    title={item.name}
                    style={{ color: '#fff', textShadow: '0 1px 4px #000', fontWeight: 600, letterSpacing: '0.01em', maxWidth: '100%' }}
                  >
                    {item.name}
                  </h2>
                  <img
                    src={item.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=220&height=220&format=png`}
                    alt={item.name}
                    className="w-24 h-24 object-contain mx-auto mb-2"
                    style={{ background: 'transparent', boxShadow: 'none', border: 'none' }}
                  />
                  <div className="flex flex-col gap-1 mt-1 w-full">
                    <div className="flex flex-row justify-between w-full">
                      <span className="font-bold">Price</span>
                      <span className="text-white/90 truncate fade-right" style={{ maxWidth: '90px', textAlign: 'right' }}>
                        {item.bestPrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-row justify-between w-full">
                      <span className="font-bold">Deal</span>
                      <span className="text-white/90 truncate fade-right" style={{ maxWidth: '90px', textAlign: 'right' }}>
                        {item.percent}%
                      </span>
                    </div>
                    <div className="flex flex-row justify-between w-full">
                      <span className="font-bold">RAP</span>
                      <span className="text-white/90 truncate fade-right" style={{ maxWidth: '90px', textAlign: 'right' }}>
                        {item.rap.toLocaleString()}
                      </span>
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

/* Fade out effect for overflowed text */
<style jsx>{`
  .fade-right {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    position: relative;
  }
  .fade-right:after {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    width: 2.5em;
    height: 100%;
    pointer-events: none;
    background: linear-gradient(to right, transparent, #222 80%);
  }
`}</style>
