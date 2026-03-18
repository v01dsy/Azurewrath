'use client';

import { useState } from 'react';

interface TradeItem {
  userAssetId: string;
  assetId: string;
  serialNumber: number | null;
  name: string | null;
  imageUrl: string | null;
}

interface TradeData {
  tradeTimestamp: string;
  receiver: {
    robloxUserId: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  sender: {
    robloxUserId: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  received: TradeItem[];
  sent: TradeItem[];
}

function ItemCard({ item }: { item: TradeItem }) {
  return (
    <a href={`/uaid/${item.userAssetId}`} className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-white/5 border border-white/10 hover:border-purple-500/40 transition-colors group">
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
        {item.imageUrl
          ? <img src={item.imageUrl} alt={item.name ?? ''} className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-white/10" />
        }
      </div>
      <div className="text-center">
        <div className="text-white text-xs font-medium leading-tight line-clamp-2">{item.name ?? 'Unknown'}</div>
        {item.serialNumber != null && (
          <div className="text-orange-400 text-xs">#{item.serialNumber}</div>
        )}
        <div className="text-purple-400 text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity">{item.userAssetId}</div>
      </div>
    </a>
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

  return (
    <>
      <button
        onClick={openModal}
        className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors"
      >
        🔁 Infer Trade
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-[#111] border border-white/10 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white font-bold text-lg">🔁 Inferred Trade</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
            </div>

            {loading && <div className="text-slate-400 text-sm text-center py-8">Loading trade data...</div>}
            {error && <div className="text-red-400 text-sm text-center py-8">{error}</div>}

            {data && (
              <div className="space-y-5">
                <div className="text-slate-400 text-xs">
                  Trade detected at <span className="text-white">{new Date(data.tradeTimestamp).toLocaleString()}</span>
                  {data.sender && <> · <a href={`/player/${data.sender.robloxUserId}`} className="text-red-300 hover:underline">{data.sender.displayName ?? data.sender.username}</a> sent, </>}
                  {data.receiver && <><a href={`/player/${data.receiver.robloxUserId}`} className="text-green-300 hover:underline">{data.receiver.displayName ?? data.receiver.username}</a> received</>}
                </div>

                <div>
                  <div className="text-green-400 text-xs font-bold uppercase tracking-wider mb-2">Items Received</div>
                  {data.received.length === 0
                    ? <div className="text-slate-500 text-sm">None tracked</div>
                    : <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {data.received.map(item => <ItemCard key={item.userAssetId} item={item} />)}
                      </div>
                  }
                </div>

                <div className="border-t border-white/10 pt-5">
                  <div className="text-red-400 text-xs font-bold uppercase tracking-wider mb-2">Items Sent</div>
                  {data.sent.length === 0
                    ? <div className="text-slate-500 text-sm">None tracked — other player may not be in the system</div>
                    : <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {data.sent.map(item => <ItemCard key={item.userAssetId} item={item} />)}
                      </div>
                  }
                </div>

                <div className="text-slate-600 text-xs pt-2 border-t border-white/5">
                  ⚠️ Trade inference is based on matching timestamps and may not be 100% accurate. Robux exchanged cannot be determined.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}