'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getUserSession } from '@/lib/userSession';
import { getSerialTier } from '@/lib/specialSerial';
import { SpecialSerialText } from '@/components/specialSerialText';

interface TradeItem {
  id: string;
  assetId: string;
  name: string;
  imageUrl: string | null;
  manipulated: boolean;
  rap: number | null;
  userAssetId?: string | null;
  serialNumber?: number | null;
}

interface TradeAd {
  id: string;
  note: string | null;
  active: boolean;
  offerRobux: number;
  requestRobux: number;
  createdAt: string;
  user: {
    robloxUserId: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  offerItems: TradeItem[];
  requestItems: TradeItem[];
}

function timeAgo(s: string) {
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function ItemCard({ item }: { item: TradeItem | null }) {
  if (!item) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="rounded-xl border border-dashed border-white/[0.07] bg-white/[0.02] aspect-square" />
      </div>
    );
  }

  const serial = item.serialNumber ?? null;
  const tier = getSerialTier(serial);
  const isSpecial = tier !== null;

  return (
    <div className="flex flex-col gap-1.5">
      <Link
        href={`/item/${item.assetId}`}
        className="relative block rounded-xl overflow-hidden border border-white/10 bg-black/60 hover:border-white/25 transition-all group aspect-square"
      >
        {item.imageUrl
          ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
          : <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">?</div>
        }
        {item.manipulated && (
          <img src="/Images/manipulated1.webp" alt="manip" className="absolute top-1.5 left-1.5 w-5 h-5" />
        )}
        {serial != null && (
          <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-lg serial-sm">
            <style>{`.serial-sm span { font-size: 11px !important; }`}</style>
            {isSpecial
              ? <SpecialSerialText serial={serial} tier={tier} variant="badge" />
              : <span className="font-bold text-orange-400" style={{ fontSize: 11 }}>#{serial}</span>
            }
          </div>
        )}
      </Link>
      <p className="text-white text-xs font-semibold truncate">{item.name}</p>
      {item.rap != null && item.rap > 0 && (
        <p className="text-slate-400 text-xs tabular-nums">{item.rap.toLocaleString()} R$</p>
      )}
    </div>
  );
}

function ItemsGrid({ items, label, robux = 0 }: { items: TradeItem[]; label: string; robux?: number }) {
  const slots = Array.from({ length: 4 }, (_, i) => items[i] ?? null);
  const itemRap  = items.reduce((s, i) => s + (i.rap ?? 0), 0);
  const robux70  = Math.round(robux * 0.7);
  const total    = itemRap + robux70;

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-white/30" />
          <p className="text-xs font-bold uppercase tracking-widest text-slate-300">{label}</p>
        </div>
        <p className="text-xs text-slate-500">{items.length} item{items.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {slots.map((item, i) => <ItemCard key={i} item={item} />)}
      </div>

      {robux > 0 && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-500/5 px-3 py-2">
          <span className="text-purple-400 font-bold text-xs">R$</span>
          <span className="text-purple-300 font-bold text-sm tabular-nums">{robux.toLocaleString()} Robux</span>
        </div>
      )}

      {total > 0 && (
        <div className="mt-3 flex flex-col gap-0.5">
          <span className="text-xs text-slate-500 tabular-nums">
            {robux > 0
              ? `${itemRap.toLocaleString()} RAP + ${robux70.toLocaleString()} Robux (70%)`
              : `${itemRap.toLocaleString()} RAP`}
          </span>
          <span className="text-sm font-bold tabular-nums" style={{ color: '#43e97b' }}>
            Total: {total.toLocaleString()} R$
          </span>
        </div>
      )}
    </div>
  );
}

