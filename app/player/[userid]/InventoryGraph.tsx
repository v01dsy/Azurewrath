// app/player/[userid]/InventoryGraph.tsx
'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DataPoint {
  date: string;          // display label
  timestamp: number;     // unix ms — used for accurate x-axis spacing
  rap: number;
  itemCount: number;
  uniqueCount: number;
  snapshotId?: string;
}

interface InventoryGraphProps {
  data: DataPoint[];
  onPointClick?: (snapshotId: string, date: string) => void;
}

export default function InventoryGraph({ data, onPointClick }: InventoryGraphProps) {
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  const toggleLine = (key: string) =>
    setHiddenLines(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleChartClick = (chartData: any) => {
    if (!onPointClick) return;
    const payload = chartData?.activePayload?.[0]?.payload;
    if (payload?.snapshotId) onPointClick(payload.snapshotId, payload.date);
  };

  const legendItems = [
    { dataKey: 'rap',         name: 'Total RAP',       color: '#34d399' },
    { dataKey: 'itemCount',   name: 'Total Items',     color: '#60a5fa' },
    { dataKey: 'uniqueCount', name: 'Unique Limiteds', color: '#a78bfa' },
  ];

  // ── Y-axis helpers ──────────────────────────────────────────────────
  const niceMax = (dataMax: number): number => {
    if (dataMax === 0) return 100;
    const mag = Math.pow(10, Math.floor(Math.log10(dataMax)));
    const candidates = [1, 2, 2.5, 5, 10].map(n => n * mag);
    return candidates.find(c => c >= dataMax * 1.2) ?? dataMax * 1.5;
  };

  const buildTicks = (max: number, count = 5): number[] => {
    const step = max / (count - 1);
    return Array.from({ length: count }, (_, i) => Math.round(i * step));
  };

  const rapMax   = data.length ? Math.max(...data.map(d => d.rap))       : 0;
  const itemMax  = data.length ? Math.max(...data.map(d => Math.max(d.itemCount, d.uniqueCount))) : 0;
  const rapNice  = niceMax(rapMax);
  const itemNice = niceMax(itemMax);
  const rapTicks  = buildTicks(rapNice);
  const itemTicks = buildTicks(itemNice);

  const fmtRap = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
  };

  // ── X-axis: use numeric timestamps so recharts respects real time gaps ──
  // We compute domain from actual data
  const timestamps = data.map(d => d.timestamp);
  const xMin = timestamps.length ? Math.min(...timestamps) : 0;
  const xMax = timestamps.length ? Math.max(...timestamps) : 1;

  // Pick ~6 evenly-spaced ticks from actual timestamps
  const xTicks = (() => {
    if (data.length <= 6) return timestamps;
    const step = Math.floor((data.length - 1) / 5);
    return Array.from({ length: 6 }, (_, i) => timestamps[Math.min(i * step, data.length - 1)]);
  })();

  const formatXTick = (ts: number) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const formatTooltipLabel = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  };

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No snapshot history yet
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
            onClick={handleChartClick}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />

            {/* Numeric x-axis keyed off real timestamps */}
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={[xMin, xMax]}
              ticks={xTicks}
              tickFormatter={formatXTick}
              stroke="#475569"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
            />

            {/* Left: RAP */}
            <YAxis
              yAxisId="left"
              orientation="left"
              ticks={rapTicks}
              domain={[0, rapNice]}
              tickFormatter={fmtRap}
              stroke="#475569"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />

            {/* Right: item counts */}
            <YAxis
              yAxisId="right"
              orientation="right"
              ticks={itemTicks}
              domain={[0, itemNice]}
              stroke="#475569"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
              hide={hiddenLines.has('itemCount') && hiddenLines.has('uniqueCount')}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #7c3aed',
                borderRadius: '8px',
                color: '#fff',
                fontSize: 12,
              }}
              labelFormatter={formatTooltipLabel}
              formatter={(value: number, name: string) => [
                name === 'Total RAP'
                  ? `${value.toLocaleString()} R$`
                  : value.toLocaleString(),
                name,
              ]}
            />

            {!hiddenLines.has('rap') && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="rap"
                stroke="#34d399"
                strokeWidth={2.5}
                name="Total RAP"
                dot={{ fill: '#34d399', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, cursor: onPointClick ? 'pointer' : 'default' }}
                connectNulls={false}
              />
            )}
            {!hiddenLines.has('itemCount') && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="itemCount"
                stroke="#60a5fa"
                strokeWidth={2}
                name="Total Items"
                dot={{ fill: '#60a5fa', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            )}
            {!hiddenLines.has('uniqueCount') && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="uniqueCount"
                stroke="#a78bfa"
                strokeWidth={2}
                name="Unique Limiteds"
                dot={{ fill: '#a78bfa', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-5 pt-3 mt-2 border-t border-slate-700/50 flex-shrink-0">
        {legendItems.map(li => (
          <button
            key={li.dataKey}
            onClick={() => toggleLine(li.dataKey)}
            className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-all text-sm ${
              hiddenLines.has(li.dataKey) ? 'opacity-30 hover:opacity-60' : 'hover:opacity-80'
            }`}
          >
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: li.color }} />
            <span className="text-slate-300">{li.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}