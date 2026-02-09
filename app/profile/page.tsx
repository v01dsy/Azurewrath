"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";

interface UserStats {
  totalTrades: number;
  successRate: number;
  memberSince: string;
}

interface InventoryItem {
  id: string;
  assetId: string;
  name: string;
  imageUrl?: string;
  rap?: number;
}

interface TradeHistory {
  id: string;
  date: string;
  type: "incoming" | "outgoing";
  status: "completed" | "pending" | "declined";
  itemsGiven: string[];
  itemsReceived: string[];
}

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [tradeHistory, setTradeHistory] = useState<TradeHistory[]>([]);
  const [activeTab, setActiveTab] = useState<"inventory" | "trades" | "stats">("inventory");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch user data
    Promise.all([
      axios.get("/api/user/profile"),
      axios.get("/api/user/stats"),
      axios.get("/api/user/inventory"),
      axios.get("/api/user/trades"),
    ])
      .then(([profileRes, statsRes, inventoryRes, tradesRes]) => {
        setUser(profileRes.data);
        setStats(statsRes.data);
        setInventory(inventoryRes.data);
        setTradeHistory(tradesRes.data);
      })
      .catch((err) => {
        console.error("Error fetching profile data:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Profile Header */}
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 mb-6">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              <img
                src={user?.avatar || `https://www.roblox.com/headshot-thumbnail/image?userId=1&width=150&height=150&format=png`}
                alt={user?.username || "User"}
                className="w-32 h-32 rounded-full border-4 border-purple-500 shadow-lg"
              />
              <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                LVL {user?.level || 1}
              </div>
            </div>

            {/* User Info */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-4xl font-bold text-white mb-2">{user?.username || "Guest"}</h1>
              <p className="text-purple-300 mb-4">@{user?.username || "guest"}</p>
              
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <StatCard label="Total RAP" value={`R$ ${(user?.totalRap || 0).toLocaleString()}`} />
                <StatCard label="Items" value={(inventory.length || 0).toString()} />
                <StatCard label="Trades" value={(stats?.totalTrades || 0).toString()} />
                <StatCard label="Success Rate" value={`${stats?.successRate || 0}%`} />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              <button className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg">
                Edit Profile
              </button>
              <button className="px-6 py-2 bg-slate-700 text-white rounded-lg font-semibold hover:bg-slate-600 transition-all duration-200">
                Settings
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          <TabButton
            active={activeTab === "inventory"}
            onClick={() => setActiveTab("inventory")}
          >
            Inventory ({inventory.length})
          </TabButton>
          <TabButton
            active={activeTab === "trades"}
            onClick={() => setActiveTab("trades")}
          >
            Trade History
          </TabButton>
          <TabButton
            active={activeTab === "stats"}
            onClick={() => setActiveTab("stats")}
          >
            Statistics
          </TabButton>
        </div>

        {/* Tab Content */}
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
          {activeTab === "inventory" && (
            <InventoryTab items={inventory} />
          )}
          {activeTab === "trades" && (
            <TradesTab trades={tradeHistory} />
          )}
          {activeTab === "stats" && (
            <StatsTab stats={stats} user={user} />
          )}
        </div>

        {/* Roblox Authentication */}
        <RobloxAuthSection />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-700/50 rounded-lg p-3 border border-purple-500/10">
      <div className="text-purple-300 text-xs font-semibold mb-1">{label}</div>
      <div className="text-white text-lg font-bold">{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 whitespace-nowrap ${
        active
          ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg"
          : "bg-slate-700/50 text-purple-300 hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function InventoryTab({ items }: { items: InventoryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-purple-300 text-lg">No items in inventory</div>
        <Link href="/items" className="text-purple-400 hover:text-purple-300 mt-2 inline-block">
          Browse items →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {items.map((item) => (
        <Link href={`/items/${item.assetId}`} key={item.id}>
          <div className="bg-slate-700/50 rounded-lg p-3 hover:bg-slate-700 transition-all duration-200 cursor-pointer border border-purple-500/10 hover:border-purple-500/30">
            <img
              src={item.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=150&height=150&format=png`}
              alt={item.name}
              className="w-full aspect-square object-contain mb-2 rounded"
            />
            <div className="text-white text-sm font-semibold truncate" title={item.name}>
              {item.name}
            </div>
            {item.rap && (
              <div className="text-purple-300 text-xs mt-1">
                RAP: {item.rap.toLocaleString()}
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

function TradesTab({ trades }: { trades: TradeHistory[] }) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-purple-300 text-lg">No trade history</div>
        <Link href="/trade" className="text-purple-400 hover:text-purple-300 mt-2 inline-block">
          Start trading →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {trades.map((trade) => (
        <div
          key={trade.id}
          className="bg-slate-700/50 rounded-lg p-4 border border-purple-500/10 hover:border-purple-500/30 transition-all duration-200"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    trade.status === "completed"
                      ? "bg-green-500/20 text-green-400"
                      : trade.status === "pending"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {trade.status.toUpperCase()}
                </span>
                <span className="text-purple-300 text-sm">
                  {new Date(trade.date).toLocaleDateString()}
                </span>
              </div>
              <div className="text-white">
                <span className="text-red-400">Gave:</span> {trade.itemsGiven.join(", ")}
              </div>
              <div className="text-white">
                <span className="text-green-400">Received:</span> {trade.itemsReceived.join(", ")}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatsTab({ stats, user }: { stats: UserStats | null; user: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Trading Stats */}
        <div className="bg-slate-700/50 rounded-lg p-6 border border-purple-500/10">
          <h3 className="text-xl font-bold text-white mb-4">Trading Statistics</h3>
          <div className="space-y-3">
            <StatRow label="Total Trades" value={stats?.totalTrades || 0} />
            <StatRow label="Success Rate" value={`${stats?.successRate || 0}%`} />
          </div>
        </div>

        {/* Account Info */}
        <div className="bg-slate-700/50 rounded-lg p-6 border border-purple-500/10">
          <h3 className="text-xl font-bold text-white mb-4">Account Information</h3>
          <div className="space-y-3">
            <StatRow label="Member Since" value={stats?.memberSince || "Unknown"} />
            <StatRow label="Account Level" value={user?.level || 1} />
            <StatRow label="Total Items" value={user?.totalItems || 0} />
            <StatRow label="Total RAP" value={`R$ ${(user?.totalRap || 0).toLocaleString()}`} />
          </div>
        </div>
      </div>

      {/* Activity Chart Placeholder */}
      <div className="bg-slate-700/50 rounded-lg p-6 border border-purple-500/10">
        <h3 className="text-xl font-bold text-white mb-4">Trading Activity</h3>
        <div className="h-64 flex items-center justify-center text-purple-300">
          Chart coming soon...
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-purple-300">{label}</span>
      <span className="text-white font-semibold">{value}</span>
    </div>
  );
}

function RobloxAuthSection() {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState(() => Math.floor(100 + Math.random() * 900).toString());
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    setStatus(null);
    try {
      // Use proxy API route to search for user
      const res = await fetch(`/api/roblox/search-user?username=${encodeURIComponent(username)}`);
      if (!res.ok) {
        setStatus("Roblox search API error: " + res.status);
        setChecking(false);
        return;
      }
      const data = await res.json();
      if (!data.data || !Array.isArray(data.data) || !data.data[0]) {
        setStatus("User not found or Roblox API changed.");
        setChecking(false);
        return;
      }
      const userId = data.data[0].id;
      if (!userId) {
        setStatus("User ID not found.");
        setChecking(false);
        return;
      }
      // Use proxy API route to fetch user profile
      const profileRes = await fetch(`/api/roblox/user-profile?userId=${encodeURIComponent(userId)}`);
      if (!profileRes.ok) {
        setStatus("Roblox profile API error: " + profileRes.status);
        setChecking(false);
        return;
      }
      const profileData = await profileRes.json();
      if (typeof profileData.description !== "string") {
        setStatus("Could not read bio. Roblox API may have changed.");
        setChecking(false);
        return;
      }
      if (profileData.description.includes(code)) {
        setStatus("Authentication successful!");
      } else {
        setStatus("Bio does not contain the code. Please update your Roblox bio and try again.");
      }
    } catch (err) {
      setStatus("Network or unexpected error: " + (err instanceof Error ? err.message : String(err)));
    }
    setChecking(false);
  };

  return (
    <div className="bg-slate-700 rounded-lg p-6 border border-purple-500/10 mb-8">
      <h3 className="text-xl font-bold text-white mb-2">Roblox Account Authentication</h3>
      <div className="mb-2 text-purple-300">Enter your Roblox username and set your bio to <span className="font-mono bg-slate-800 px-2 py-1 rounded">{code}</span> to verify ownership.</div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Roblox username"
          className="px-4 py-2 rounded bg-slate-800 text-white border border-purple-500/20 focus:border-purple-500 outline-none"
        />
        <button
          onClick={handleCheck}
          disabled={checking || !username}
          className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg"
        >
          {checking ? "Checking..." : "Authenticate"}
        </button>
      </div>
      {status && <div className="mt-2 text-purple-300">{status}</div>}
    </div>
  );
}