export default function TradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ad, setAd] = useState<TradeAd | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const session = getUserSession();
    if (session) setCurrentUserId(session.robloxUserId);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/trade/${id}`);
        if (!res.ok) { setNotFound(true); return; }
        const data = await res.json();
        setAd(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleDelete = async () => {
    if (!confirm('Delete this trade ad?')) return;
    setDeleting(true);
    const res = await fetch(`/api/trade/${id}`, { method: 'DELETE' });
    if (res.ok) window.location.href = '/trade';
    else setDeleting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !ad) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-slate-400 text-lg">Trade ad not found.</p>
        <Link href="/trade" className="text-sm text-slate-500 hover:text-white transition">← Back to Trade Ads</Link>
      </div>
    );
  }

  const isOwn = currentUserId === ad.user.robloxUserId;

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 pb-16 px-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Back */}
        <Link href="/trade" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-white text-sm transition">
          ← Trade Ads
        </Link>

        {/* Card */}
        <div
          className="rounded-2xl border border-white/10 bg-[#0d0d0f] overflow-hidden"
          style={{ boxShadow: '0 4px 40px rgba(0,0,0,0.5)' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 pt-6 pb-5 border-b border-white/[0.06]">
            <Link href={`/player/${ad.user.robloxUserId}`} className="flex items-center gap-3 group flex-1 min-w-0">
              {ad.user.avatarUrl && (
                <img
                  src={ad.user.avatarUrl}
                  alt={ad.user.username}
                  className="w-12 h-12 rounded-full border border-white/10 group-hover:border-white/30 transition flex-shrink-0"
                />
              )}
              <div className="min-w-0">
                <p className="text-white font-bold group-hover:text-white/70 transition truncate">
                  {ad.user.displayName ?? ad.user.username}
                </p>
                <p className="text-slate-500 text-sm">@{ad.user.username} · {timeAgo(ad.createdAt)}</p>
              </div>
            </Link>
            <a
              href={`https://www.roblox.com/users/${ad.user.robloxUserId}/trade`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-sm px-4 py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border border-purple-500/30 hover:border-purple-400/50 transition font-semibold"
            >
              Send Trade ↗
            </a>
          </div>

          {/* Items */}
          <div className="px-6 py-6 flex flex-col gap-6">
            <ItemsGrid items={ad.offerItems} label="Offering" robux={ad.offerRobux} />

            {/* RAP difference bar */}
            {(() => {
              const offerTotal   = ad.offerItems.reduce((s, i) => s + (i.rap ?? 0), 0) + Math.round((ad.offerRobux ?? 0) * 0.7);
              const requestTotal = ad.requestItems.reduce((s, i) => s + (i.rap ?? 0), 0) + Math.round((ad.requestRobux ?? 0) * 0.7);
              if (offerTotal === 0 && requestTotal === 0) return null;
              // owner: am I getting a good deal? / viewer: is this a good offer for me to accept?
              const diff = isOwn
                ? requestTotal - offerTotal
                : offerTotal - requestTotal;
              const pct = requestTotal > 0 ? Math.round((diff / requestTotal) * 100) : null;
              const up  = diff >= 0;
              return (
                <div className="flex items-center justify-center">
                  <div
                    className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-bold text-sm"
                    style={{
                      background: up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                      border: `1px solid ${up ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      color: up ? '#4ade80' : '#f87171',
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{up ? '▲' : '▼'}</span>
                    <span>
                      {up ? '+' : ''}{diff.toLocaleString()} R$
                      {pct !== null && ` (${up ? '+' : ''}${pct}%)`}
                    </span>
                  </div>
                </div>
              );
            })()}

            <ItemsGrid items={ad.requestItems} label="Requesting" robux={ad.requestRobux} />
          </div>

          {/* Note */}
          {ad.note && (
            <div className="px-6 pb-5">
              <p className="text-slate-400 text-sm bg-white/[0.03] rounded-lg px-4 py-3 border border-white/5 italic">
                "{ad.note}"
              </p>
            </div>
          )}

          {/* Delete (own ads) */}
          {isOwn && ad.active && (
            <div className="px-6 pb-6 -mt-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="block w-full text-center py-2.5 rounded-xl font-semibold text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete Trade Ad'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}