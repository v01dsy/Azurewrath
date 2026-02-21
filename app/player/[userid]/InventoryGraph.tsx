//app/player/[userid]/InventoryGraph.tsx

'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface InventoryGraphProps {
  data: Array<{
    date: string;
    rap: number;
    itemCount: number;
    uniqueCount: number;
    snapshotId?: string;
  }>;
  onPointClick?: (snapshotId: string, date: string) => void;
}

export default function InventoryGraph({ data, onPointClick }: InventoryGraphProps) {
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  const handleLegendClick = (dataKey: string) => {
    setHiddenLines(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dataKey)) {
        newSet.delete(dataKey);
      } else {
        newSet.add(dataKey);
      }
      return newSet;
    });
  };

  const handleClick = (data: any) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const payload = data.activePayload[0].payload;
      if (payload.snapshotId && onPointClick) {
        onPointClick(payload.snapshotId, payload.date);
      }
    }
  };

  const legendItems = [
    { dataKey: 'rap', name: 'Total RAP', color: '#34d399' },
    { dataKey: 'itemCount', name: 'Total Items', color: '#60a5fa' },
    { dataKey: 'uniqueCount', name: 'Unique Limiteds', color: '#a78bfa' },
  ];

  const getAxisMax = (dataMax: number) => {
    // Target around 66% of the ceiling
    const targetCeiling = dataMax * 1.5;
    
    // Round to the CLOSEST nice clean number
    const magnitude = Math.pow(10, Math.floor(Math.log10(targetCeiling)));
    const normalized = targetCeiling / magnitude;
    
    // Find the closest nice number
    const niceNumbers = [1, 2, 4, 5, 8, 10];
    let closestNumber = niceNumbers[0];
    let closestDiff = Math.abs(normalized - niceNumbers[0]);
    
    for (const num of niceNumbers) {
      const diff = Math.abs(normalized - num);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestNumber = num;
      }
    }
    
    const ceiling = closestNumber * magnitude;
    return ceiling;
  };

  const getIncrement = (ceiling: number) => {
    // Always divide ceiling by 4 for exactly 4 segments
    return ceiling / 4;
  };

  // Left axis ticks (always exactly 5 ticks = 4 segments)
  const rapTicks = (() => {
    const dataMax = data.length ? Math.max(...data.map(d => d.rap)) : 0;
    if (dataMax === 0) return [0, 1, 2, 3, 4];
    const max = getAxisMax(dataMax);
    const increment = max / 4;
    const ticks = [];
    for (let i = 0; i <= 4; i++) {
      ticks.push(i * increment);
    }
    // Deduplicate in case of rounding collisions
    return [...new Set(ticks)];
  })();

  // Right axis: same number of ticks as left, evenly spaced across visible data max
  const itemTicks = (() => {
    const tickCount = rapTicks.length;

    const visibleRightKeys = ['itemCount', 'uniqueCount'].filter(k => !hiddenLines.has(k));
    const keys = visibleRightKeys.length ? visibleRightKeys : ['itemCount', 'uniqueCount'];
    const dataMax = data.length
      ? Math.max(...data.flatMap(d => keys.map(k => d[k as keyof typeof d] as number)))
      : 0;

    const steps = tickCount - 1;
    if (dataMax === 0) return Array.from({ length: tickCount }, (_, i) => i);

    const rawStep = (dataMax * 1.2) / steps;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const niceStep = Math.ceil(rawStep / magnitude) * magnitude;

    return Array.from({ length: tickCount }, (_, i) => Math.round(i * niceStep));
  })();

  const leftHidden = hiddenLines.has('rap');
  const rightHidden = hiddenLines.has('itemCount') && hiddenLines.has('uniqueCount');

  const renderLeftTick = ({ x, y, payload, index }: any) => {
    if (index === rapTicks.length - 1) return <g />;
    return <text x={x} y={y} fill="#94a3b8" fontSize={12} textAnchor="end" dy={4}>{payload.value.toLocaleString()}</text>;
  };

  const renderRightTick = ({ x, y, payload, index }: any) => {
    if (index === itemTicks.length - 1) return <g />;
    return <text x={x} y={y} fill="#94a3b8" fontSize={12} textAnchor="start" dy={4}>{payload.value}</text>;
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart 
            data={data} 
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            onClick={handleClick}
            style={{ cursor: onPointClick ? 'pointer' : 'default' }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
            />
            <YAxis
              yAxisId="left"
              axisLine={false}
              tickLine={false}
              label={{ value: 'RAP', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
              domain={[0, rapTicks[rapTicks.length - 1]]}
              ticks={rapTicks}
              tick={renderLeftTick}
              hide={leftHidden}
              allowDuplicatedCategory={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              axisLine={false}
              tickLine={false}
              label={{ value: 'Items', angle: 90, position: 'insideRight', fill: '#94a3b8' }}
              domain={[0, itemTicks[itemTicks.length - 1]]}
              ticks={itemTicks}
              tick={renderRightTick}
              hide={rightHidden}
              allowDuplicatedCategory={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #7c3aed',
                borderRadius: '8px',
                color: '#fff'
              }}
            />
            {!hiddenLines.has('rap') && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="rap"
                stroke="#34d399"
                strokeWidth={3}
                name="Total RAP"
                dot={{ fill: '#34d399', r: 4 }}
                activeDot={{ r: 6, cursor: 'pointer' }}
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
                dot={{ fill: '#60a5fa', r: 4 }}
                activeDot={{ r: 6, cursor: 'pointer' }}
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
                dot={{ fill: '#a78bfa', r: 4 }}
                activeDot={{ r: 6, cursor: 'pointer' }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Custom Legend Below Chart */}
      <div className="flex justify-center gap-6 py-4 flex-shrink-0">
        {legendItems.map((item) => (
          <button
            key={item.dataKey}
            onClick={() => handleLegendClick(item.dataKey)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              hiddenLines.has(item.dataKey)
                ? 'opacity-40 hover:opacity-60'
                : 'hover:opacity-80'
            }`}
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-sm text-slate-300">{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}