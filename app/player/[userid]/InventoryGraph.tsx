// app/player/[userid]/InventoryGraph.tsx
'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DataPoint {
  date: string;
  timestamp: number;
  rap: number;
  itemCount: number;
  uniqueCount: number;
  snapshotId?: string;
}

interface InventoryGraphProps {
  data: DataPoint[];
  onPointClick?: (snapshotId: string, date: string) => void;
}

const fmtRap = (v: number) =>
  v >= 1_000_000 ? `${(v/1_000_000).toFixed(1).replace(/\.0$/,'')}M` :
  v >= 1_000 ? `${(v/1_000).toFixed(0)}K` : String(v);

const niceMax = (dataMax: number): number => {
  if (dataMax === 0) return 20;
  const mag = Math.pow(10, Math.floor(Math.log10(dataMax)));
  const ceil = [1,2,5,10].map(n => n*mag).find(c => c >= dataMax*1.1) ?? dataMax*1.5;
  return ceil;
};

const buildTicks = (max: number, count = 5) =>
  Array.from({ length: count }, (_, i) => Math.round(i * max / (count-1)));

// Normalize a timestamp to midnight UTC of that day (date-only spacing)
const toDateOnly = (ts: number) => {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const LEGEND = [
  { dataKey: 'rap',         name: 'RAP',       color: '#43e97b' },
  { dataKey: 'itemCount',   name: 'Items',     color: '#4fc3f7' },
  { dataKey: 'uniqueCount', name: 'Uniques', color: '#a259f7' },
];

const AXIS_STYLE = { fill: '#b0b0b0', fontSize: 11, fontWeight: 700 } as const;
const TICK_LINE  = { stroke: '#666666' };

const TOOLTIP_LABELS: Record<string, string> = {
  rap: 'RAP',
  itemCount: 'Items',
  uniqueCount: 'Uniques',
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const ts = payload[0]?.payload?.timestamp;
  const dateStr = ts
    ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '10px 14px', fontSize: 12, color: '#fff', minWidth: 170 }}>
      <p style={{ fontWeight: 700, marginBottom: 6, color: '#e2e8f0' }}>{dateStr}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color, fontWeight: 400, marginBottom: 2 }}>
          {TOOLTIP_LABELS[entry.dataKey] ?? entry.dataKey} : <strong>{entry.dataKey === 'rap'
            ? `${Number(entry.value).toLocaleString()} R$`
            : Number(entry.value).toLocaleString()}</strong>
        </p>
      ))}
    </div>
  );
}

export default function InventoryGraph({ data, onPointClick }: InventoryGraphProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setHidden(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const handleClick = (cd: any) => {
    if (!onPointClick) return;
    const p = cd?.activePayload?.[0]?.payload;
    if (p?.snapshotId) onPointClick(p.snapshotId, p.date);
  };

  const rapHidden  = hidden.has('rap');
  const itemHidden = hidden.has('itemCount') && hidden.has('uniqueCount');

  const rapMax   = data.length ? Math.max(...data.map(d => d.rap)) : 0;
  const rapNice  = niceMax(rapMax);
  const rapTicks = buildTicks(rapNice);

  const itemMax  = data.length ? Math.max(...data.map(d => Math.max(
    hidden.has('itemCount')   ? 0 : d.itemCount,
    hidden.has('uniqueCount') ? 0 : d.uniqueCount,
  ))) : 0;
  const itemNice  = niceMax(itemMax);
  const itemTicks = buildTicks(itemNice);

  // Deduplicate by date — keep last snapshot per day
  const dedupedByDay = (() => {
    const byDay = new Map<number, DataPoint>();
    for (const d of data) {
      const dayKey = toDateOnly(d.timestamp);
      byDay.set(dayKey, d); // last one wins
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a - b)
      .map(([dayTs, d]) => ({ ...d, dayTs }));
  })();

  // Build x-axis ticks from actual day timestamps
  const allDayTs = dedupedByDay.map(d => d.dayTs);
  const xTicks = (() => {
    if (allDayTs.length <= 6) return allDayTs;
    const min = allDayTs[0], max = allDayTs[allDayTs.length - 1];
    const step = (max - min) / 5;
    return Array.from({ length: 6 }, (_, i) => Math.round(min + i * step));
  })();

  const chartData = dedupedByDay.map(d => ({
    ...d,
    rap:         rapHidden                 ? null : d.rap,
    itemCount:   hidden.has('itemCount')   ? null : d.itemCount,
    uniqueCount: hidden.has('uniqueCount') ? null : d.uniqueCount,
  }));

  if (!data.length) return (
    <div className="flex items-center justify-center h-full text-[#888] text-sm">No snapshot history yet</div>
  );

  const axisLabel = (text: string, side: 'left' | 'right', rotate: boolean) => (
    <div className="absolute top-0 bottom-0 flex items-center justify-center z-10 pointer-events-none"
      style={{ width: 16, [side]: -16, paddingBottom: '26px' }}>
      <span style={{ writingMode: 'vertical-rl', ...(rotate ? { transform: 'rotate(180deg)' } : {}) }}
        className="text-[#888] text-xs font-bold tracking-wider">{text}</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 relative">
        {axisLabel('R$', 'left', true)}
        {axisLabel('Item Count', 'right', false)}

        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }} onClick={handleClick}>
            <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.06)" />

            {/* ✅ Numeric time axis — spaces by actual date gaps */}
            <XAxis
              dataKey="dayTs"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              ticks={xTicks}
              tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              stroke="#666666"
              tick={{ fill: '#b0b0b0', fontSize: 11 }}
              tickLine={TICK_LINE}
              height={24}
            />

            {/* Left RAP axis */}
            <YAxis yAxisId="left" orientation="left" ticks={rapTicks} domain={[0, rapNice]}
              tickFormatter={fmtRap} stroke="#666666" tick={AXIS_STYLE} tickLine={TICK_LINE}
              axisLine={false} width={rapHidden ? 0 : 52} hide={rapHidden} />

            {/* Right item count axis */}
            <YAxis yAxisId="right" orientation="right" ticks={itemTicks} domain={[0, itemNice]}
              stroke="#666666" tick={AXIS_STYLE} tickLine={TICK_LINE}
              axisLine={false} width={itemHidden ? 0 : 40} hide={itemHidden} />

            <Tooltip content={<CustomTooltip />} />

            <Line yAxisId="left"  type="linear" dataKey="rap"         name="RAP"              stroke="#43e97b" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            <Line yAxisId="right" type="linear" dataKey="itemCount"   name="Items"       stroke="#4fc3f7" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            <Line yAxisId="right" type="linear" dataKey="uniqueCount" name="Uniques" stroke="#a259f7" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
        <div className="flex justify-center gap-5 pt-3 mt-2 border-t border-white/10 flex-shrink-0">
          {LEGEND.map(({ dataKey, name, color }) => (
            <button
              key={dataKey}
              onClick={() => toggle(dataKey)}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-all text-sm ${hidden.has(dataKey) ? 'opacity-30 hover:opacity-60' : 'hover:opacity-80'}`}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[#b0b0b0]">{name}</span>
            </button>
          ))}
        </div>
    </div>
  );
}