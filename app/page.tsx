// app/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getUserSession } from "@/lib/userSession";

interface PlatformStats {
  users: number;
  uaidsTracked: number;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

export default function Home() {
  const [profileHref, setProfileHref] = useState("/verify");
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    const user = getUserSession();
    if (user && user.robloxUserId) {
      setProfileHref(`/player/${user.robloxUserId}`);
    }
  }, []);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => setStatsError(true));
  }, []);

  return (
    <div className="container mx-auto px-4 py-16 space-y-20">

      {/* h1 — Main page identity / SEO target */}
      <section className="text-center space-y-4">
        <h1 className="text-6xl font-bold glow-purple">
          Azurewrath... Built to Trade...
        </h1>
        <p className="text-2xl text-slate-400 max-w-2xl mx-auto">
          Your ultimate destination for Roblox Limited trading.
        </p>
      </section>

      {/* h2 — Major section heading */}
      <section className="max-w-5xl mx-auto space-y-6">
        <h2 className="text-4xl font-bold text-center">
          Everything You Need to Trade Smarter
        </h2>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-neon-blue/10 to-transparent border border-neon-blue/20 rounded-lg p-6">
            <div className="text-3xl mb-3">📊</div>
            {/* h3 — Card / feature heading */}
            <h3 className="text-xl font-semibold mb-2">Live Dashboard</h3>
            <p className="text-slate-400">
              Track prices and trends for all your favorite Limited items.
            </p>
          </div>

          <div className="bg-gradient-to-br from-neon-purple/10 to-transparent border border-neon-purple/20 rounded-lg p-6">
            <div className="text-3xl mb-3">🔍</div>
            <h3 className="text-xl font-semibold mb-2">Smart Search</h3>
            <p className="text-slate-400">
              Find the best deals and investment opportunities instantly.
            </p>
          </div>

          <div className="bg-gradient-to-br from-neon-magenta/10 to-transparent border border-neon-magenta/20 rounded-lg p-6">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="text-xl font-semibold mb-2">Real-Time Updates</h3>
            <p className="text-slate-400">
              Get instant notifications when prices change on your watchlist.
            </p>
          </div>
        </div>
      </section>

      {/* h2 — Second major section */}
      <section className="max-w-5xl mx-auto space-y-8">
        <h2 className="text-4xl font-bold text-center">How It Works</h2>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            {/* h4 — Step label / sub-feature */}
            <h4 className="text-lg font-semibold text-neon-blue uppercase tracking-widest">
              Step 1 — Verify
            </h4>
            <p className="text-slate-400">
              Link your Roblox account securely so we can show your inventory
              and trade history.
            </p>

            <h4 className="text-lg font-semibold text-neon-purple uppercase tracking-widest">
              Step 2 — Explore
            </h4>
            <p className="text-slate-400">
              Browse thousands of Limiteds, compare RAP values, and spot
              underpriced items before anyone else.
            </p>

            <h4 className="text-lg font-semibold text-neon-magenta uppercase tracking-widest">
              Step 3 — Trade
            </h4>
            <p className="text-slate-400">
              Connect with other traders, set alerts, and make smarter trades
              with real data behind every decision.
            </p>
          </div>

          {/* Live stats panel */}
          <div className="bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-xl p-8 space-y-6">
            {/* h5 — Panel heading */}
            <h5 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
              Platform Stats
            </h5>

            
            {statsError ? (
              <p className="text-slate-500 text-sm">Stats unavailable.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-3xl font-bold text-white">
                    {stats ? formatNumber(stats.uaidsTracked) : "..."}
                  </p>
                  <p className="text-slate-400 text-sm">Unique assets (UAIDs) scanned</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-white">
                    {stats ? formatNumber(stats.users) : "..."}
                  </p>
                  <p className="text-slate-400 text-sm">Registered traders</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center">
        <Link
          href={profileHref}
          className="inline-block bg-gradient-to-r from-neon-blue to-neon-purple px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition"
        >
          Get Started →
        </Link>
      </section>

      {/* Legal / fine print section — natural home for h6 */}
      <section className="max-w-5xl mx-auto border-t border-white/10 pt-8 space-y-2">
        {/* h6 — Fine print / disclaimer label */}
        <h6 className="text-xs font-semibold uppercase tracking-widest text-slate-600">
          Disclaimer
        </h6>
        <p className="text-xs text-slate-600">
          Azurewrath is an independent fan-made tool and is not affiliated with,
          endorsed by, or connected to Roblox Corporation. All item names,
          trademarks, and assets belong to their respective owners.
        </p>
      </section>

    </div>
  );
}