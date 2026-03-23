// app/watchlist/page.tsx
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { getUserSession } from '@/lib/userSession';

interface WatchlistItem {
  assetId: string;
  name: string;
  imageUrl?: string | null;
  manipulated: boolean;
  currentPrice?: number | null;
  currentRap?: number | null;
  lastUpdated?: string | null;
  addedAt: string;
  priceAlerts: boolean;
  salesAlerts: boolean;
  tradeAlerts: boolean;
  tradeAlertType: string;
}

export type TradeAlertType = 'contains' | 'requesting' | 'offering';

function PriceBadge({ label, value, color }: { label: string; value?: number | null; color: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
      <span className={`font-bold text-lg ${color}`}>
        {value != null ? `${value.toLocaleString()} R$` : '—'}
      </span>
    </div>
  );
}

function DealBadge({ price, rap }: { price?: number | null; rap?: number | null }) {
  if (!price || !rap || price >= rap) return null;
  const pct = Math.round(((rap - price) / rap) * 100);
  if (pct < 2) return null;
  const color =
    pct >= 20 ? 'bg-green-500/20 text-green-400 border-green-500/40' :
    pct >= 10 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' :
                'bg-blue-500/20 text-blue-400 border-blue-500/40';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${color}`}>
      {pct}% below RAP
    </span>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${on ? 'bg-purple-600' : 'bg-white/20'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function SettingsRow({ label, sublabel, right }: { label: string; sublabel?: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="min-w-0">
        <p className="text-sm text-white font-medium">{label}</p>
        {sublabel && <p className="text-xs text-slate-500 mt-0.5">{sublabel}</p>}
      </div>
      <div className="flex-shrink-0">{right}</div>
    </div>
  );
}

export interface WatchlistAlertSettings {
  priceAlerts: boolean;
  salesAlerts: boolean;
  tradeAlerts: boolean;
  tradeAlertType: string;
}

export function WatchlistSettingsModal({
  item,
  onClose,
  onSave,
  isAdding = false,
}: {
  item: WatchlistItem | { assetId: string; name: string; imageUrl?: string | null; priceAlerts: boolean; salesAlerts: boolean; tradeAlerts: boolean; tradeAlertType: string };
  onClose: () => void;
  onSave: (assetId: string, priceAlerts: boolean, salesAlerts: boolean, tradeAlerts: boolean, tradeAlertType: TradeAlertType) => Promise<void>;
  isAdding?: boolean;
}) {
  const [priceAlerts, setPriceAlerts] = useState(item.priceAlerts);
  const [salesAlerts, setSalesAlerts] = useState(item.salesAlerts);
  const [tradeAlerts, setTradeAlerts] = useState(item.tradeAlerts);
  const [tradeAlertType, setTradeAlertType] = useState<TradeAlertType>((item.tradeAlertType as TradeAlertType) || 'contains');
  const [advanced, setAdvanced] = useState(item.tradeAlertType !== 'contains');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(item.assetId, priceAlerts, salesAlerts, tradeAlerts, advanced ? tradeAlertType : 'contains');
    setSaving(false);
    onClose();
  };

  const imgSrc = item.imageUrl ?? `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=150&height=150&format=Webp`;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>

        <div className="flex items-center gap-4 px-5 pt-5 pb-4 border-b border-white/10">
          <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10 flex-shrink-0">
            <img src={imgSrc} alt={item.name} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-base truncate">{item.name}</h2>
            <p className="text-slate-500 text-xs">Notification settings</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition text-2xl leading-none flex-shrink-0">×</button>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Price & Sales</p>
            <SettingsRow label="Price changes" sublabel="Alert when best price changes" right={<Toggle on={priceAlerts} onClick={() => setPriceAlerts(v => !v)} />} />
            <SettingsRow label="Sales (RAP changes)" sublabel="Alert when item is sold" right={<Toggle on={salesAlerts} onClick={() => setSalesAlerts(v => !v)} />} />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Trade Ads</p>
            <SettingsRow
              label="Trade ad alerts"
              sublabel="Alert when this item appears in a trade ad"
              right={
                <Toggle
                  on={tradeAlerts}
                  onClick={() => {
                    const next = !tradeAlerts;
                    setTradeAlerts(next);
                    if (!next) { setAdvanced(false); setTradeAlertType('contains'); }
                  }}
                />
              }
            />

            {tradeAlerts && (
              <div className="ml-1 pt-1 space-y-3">
                <button onClick={() => { setAdvanced(v => !v); if (advanced) setTradeAlertType('contains'); }} className="flex items-start gap-3 w-full text-left group">
                  <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${advanced ? 'bg-purple-600 border-purple-500' : 'border-white/20 bg-white/5 group-hover:border-white/40'}`}>
                    {advanced && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <div>
                    <span className="text-sm text-slate-300">Advanced — specify side</span>
                    <p className="text-xs text-slate-600">Choose requesting or offering only</p>
                  </div>
                </button>

                {advanced && (
                  <div className="ml-7 flex flex-col gap-2">
                    {(['requesting', 'offering'] as TradeAlertType[]).map(t => (
                      <button key={t} onClick={() => setTradeAlertType(t)} className="flex items-start gap-3 text-left group">
                        <div className={`w-4 h-4 mt-0.5 rounded-full border flex items-center justify-center transition-colors flex-shrink-0 ${tradeAlertType === t ? 'border-purple-500 bg-purple-600' : 'border-white/20 bg-white/5 group-hover:border-white/40'}`}>
                          {tradeAlertType === t && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <div>
                          <span className="text-sm text-slate-300 capitalize">{t}</span>
                          <p className="text-xs text-slate-600">
                            {t === 'requesting' ? 'Someone wants this item in a trade' : 'Someone is offering this item in a trade'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pb-5">
          <button onClick={handleSave} disabled={saving || (!priceAlerts && !salesAlerts && !tradeAlerts)} className={`w-full py-2.5 rounded-xl text-white font-semibold text-sm transition disabled:opacity-50 hover:opacity-90 ${isAdding ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gradient-to-r from-purple-600 to-pink-600'}`}>
            {saving ? (isAdding ? 'Adding...' : 'Saving...') : (isAdding ? 'Add to Watchlist' : 'Save Settings')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const router = useRouter();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [settingsItem, setSettingsItem] = useState<WatchlistItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const user = typeof window !== 'undefined' ? getUserSession() : null;

  const fetchWatchlist = useCallback(async () => {
    if (!user) return;
    try {
      const res = await axios.get(`/api/user/watchlist?userId=${user.robloxUserId}`);
      setItems(res.data.items);
    } catch {
      setError('Failed to load your watchlist.');
    } finally {
      setLoading(false);
    }
  }, [user?.robloxUserId]);

  useEffect(() => {
    if (!user) { router.push('/verify'); return; }
    fetchWatchlist();
  }, []);

  useEffect(() => { document.title = 'Watchlist | Azurewrath'; }, []);

  const handleRemove = async (assetId: string, name: string) => {
    if (!user) return;
    setRemoving(prev => new Set(prev).add(assetId));
    try {
      await axios.delete(`/api/items/${assetId}/watchlist`, { data: { userId: user.robloxUserId } });
      setItems(prev => prev.filter(i => i.assetId !== assetId));
    } catch {
      alert(`Failed to remove ${name} from watchlist.`);
    } finally {
      setRemoving(prev => { const next = new Set(prev); next.delete(assetId); return next; });
    }
  };

  const handleSaveSettings = async (assetId: string, priceAlerts: boolean, salesAlerts: boolean, tradeAlerts: boolean, tradeAlertType: TradeAlertType) => {
    if (!user) return;
    await axios.patch('/api/user/watchlist', {
      userId: user.robloxUserId,
      assetId,
      priceAlerts,
      salesAlerts,
      tradeAlerts,
      tradeAlertType,
    });
    setItems(prev => prev.map(i =>
      i.assetId === assetId ? { ...i, priceAlerts, salesAlerts, tradeAlerts, tradeAlertType } : i
    ));
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-slate-400">Loading your watchlist...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12 flex items-center justify-center">
        <p className="text-red-400 text-lg">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12 flex items-center justify-center">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold glow-purple">Your Watchlist is Empty</h1>
          <p className="text-slate-400 text-lg max-w-md mx-auto">
            Browse items and click <strong className="text-neon-blue">Add to Watchlist</strong> to track their prices here.
          </p>
          <button onClick={() => router.push('/search')} className="inline-block bg-gradient-to-r from-neon-blue to-neon-purple px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition">
            Browse Items →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12">
      <div className="max-w-5xl mx-auto space-y-8">

        <div>
          <h1 className="text-4xl font-bold glow-purple">Watchlist</h1>
          <p className="text-slate-400 mt-1">{items.length} item{items.length !== 1 ? 's' : ''} tracked</p>
        </div>

        <div className="space-y-3">
          {items.map((item) => {
            const imgSrc = item.imageUrl ?? `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=150&height=150&format=Webp`;
            const isRemoving = removing.has(item.assetId);
            return (
              <div key={item.assetId} className="group flex items-center gap-4 bg-gradient-to-br from-slate-800/60 to-slate-900/40 border border-neon-blue/10 hover:border-neon-blue/30 rounded-xl p-4 transition-all duration-200">
                <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-slate-700 cursor-pointer hover:border-neon-blue/50 transition relative" onClick={() => router.push(`/item/${item.assetId}`)}>
                  <img src={imgSrc} alt={item.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/Images/icon.webp'; }} />
                  {item.manipulated && <img src="/Images/manipulated1.webp" alt="Manipulated" className="absolute top-0.5 left-0.5 w-5 h-5" />}
                </div>

                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/item/${item.assetId}`)}>
                  <p className="font-semibold text-white truncate group-hover:text-neon-blue transition-colors">{item.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500 font-mono">#{item.assetId}</span>
                    <DealBadge price={item.currentPrice} rap={item.currentRap} />
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-6 mr-2">
                  <PriceBadge label="Best Price" value={item.currentPrice} color="text-neon-blue" />
                  <PriceBadge label="RAP" value={item.currentRap} color="text-neon-purple" />
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => router.push(`/item/${item.assetId}`)} className="hidden sm:block text-sm px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition">
                    View
                  </button>
                  <button onClick={() => setSettingsItem(item)} title="Notification settings" className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/25 transition">
                    <img src="/Images/settings.webp" alt="Settings" className="w-5 h-5 object-contain opacity-50 hover:opacity-100 transition" />
                  </button>
                  <button onClick={() => handleRemove(item.assetId, item.name)} disabled={isRemoving} className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 hover:border-red-500/50 text-red-400 hover:text-red-300 transition disabled:opacity-40 disabled:cursor-not-allowed">
                    {isRemoving ? <span className="animate-spin text-xs">⚙️</span> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {settingsItem && (
        <WatchlistSettingsModal
          item={settingsItem}
          onClose={() => setSettingsItem(null)}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
}