'use client';

import { useState } from 'react';
import { getSerialTier, getGhostTier } from '@/lib/specialSerial';
import { SpecialSerialText } from '@/components/specialSerialText';

interface TradeItem {
  userAssetId: string;
  assetId: string;
  serialNumber: number | null;
  name: string | null;
  imageUrl: string | null;
  rap?: number | null;
}

interface TradeData {
  tradeTimestamp: string;
  receiver: { robloxUserId: string; username: string; displayName: string | null; avatarUrl: string | null; } | null;
  sender: { robloxUserId: string; username: string; displayName: string | null; avatarUrl: string | null; } | null;
  received: TradeItem[];
  sent: TradeItem[];
}

function ItemThumb({ item }: { item: TradeItem | null }) {
  if (!item) {
    return <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] aspect-square" />;
  }

  const serial = item.serialNumber ?? null;
  const tier = getGhostTier(null, serial) ?? getSerialTier(serial);
  const isSpecial = tier !== null;

  return (
    <a
      href={`/uaid/${item.userAssetId}`}
      onClick={e => e.stopPropagation()}
      className="aspect-square bg-[#292929] rounded overflow-hidden relative flex items-center justify-center border border-white/10 hover:border-white/25 transition-all block"
    >
      {item.imageUrl
        ? <img src={item.imageUrl} alt={item.name ?? ''} className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">?</div>
      }
      {(serial != null || tier === 'ghost') && (
        <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded shadow-lg">
          {isSpecial
            ? <SpecialSerialText serial={serial} tier={tier} variant="badge" />
            : <span className="text-orange-400 text-xs font-bold">#{serial}</span>
          }
        </div>
      )}
    </a>
  );
}

function ItemsGrid({ items, label, color }: { items: TradeItem[]; label: string; color: string }) {
  const slots = Array.from({ length: 4 }, (_, i) => items[i] ?? null);
  const total = items.reduce((s, i) => s + (i.rap ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-base font-bold uppercase tracking-widest" style={{ color }}>{label}</p>
        <p className="text-xs text-[#888]">{items.length} item{items.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {slots.map((item, i) => (
          <div key={i} className="flex flex-col gap-1">
            <ItemThumb item={item} />
            {item && (
              <>
                <p className="text-white text-sm font-semibold truncate transition-colors mt-1" title={item.name ?? ''}>{item.name ?? 'Unknown'}</p>
                {item.rap != null && item.rap > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[#888] text-xs">RAP</span>
                    <div className="relative group flex items-center gap-1.5">
                      <span className="text-xs font-semibold" style={{ color: '#43e97b' }}>
                        {item.rap.toLocaleString()} R$
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="flex flex-col gap-0.5 mt-5">
          <span className="text-md font-bold tabular-nums" style={{ color: '#d7d7d7' }}>
            Total: <span style={{ color: '#43e97b' }}>{total.toLocaleString()} R$</span>
          </span>
        </div>
      )}
    </div>
  );
}

export default function TradeModal({ uaid, uaidUpdatedAt }: { uaid: string; uaidUpdatedAt: Date | null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TradeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!uaidUpdatedAt) return null;

  async function openModal() {
    setOpen(true);
    document.body.style.overflow = 'hidden';
    if (data) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/uaid/${uaid}/trade`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed to load'); return; }
      setData(json);
    } catch {
      setError('Failed to load trade data');
    } finally {
      setLoading(false);
    }
  }

  const receivedTotal = data?.received.reduce((s, i) => s + (i.rap ?? 0), 0) ?? 0;
  const sentTotal = data?.sent.reduce((s, i) => s + (i.rap ?? 0), 0) ?? 0;
  const diff = receivedTotal - sentTotal;
  const pct = sentTotal > 0 ? Math.round((diff / sentTotal) * 100) : null;
  const up = diff >= 0;

  return (
    <>
      <button
        onClick={openModal}
        className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors"
      >
        Infer Trade
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1001] p-4" onClick={() => { setOpen(false); document.body.style.overflow = 'unset'; }}>
          <div
            className="bg-[#1e1e1e] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto scrollbar-none"
            style={{ boxShadow: '0 4px 40px rgba(0,0,0,0.5)', scrollbarWidth: 'none' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
              <div>
                <h2 className="text-white font-bold text-2xl">Inferred Trade</h2>
                {data && (
                  <p className="text-[#ccc] text-sm mt-1">
                    Detected at {new Date(data.tradeTimestamp).toLocaleString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {data.receiver && <> · between <a href={`/player/${data.receiver.robloxUserId}`} className="text-green-400 hover:underline" onClick={e => e.stopPropagation()}>{data.receiver.username}</a> & </>}
                    {data.sender && <><a href={`/player/${data.sender.robloxUserId}`} className="text-red-400 hover:underline" onClick={e => e.stopPropagation()}>{data.sender.username}</a></>}

                  </p>
                )}
                {/* close button */}
              </div>
              <button onClick={() => { setOpen(false); document.body.style.overflow = 'unset'; }} className="text-[#aaa] hover:text-white transition text-2xl leading-none ml-4">×</button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {loading && <div className="text-[#aaa] text-sm text-center py-8">Loading trade data...</div>}
              {error && <div className="text-red-400 text-sm text-center py-8">{error}</div>}

              {data && (
                <>
                  <ItemsGrid items={data.received} label="Items Received" color="#4ade80" />

                  {(receivedTotal > 0 || sentTotal > 0) && (
                    <div className="flex items-center justify-center">
                      <div
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm"
                        style={{
                          background: up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                          border: `1px solid ${up ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                          color: up ? '#4ade80' : '#f87171',
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{up ? '▲' : '▼'}</span>
                        <span>{up ? '+' : ''}{diff.toLocaleString()} R${pct !== null ? ` (${up ? '+' : ''}${pct}%)` : ''}</span>
                      </div>
                    </div>
                  )}

                  <ItemsGrid items={data.sent} label="Items Sent" color="#f87171" />

                  <div className="flex items-start gap-2 pt-3 border-t border-white/5">
                    <img src="/Images/manipulated0.webp" alt="" className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-60" />
                    <p className="text-[#888] text-xs">
                      Trade inference is based on matching timestamps and may not be 100% accurate. Robux exchanged cannot be determined.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}