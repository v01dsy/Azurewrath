"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";

const getColor = (percent: number) => {
  if (percent >= 75) return "#fc0356";
  if (percent >= 50) return "gold";
  if (percent >= 40) return "purple";
  if (percent >= 30) return "blue";
  if (percent >= 20) return "green";
  return "grey";
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {deals.map(item => (
          <Link href={`/items/${item.assetId}`} key={item.id}>
            <div
              className="rounded-md p-2 flex flex-col items-center shadow hover:scale-105 transition cursor-pointer border-2 border-transparent"
              style={{ background: getColor(item.percent), color: '#fff', minHeight: 140 }}
            >
              <img
                src={item.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=150&height=150&format=png`}
                alt={item.name}
                className="w-12 h-12 object-cover rounded mb-2 border border-white/20"
                style={{ background: '#222' }}
              />
              <h2 className="text-xs font-semibold mb-1 text-center w-full truncate" title={item.name}>{item.name}</h2>
              <div className="text-base font-bold mb-0.5">{item.percent}%</div>
              <div className="text-[10px] text-white/80">RAP: {item.rap}</div>
              <div className="text-[10px] text-white/80">Best: {item.bestPrice}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
