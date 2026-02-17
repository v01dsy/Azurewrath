'use client';

// app/snipe/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Snipe page — requires Roblox login.
// • Shows Robux balance
// • Manage snipe configs (filters)
// • Live SSE connection — auto-opens item page when a deal fires
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUserSession } from '@/lib/userSession';

// ── types ─────────────────────────────────────────────────────────────────

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

interface DealEvent {
  assetId: string;
  name: string;
  imageUrl: string | null;
  price: number;
  rap: number;
  deal: number; // %
}

interface FiredDeal extends DealEvent {
  firedAt: number; // Date.now()
}

// ── helpers ───────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString();
}

function ago(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

// ── component ─────────────────────────────────────────────────────────────

export default function SnipePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const [robux, setRobux] = useState<number | null>(null);
  const [configs, setConfigs] = useState<SnipeConfig[]>([]);
  const [firedDeals, setFiredDeals] = useState<FiredDeal[]>([]);
  const [sniping, setSniping] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const tickRef = useRef<NodeJS.Timeout | null>(null);
  const [, forceRender] = useState(0);

  // ── new config form state ─────────────────────────────────────────────
  const emptyForm = { assetId: '', minDeal: '10', minPrice: '', maxPrice: '' };
  const [form, setForm] = useState(emptyForm);

  // ── auth guard ────────────────────────────────────────────────────────
  useEffect(() => {
    const session = getUserSession();
    if (!session) {
      router.replace('/verify');
      return;
    }
    setUserId(session.robloxUserId);
    setUsername(session.username ?? session.displayName ?? '');
  }, [router]);

  // ── fetch robux balance ───────────────────────────────────────────────
  const fetchRobux = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`/api/snipe/robux?userId=${uid}`);
      const data = await res.json();
      setRobux(data.robux ?? null);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!userId) return;
    fetchRobux(userId);
    const iv = setInterval(() => fetchRobux(userId), 60_000);
    return () => clearInterval(iv);
  }, [userId, fetchRobux]);

  // ── load configs ──────────────────────────────────────────────────────
  const loadConfigs = useCallback(async (uid: string) => {
    const res = await fetch(`/api/snipe/config?userId=${uid}`);
    const data = await res.json();
    setConfigs(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    if (userId) loadConfigs(userId);
  }, [userId, loadConfigs]);

  // ── "ago" ticker ──────────────────────────────────────────────────────
  useEffect(() => {
    tickRef.current = setInterval(() => forceRender(n => n + 1), 5_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  // ── SSE connection ────────────────────────────────────────────────────
  const startSniping = useCallback(() => {
    if (!userId || sseRef.current) return;
    setSniping(true);
    setStatus('connecting');

    const es = new EventSource(`/api/snipe/stream?userId=${userId}`);
    sseRef.current = es;

    es.onopen = () => setStatus('live');

    es.onmessage = (e) => {
      try {
        const deal: DealEvent = JSON.parse(e.data);

        // Add to fired log
        setFiredDeals(prev => [{ ...deal, firedAt: Date.now() }, ...prev].slice(0, 20));

        // 🔥 Open the item page immediately in a new tab
        window.open(`https://www.roblox.com/catalog/${deal.assetId}`, '_blank', 'noopener');
      } catch { /* malformed event */ }
    };

    es.onerror = () => {
      setStatus('error');
      // Auto-reconnect after 5 s
      es.close();
      sseRef.current = null;
      setTimeout(() => {
        if (sniping) startSniping();
      }, 5_000);
    };
  }, [userId, sniping]);

  const stopSniping = useCallback(() => {
    setSniping(false);
    setStatus('idle');
    sseRef.current?.close();
    sseRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { sseRef.current?.close(); }, []);

  // ── config CRUD ───────────────────────────────────────────────────────
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

  // ── status pill ───────────────────────────────────────────────────────
  const statusConfig = {
    idle:       { label: 'Idle',        dot: 'bg-zinc-500',   ring: 'ring-zinc-600' },
    connecting: { label: 'Connecting…', dot: 'bg-yellow-400 animate-pulse', ring: 'ring-yellow-600' },
    live:       { label: 'Live',        dot: 'bg-emerald-400 animate-pulse', ring: 'ring-emerald-600' },
    error:      { label: 'Reconnecting…', dot: 'bg-red-500 animate-pulse', ring: 'ring-red-700' },
  }[status];

  // ── deal color ────────────────────────────────────────────────────────
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

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight glow-purple">Sniper</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Real-time deal detector — fires the item page the moment a deal drops.
          </p>
        </div>

        {/* Robux balance */}
        <div className="flex items-center gap-3">
          {robux !== null && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800/80 border border-zinc-700/50">
              <img
                src="https://static.rbxcdn.com/images/robux-icon.png"
                alt="R$"
                className="w-4 h-4"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <span className="font-bold text-emerald-400">{fmt(robux)}</span>
              <span className="text-zinc-500 text-xs">R$</span>
            </div>
          )}

          {/* Status pill */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 ring-1 ${statusConfig.ring}`}>
            <span className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
            <span className="text-xs font-medium text-zinc-300">{statusConfig.label}</span>
          </div>
        </div>
      </div>

      {/* ── START / STOP ───────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col sm:flex-row items-center gap-6">
        {/* Glow when live */}
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
            When a qualifying deal appears, the item page will instantly open in a new tab.
          </p>
        </div>

        <button
          onClick={sniping ? stopSniping : startSniping}
          disabled={configs.length === 0 && !sniping}
          className={`
            relative px-8 py-3 rounded-xl font-bold text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed
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
          Add at least one snipe config below before starting.
        </p>
      )}

      {/* ── CONFIGS ────────────────────────────────────────────────────── */}
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

        {/* Add form */}
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
                  type="number"
                  min={1}
                  max={99}
                  value={form.minDeal}
                  onChange={e => setForm(f => ({ ...f, minDeal: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Min Price (R$) — optional</span>
                <input
                  type="number"
                  min={0}
                  placeholder="No minimum"
                  value={form.minPrice}
                  onChange={e => setForm(f => ({ ...f, minPrice: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Max Price (R$) — optional</span>
                <input
                  type="number"
                  min={0}
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

        {/* Config cards */}
        {configs.length === 0 && !showAddForm && (
          <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-zinc-500 text-sm">
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

      {/* ── FIRED DEALS LOG ────────────────────────────────────────────── */}
      {firedDeals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-200">Deals Fired This Session</h2>
          <div className="space-y-2">
            {firedDeals.map((d, i) => (
              <a
                key={i}
                href={`/item/${d.assetId}`}
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

      {/* ── HOW IT WORKS ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">How it works</h2>
        <ol className="space-y-2 text-sm text-zinc-400 list-decimal list-inside">
          <li>The worker bot scans Roblox every few seconds for price changes.</li>
          <li>When an item drops below RAP by your specified %, it records the deal.</li>
          <li>This page receives the deal instantly over a live connection.</li>
          <li>The item listing page opens in a new tab automatically — you buy it.</li>
        </ol>
        <p className="text-xs text-zinc-600 mt-1">
          💡 Keep this tab open while sniping. Popup blockers may need to be disabled for your site.
        </p>
      </section>

    </div>
  );
}

// ── ConfigCard ────────────────────────────────────────────────────────────────

interface ConfigCardProps {
  cfg: SnipeConfig;
  editing: boolean;
  onEdit: () => void;
  onSaveEdit: (patch: Partial<SnipeConfig>) => void;
  onToggle: () => void;
  onDelete: () => void;
}

function ConfigCard({ cfg, editing, onEdit, onSaveEdit, onToggle, onDelete }: ConfigCardProps) {
  const [patch, setPatch] = useState({
    minDeal: String(cfg.minDeal),
    minPrice: cfg.minPrice != null ? String(cfg.minPrice) : '',
    maxPrice: cfg.maxPrice != null ? String(cfg.maxPrice) : '',
  });

  return (
    <div className={`rounded-xl border transition-all ${cfg.enabled ? 'border-zinc-700 bg-zinc-900/60' : 'border-zinc-800 bg-zinc-950/40 opacity-60'}`}>
      {/* main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* item image */}
        {cfg.itemImage ? (
          <img src={cfg.itemImage} alt={cfg.itemName ?? ''} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
            <span className="text-zinc-500 text-xl">🎯</span>
          </div>
        )}

        {/* info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-zinc-100 truncate">
            {cfg.itemName ?? <span className="text-zinc-400 italic">All items</span>}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            ≥{cfg.minDeal}% off
            {cfg.minPrice != null && ` · min ${cfg.minPrice.toLocaleString()} R$`}
            {cfg.maxPrice != null && ` · max ${cfg.maxPrice.toLocaleString()} R$`}
          </p>
        </div>

        {/* actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* toggle */}
          <button
            onClick={onToggle}
            title={cfg.enabled ? 'Disable' : 'Enable'}
            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${cfg.enabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${cfg.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>

          <button onClick={onEdit} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition" title="Edit">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          <button onClick={onDelete} className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition" title="Delete">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* inline edit */}
      {editing && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">Min Deal %</span>
              <input
                type="number" min={1} max={99}
                value={patch.minDeal}
                onChange={e => setPatch(p => ({ ...p, minDeal: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">Min Price (R$)</span>
              <input
                type="number" min={0} placeholder="None"
                value={patch.minPrice}
                onChange={e => setPatch(p => ({ ...p, minPrice: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">Max Price (R$)</span>
              <input
                type="number" min={0} placeholder="None"
                value={patch.maxPrice}
                onChange={e => setPatch(p => ({ ...p, maxPrice: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => onSaveEdit({
                minDeal: Number(patch.minDeal) || cfg.minDeal,
                minPrice: patch.minPrice ? Number(patch.minPrice) : null,
                maxPrice: patch.maxPrice ? Number(patch.maxPrice) : null,
              })}
              className="px-5 py-1.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}