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
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-8">Deals</h1>
      <div className="grid md:grid-cols-3 gap-6">
        {deals.map(item => (
          <Link href={`/items/${item.assetId}`} key={item.id}>
            <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-6 flex flex-col items-center hover:scale-105 transition" style={{ borderColor: getColor(item.percent) }}>
              <img src={item.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=420&height=420&format=png`} alt={item.name} className="w-24 h-24 object-cover rounded mb-4" />
              <h2 className="text-xl font-semibold mb-2 text-center">{item.name}</h2>
              <div className="text-lg mb-1">{item.percent}% off</div>
              <div className="text-slate-400 text-sm">RAP: {item.rap} | Best: {item.bestPrice}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
