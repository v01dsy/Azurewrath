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

  useEffect(() => {
    const user = getUserSession();
    if (user && user.robloxUserId) setProfileHref(`/player/${user.robloxUserId}`);
  }, []);

  useEffect(() => {
    fetch("/api/stats").then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  const cards = [
    { img: "/Images/search.webp",    title: "Item Search",        desc: "Look up any Roblox limited - RAP history, price trends, and resale data.",              accent: "#419de7", href: "/search"    },
    { img: "/Images/deals.webp",     title: "Live Deals",         desc: "Spot underpriced items the moment they hit the market before anyone else.",              accent: "#e4b74f", href: "/deals"     },
    { img: "/Images/sales.webp",     title: "Recent Sales",       desc: "Watch limited sales happen in real time and track RAP changes as they occur.",           accent: "#e5ff00", href: "/sales"     },
    { img: "/Images/snipe.webp",     title: "Item Sniper",        desc: "Automatically fire the Roblox item page the moment a deal matching your filters drops.", accent: "#bf6fe7", href: "/snipe"     },
    { img: "/Images/players.webp",   title: "Leaderboard",        desc: "See who holds the most valuable inventories. Rankings updated in real time.",            accent: "#4edd4e", href: "/players"   },
    { img: "/Images/watchlist.webp", title: "Watchlist",          desc: "Track your favorite items and get alerted via Discord or browser when prices change.",   accent: "#bbc8ff", href: "/watchlist" },
  ];

  const steps = [
    { label: "Step 1 - Verify",  color: "#4fc3f7", desc: "Link your Roblox account securely so we can track your inventory." },
    { label: "Step 2 - Explore", color: "#a259f7", desc: "Browse thousands of Limiteds, compare RAP values, spot underpriced deals, and snipe items before anyone else." },
    { label: "Step 3 - Trade",   color: "#ec4899", desc: "Set watchlist alerts, get notified via Discord or browser, and make smarter trades with real data behind every decision." },
  ];

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .fade-up   { animation: fadeUp 1s cubic-bezier(0.22,1,0.36,1) both; }
        .fade-up-1 { animation-delay: 0.05s; }
        .fade-up-2 { animation-delay: 0.15s; }
        .fade-up-3 { animation-delay: 0.25s; }
        .fade-up-4 { animation-delay: 0.35s; }
        .fade-up-5 { animation-delay: 0.45s; }
        .shimmer-text {
          background: linear-gradient(90deg, #fff 0%, #fff 35%, #ffffff 50%, #fff 65%, #fff 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }
        .feature-card {
          position: relative;
          background: #111;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          padding: 16px 20px;
          transition: transform 0.25s;
          overflow: hidden;
          text-decoration: none;
          display: block;
        }
        .feature-card:hover { transform: translateY(-3px); }
        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
        }
      `}</style>

      <div className="min-h-screen w-full bg-[#0a0a0a]/20 text-white -mt-20 pt-20">
        <div className="max-w-5xl mx-auto px-6">

          {/* Hero */}
          <section className="text-center pt-10">
            <h1 className="fade-up fade-up-1 font-black leading-tight tracking-tight mb-5">
              <span className="shimmer-text block text-6xl md:text-7xl">Azurewrath</span>
              <span className="block text-sm font-semibold uppercase tracking-widest mt-6 mb-4" style={{ color: 'rgba(255,255,255,0.75)' }}>Roblox Limited Tracker</span>
            </h1>
            <p className="fade-up fade-up-2 text-base max-w-xl mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.8)' }}>
              Your ultimate destination for Roblox Limited trading.
            </p>
            <p className="fade-up fade-up-3 text-sm max-w-xl mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Track RAP history, live deals, and inventory analytics all in one place.
            </p>

            <div className="fade-up fade-up-4 flex items-center justify-center gap-4 mb-4">
              <Link href={profileHref}
                className="px-6 py-2.5 rounded-xl font-bold text-sm transition-all hover:scale-105 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#fff', boxShadow: '0 0 24px rgba(124,58,237,0.4)' }}>
                View My Inventory
              </Link>
            </div>

            {stats && (
              <div className="fade-up fade-up-5 inline-flex items-center gap-5 px-5 py-2.5 rounded-xl"
                style={{ background: '#111', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold" style={{ color: '#4fc3f7' }}>{formatNumber(stats.users)}</span>
                  <span className="text-[11px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.7)' }}>Players Tracked</span>
                </div>
                <div className="w-px h-5" style={{ background: 'rgba(255,255,255,0.1)' }} />
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold" style={{ color: '#a259f7' }}>{formatNumber(stats.uaidsTracked)}</span>
                  <span className="text-[11px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.7)' }}>Items Indexed</span>
                </div>
              </div>
            )}
          </section>

          <div className="divider mt-6 mb-6" style={{ animation: 'fadeIn 1s ease forwards', animationDelay: '1s', opacity: 0 }} />

          {/* Feature cards */}
          <section className="mb-10">
            <p className="text-center text-sm uppercase tracking-widest mb-6 font-semibold"
              style={{ color: 'rgba(255,255,255,0.4)', animation: 'fadeIn 1s ease forwards', animationDelay: '1s', opacity: 0 }}>
              Features
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 [&>*:nth-child(5)]:md:col-start-2 [&>*:nth-child(5)]:justify-self-end [&>*:nth-child(6)]:justify-self-start">
              {cards.map((card, i) => (
                <Link key={card.title} href={card.href} className="feature-card fade-up" style={{ animationDelay: `${0.1 * i + 0.4}s` }}>
                  <div className="absolute inset-0 rounded-2xl opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at top left, ${card.accent}12, transparent 60%)` }} />
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${card.accent}18`, border: `1px solid ${card.accent}30` }}>
                        <img src={card.img} alt={card.title} className="w-7 h-7 object-contain"
                          style={{ filter: `drop-shadow(0 0 6px ${card.accent}88)` }} />
                      </div>
                      <h3 className="text-base font-bold text-white">{card.title}</h3>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>{card.desc}</p>
                    <div className="mt-3 flex items-center gap-1 text-xs font-semibold" style={{ color: card.accent }}>
                      Explore
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <div className="divider mt-6 mb-6" style={{ animation: 'fadeIn 1s ease forwards', animationDelay: '1.2s', opacity: 0 }} />

          {/* How it works */}
          <section className="max-w-xl mx-auto mb-12 space-y-8">
            <p className="text-center text-sm uppercase tracking-widest mb-6 font-semibold"
              style={{ color: 'rgba(255,255,255,0.4)', animation: 'fadeIn 1s ease forwards', animationDelay: '1.2s', opacity: 0 }}>
              How It Works
            </p>
            {steps.map(step => (
              <div key={step.label}>
                <h4 className="text-sm font-bold uppercase tracking-widest mb-2" style={{ color: step.color }}>{step.label}</h4>
                <p className="text-sm text-slate-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </section>

          <div className="divider mt-6 mb-6" />

          {/* Disclaimer */}
          <section className="pb-12">
            <h6 className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.15)' }}>Disclaimer</h6>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.15)' }}>
              Azurewrath is an independent fan-made tool and is not affiliated with, endorsed by, or connected to Roblox Corporation. All item names, trademarks, and assets belong to their respective owners.
            </p>
          </section>

        </div>
      </div>
    </>
  );
}