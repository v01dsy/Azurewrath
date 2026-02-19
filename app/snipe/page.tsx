// app/snipe/page.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUserSession } from '@/lib/userSession';

interface SnipeConfig {
  id: string;
  assetId: string | null;
  itemName: string | null;
  itemImage: string | null;
  minDeal: number;
  minPrice: number | null;
  maxPrice: number | null;
  enabled: boolean;
}

interface DealItem {
  assetId: string;
  name: string;
  imageUrl?: string;
  percent: number;
  rap: number;
  bestPrice: number;
}

interface FiredDeal {
  assetId: string;
  name: string;
  imageUrl: string | null;
  price: number;
  rap: number;
  deal: number;
  firedAt: number;
}

function fmt(n: number) {
  return n.toLocaleString();
}

function ago(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

// ── ConfigCard ───────────────────────────────────────────────────────────────
function ConfigCard({
  cfg,
  editing,
  onEdit,
  onSaveEdit,
  onToggle,
  onDelete,
}: {
  cfg: SnipeConfig;
  editing: boolean;
  onEdit: () => void;
  onSaveEdit: (patch: Partial<SnipeConfig>) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState({
    minDeal: String(cfg.minDeal),
    minPrice: cfg.minPrice != null ? String(cfg.minPrice) : '',
    maxPrice: cfg.maxPrice != null ? String(cfg.maxPrice) : '',
  });

  return (
    <div className={`rounded-xl border ${cfg.enabled ? 'border-zinc-700' : 'border-zinc-800 opacity-60'} bg-zinc-900/60 p-4`}>
      <div className="flex items-start gap-3">
        {cfg.itemImage && (
          <img src={cfg.itemImage} alt={cfg.itemName ?? ''} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-zinc-100 truncate">{cfg.itemName ?? 'All Items'}</p>
          {!editing ? (
            <p className="text-xs text-zinc-500 mt-0.5">
              ≥{cfg.minDeal}% off
              {cfg.minPrice != null ? ` · min ${fmt(cfg.minPrice)} R$` : ''}
              {cfg.maxPrice != null ? ` · max ${fmt(cfg.maxPrice)} R$` : ''}
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { label: 'Min Deal %', key: 'minDeal' },
                { label: 'Min R$', key: 'minPrice' },
                { label: 'Max R$', key: 'maxPrice' },
              ].map(({ label, key }) => (
                <label key={key} className="space-y-0.5">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
                  <input
                    type="number"
                    value={draft[key as keyof typeof draft]}
                    onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                    className="w-full px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {editing ? (
            <button
              onClick={() => onSaveEdit({
                minDeal: Number(draft.minDeal) || 10,
                minPrice: draft.minPrice ? Number(draft.minPrice) : null,
                maxPrice: draft.maxPrice ? Number(draft.maxPrice) : null,
              })}
              className="px-3 py-1 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition"
            >
              Save
            </button>
          ) : (
            <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition text-xs">
              ✏️
            </button>
          )}
          <button onClick={onToggle} className={`p-1.5 rounded-lg text-xs transition ${cfg.enabled ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-700 text-zinc-600'}`}>
            {cfg.enabled ? '⏸' : '▶'}
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-900/40 text-zinc-600 hover:text-red-400 transition text-xs">
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SnipePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  const [configs, setConfigs] = useState<SnipeConfig[]>([]);
  const [firedDeals, setFiredDeals] = useState<FiredDeal[]>([]);
  const [sniping, setSniping] = useState(false);
  const [status, setStatus] = useState<'idle' | 'live'>('idle');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const snipingRef = useRef(false);
  const prevDealsRef = useRef<Set<string>>(new Set());
  const configsRef = useRef<SnipeConfig[]>([]);
  const isFirstPollRef = useRef(true);
  const tickRef = useRef<NodeJS.Timeout | null>(null);
  const [, forceRender] = useState(0);

  const emptyForm = { assetId: '', minDeal: '10', minPrice: '', maxPrice: '' };
  const [form, setForm] = useState(emptyForm);

  // Keep configsRef in sync so the poll loop always has latest configs
  useEffect(() => {
    configsRef.current = configs;
  }, [configs]);

  // ── auth guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    const session = getUserSession();
    if (!session) {
      router.replace('/verify');
      return;
    }
    setUserId(session.robloxUserId);
  }, [router]);



  // ── load configs ────────────────────────────────────────────────────────
  const loadConfigs = useCallback(async (uid: string) => {
    const res = await fetch(`/api/snipe/config?userId=${uid}`);
    const data = await res.json();
    setConfigs(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    if (userId) loadConfigs(userId);
  }, [userId, loadConfigs]);

  // ── ago ticker ──────────────────────────────────────────────────────────
  useEffect(() => {
    tickRef.current = setInterval(() => forceRender(n => n + 1), 5_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  // ── poll /api/deals every 1 second ──────────────────────────────────────
  const poll = useCallback(async () => {
    if (!snipingRef.current) return;
    try {
      const res = await fetch('/api/deals');
      const deals: DealItem[] = await res.json();

      const currentIds = new Set(deals.map(d => d.assetId));
      const enabledConfigs = configsRef.current.filter(c => c.enabled);

      for (const deal of deals) {
        // On first poll, fire everything that matches configs (deals already on the board)
        // On subsequent polls, only fire deals that are NEW (not seen before)
        if (!isFirstPollRef.current && prevDealsRef.current.has(deal.assetId)) continue;

        // Check against user's snipe configs
        for (const cfg of enabledConfigs) {
          if (cfg.assetId !== null && cfg.assetId !== deal.assetId) continue;
          if (deal.percent < cfg.minDeal) continue;
          if (cfg.minPrice !== null && deal.bestPrice < cfg.minPrice) continue;
          if (cfg.maxPrice !== null && deal.bestPrice > cfg.maxPrice) continue;

          // Deal matches! Fire it.
          const firedDeal: FiredDeal = {
            assetId: deal.assetId,
            name: deal.name,
            imageUrl: deal.imageUrl ?? null,
            price: deal.bestPrice,
            rap: deal.rap,
            deal: deal.percent,
            firedAt: Date.now(),
          };

          setFiredDeals(prev => [firedDeal, ...prev].slice(0, 20));

          // 🔥 Tell Azuresniper extension to auto-buy
          window.dispatchEvent(new CustomEvent('SNIPE_DEAL', { detail: {
            assetId: deal.assetId,
            name: deal.name,
            imageUrl: deal.imageUrl,
            price: deal.bestPrice,
            rap: deal.rap,
            deal: deal.percent,
          }}));

          break;
        }
      }

      // After first poll, mark as no longer first
      isFirstPollRef.current = false;

      // Update seen deals
      prevDealsRef.current = currentIds;

    } catch (err) {
      console.error('[snipe] poll error:', err);
    }
  }, []);

  const startSniping = useCallback(() => {
    if (!userId) return;
    setSniping(true);
    snipingRef.current = true;
    setStatus('live');
    prevDealsRef.current = new Set(); // Reset seen deals on start
    isFirstPollRef.current = true; // Reset first poll flag
    intervalRef.current = setInterval(poll, 1_000);
    poll(); // Fire immediately
  }, [userId, poll]);

  const stopSniping = useCallback(() => {
    setSniping(false);
    snipingRef.current = false;
    setStatus('idle');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    snipingRef.current = false;
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  // ── config CRUD ─────────────────────────────────────────────────────────
  const saveConfig = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await fetch('/api/snipe/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          assetId: form.assetId.trim() || null,
          minDeal: Number(form.minDeal) || 10,
          minPrice: form.minPrice ? Number(form.minPrice) : null,
          maxPrice: form.maxPrice ? Number(form.maxPrice) : null,
        }),
      });
      setForm(emptyForm);
      setShowAddForm(false);
      loadConfigs(userId);
    } finally {
      setSaving(false);
    }
  };

  const toggleConfig = async (id: string, enabled: boolean) => {
    await fetch('/api/snipe/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled: !enabled }),
    });
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, enabled: !enabled } : c));
  };

  const deleteConfig = async (id: string) => {
    await fetch('/api/snipe/config', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setConfigs(prev => prev.filter(c => c.id !== id));
  };

  const saveEdit = async (id: string, patch: Partial<SnipeConfig>) => {
    await fetch('/api/snipe/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    setEditingId(null);
  };

  // ── status pill ─────────────────────────────────────────────────────────
  const statusConfig = {
    idle: { label: 'Idle',  dot: 'bg-zinc-500',                  ring: 'ring-zinc-600' },
    live: { label: 'Live',  dot: 'bg-emerald-400 animate-pulse', ring: 'ring-emerald-600' },
  }[status];

  const dealColor = (pct: number) => {
    if (pct >= 60) return 'text-pink-400';
    if (pct >= 40) return 'text-yellow-400';
    if (pct >= 25) return 'text-purple-400';
    if (pct >= 15) return 'text-blue-400';
    return 'text-emerald-400';
  };

  if (!userId) return null;

  return (
    <div className="min-h-screen w-full text-white px-4 pb-20 pt-10 max-w-5xl mx-auto space-y-8">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight glow-purple">Sniper</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Real-time deal detector — fires the item page the moment a deal drops.
          </p>
        </div>

        <div className="flex items-center gap-3">

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 ring-1 ${statusConfig.ring}`}>
            <span className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
            <span className="text-xs font-medium text-zinc-300">{statusConfig.label}</span>
          </div>
        </div>
      </div>

      {/* START / STOP */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col sm:flex-row items-center gap-6">
        {status === 'live' && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -inset-px rounded-2xl ring-1 ring-emerald-500/30 animate-pulse" />
          </div>
        )}
        <div className="flex-1 space-y-1">
          <p className="font-semibold text-zinc-100">
            {sniping
              ? 'Sniping is active. This page must stay open.'
              : 'Start sniping to watch for deals matching your filters.'}
          </p>
          <p className="text-zinc-500 text-sm">
            When a qualifying deal appears, the Roblox item page will instantly open in a new tab.
          </p>
        </div>
        <button
          onClick={sniping ? stopSniping : startSniping}
          disabled={configs.length === 0 && !sniping}
          className={`
            relative px-8 py-3 rounded-xl font-bold text-sm transition-all duration-200
            disabled:opacity-40 disabled:cursor-not-allowed
            ${sniping
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-purple-900/40'}
          `}
        >
          {sniping ? '⏹ Stop Sniping' : '▶ Start Sniping'}
        </button>
      </div>

      {configs.length === 0 && !sniping && (
        <p className="text-zinc-500 text-sm text-center -mt-4">
          Add at least one snipe filter below before starting.
        </p>
      )}

      {/* FILTERS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-200">Snipe Filters</h2>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition"
          >
            {showAddForm ? 'Cancel' : '+ Add Filter'}
          </button>
        </div>

        {showAddForm && (
          <div className="rounded-xl border border-blue-500/30 bg-zinc-900/80 p-5 space-y-4">
            <p className="text-sm text-zinc-400">
              Leave <span className="text-zinc-200">Item ID</span> blank to match <em>all</em> items.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Item Asset ID (optional)</span>
                <input
                  type="number"
                  placeholder="e.g. 9255011"
                  value={form.assetId}
                  onChange={e => setForm(f => ({ ...f, assetId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Min Deal %</span>
                <input
                  type="number" min={1} max={99}
                  value={form.minDeal}
                  onChange={e => setForm(f => ({ ...f, minDeal: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Min Price (R$) — optional</span>
                <input
                  type="number" min={0}
                  placeholder="No minimum"
                  value={form.minPrice}
                  onChange={e => setForm(f => ({ ...f, minPrice: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Max Price (R$) — optional</span>
                <input
                  type="number" min={0}
                  placeholder="No maximum"
                  value={form.maxPrice}
                  onChange={e => setForm(f => ({ ...f, maxPrice: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                onClick={saveConfig}
                disabled={saving}
                className="px-6 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white transition disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Filter'}
              </button>
            </div>
          </div>
        )}

        {configs.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-zinc-500 text-sm">
            No filters yet. Sniper will not run until you add at least one.
          </div>
        )}

        {configs.map(cfg => (
          <ConfigCard
            key={cfg.id}
            cfg={cfg}
            editing={editingId === cfg.id}
            onEdit={() => setEditingId(editingId === cfg.id ? null : cfg.id)}
            onSaveEdit={(patch) => saveEdit(cfg.id, patch)}
            onToggle={() => toggleConfig(cfg.id, cfg.enabled)}
            onDelete={() => deleteConfig(cfg.id)}
          />
        ))}
      </section>

      {/* FIRED DEALS LOG */}
      {firedDeals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-200">Deals Fired This Session</h2>
          <div className="space-y-2">
            {firedDeals.map((d, i) => (
              <a
                key={i}
                href={`https://www.roblox.com/catalog/${d.assetId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60 px-4 py-3 transition group"
              >
                {d.imageUrl && (
                  <img src={d.imageUrl} alt={d.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-zinc-100 truncate group-hover:text-white">{d.name}</p>
                  <p className="text-xs text-zinc-500">{ago(d.firedAt)}</p>
                </div>
                <div className="text-right flex-shrink-0 space-y-0.5">
                  <p className={`text-lg font-bold ${dealColor(d.deal)}`}>{d.deal}% off</p>
                  <p className="text-xs text-zinc-400">{fmt(d.price)} R$ <span className="text-zinc-600">/ RAP {fmt(d.rap)}</span></p>
                </div>
                <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* HOW IT WORKS */}
      <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">How it works</h2>
        <ol className="space-y-2 text-sm text-zinc-400 list-decimal list-inside">
          <li>The worker bot scans Roblox every second for price changes.</li>
          <li>When an item drops below RAP by your specified %, it records the deal.</li>
          <li>This page checks for new deals every second over a live connection.</li>
          <li>The Azuresniper extension auto-buys it before the Roblox tab even loads.</li>
        </ol>
        <p className="text-xs text-zinc-600 mt-1">
          💡 Keep this tab open and the Azuresniper extension installed while sniping.
        </p>
      </section>

    </div>
  );
}