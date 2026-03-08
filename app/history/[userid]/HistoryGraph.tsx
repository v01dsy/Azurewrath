// app/history/[userid]/HistoryGraph.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface GraphPoint {
  snapshotId: string;
  date: string;
  timestamp: number;
  rap: number;
  rapThen: number;
  itemCount: number;
  uniqueCount: number;
}

interface HistoryGraphProps {
  data: GraphPoint[];
  userid: string;
  selectedSnap: GraphPoint | null;
  onPointClick: (point: GraphPoint) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtRap = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` :
  v >= 1_000     ? `${(v / 1_000).toFixed(0)}K` : String(v);

const niceMax = (dataMax: number): number => {
  if (dataMax === 0) return 20;
  const mag = Math.pow(10, Math.floor(Math.log10(dataMax)));
  const ceil = [1, 2, 5, 10].map(n => n * mag).find(c => c >= dataMax * 1.1) ?? dataMax * 1.5;
  return ceil;
};

const buildTicks = (max: number, count = 5) =>
  Array.from({ length: count }, (_, i) => Math.round(i * max / (count - 1)));

const LEGEND = [
  { key: 'rap',     name: 'RAP Now',  color: '#4fc3f7' },
  { key: 'rapThen', name: 'RAP Then', color: '#a78bfa' },
];

const AXIS_STYLE = { fill: '#b0b0b0', fontSize: 11, fontWeight: 700 } as const;
const TICK_LINE  = { stroke: '#666666' };

// ── Tooltip ────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const ts = payload[0]?.payload?.timestamp;
  const dateStr = ts
    ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div style={{
      backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '8px', padding: '10px 14px', fontSize: 12, color: '#fff', minWidth: 180,
    }}>
      <p style={{ fontWeight: 700, marginBottom: 6, color: '#e2e8f0' }}>{dateStr}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color, fontWeight: 400, marginBottom: 2 }}>
          {entry.name}:{' '}
          <strong>{`${Number(entry.value).toLocaleString()} R$`}</strong>
        </p>
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function HistoryGraph({ data, userid, selectedSnap, onPointClick }: HistoryGraphProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setHidden(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const handleClick = (cd: any) => {
    const p = cd?.activePayload?.[0]?.payload;
    if (p?.snapshotId) onPointClick(p);
  };

  const rapMax   = data.length ? Math.max(...data.map(d => Math.max(d.rap, d.rapThen))) : 0;
  const rapNice  = niceMax(rapMax);
  const rapTicks = buildTicks(rapNice);

  if (!data.length) return (
    <div className="flex items-center justify-center h-full text-[#888] text-sm">No snapshot history yet</div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 relative">

        {/* R$ axis label */}
        <div
          className="absolute top-0 bottom-0 flex items-center justify-center z-10 pointer-events-none"
          style={{ width: 16, left: -16, paddingBottom: '26px' }}
        >
          <span
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            className="text-[#888] text-xs font-bold tracking-wider"
          >R$</span>
        </div>

        {data.length < 2 ? (
          <div className="flex items-center justify-center h-full text-[#666] text-sm">
            Not enough snapshots to display graph
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              onClick={handleClick}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                type="category"
                stroke="#666666"
                tick={{ fill: '#b0b0b0', fontSize: 11 }}
                tickLine={TICK_LINE}
                interval={Math.floor(data.length / 5) - 1}
                height={24}
              />
              <YAxis
                yAxisId="rap"
                orientation="left"
                ticks={rapTicks}
                domain={[0, rapNice]}
                tickFormatter={fmtRap}
                stroke="#666666"
                tick={AXIS_STYLE}
                tickLine={TICK_LINE}
                axisLine={false}
                width={52}
              />
              <Tooltip content={<CustomTooltip />} />
              {selectedSnap && (
                <ReferenceLine
                  yAxisId="rap"
                  x={selectedSnap.date}
                  stroke="rgba(255,255,255,0.3)"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
              )}
              <Line
                yAxisId="rap" type="linear" dataKey="rap" name="RAP Now"
                stroke={hidden.has('rap') ? 'transparent' : '#4fc3f7'}
                strokeWidth={2.5} dot={false}
                activeDot={hidden.has('rap') ? false : { r: 5, fill: '#4fc3f7', stroke: '#fff', strokeWidth: 1.5, cursor: 'pointer' }}
                isAnimationActive={false}
              />
              <Line
                yAxisId="rap" type="linear" dataKey="rapThen" name="RAP Then"
                stroke={hidden.has('rapThen') ? 'transparent' : '#a78bfa'}
                strokeWidth={2} dot={false}
                activeDot={hidden.has('rapThen') ? false : { r: 5, fill: '#a78bfa', stroke: '#fff', strokeWidth: 1.5, cursor: 'pointer' }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend toggles */}
      <div className="flex justify-center gap-5 pt-3 mt-2 border-t border-white/10 flex-shrink-0">
        {LEGEND.map(({ key, name, color }) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-all text-sm ${hidden.has(key) ? 'opacity-30 hover:opacity-60' : 'hover:opacity-80'}`}
          >
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[#b0b0b0]">{name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}