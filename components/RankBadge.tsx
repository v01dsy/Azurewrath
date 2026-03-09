'use client';

import { useMemo } from 'react';

function getRankTier(rank: number): { color: string; label: string; glow: boolean; glowLevel: 0 | 1 | 2 | 3 } {
  if (rank === 1)    return { color: '#c2b506', label: '👑',       glow: true,  glowLevel: 3 };
  if (rank === 2)    return { color: '#f3f3f3', label: `#${rank}`, glow: true,  glowLevel: 3 };
  if (rank === 3)    return { color: '#cf7500', label: `#${rank}`, glow: true,  glowLevel: 3 };
  if (rank <= 10)    return { color: '#5eff00', label: `#${rank}`, glow: true,  glowLevel: 3 };
  if (rank <= 50)    return { color: '#05daff', label: `#${rank}`, glow: true,  glowLevel: 3 };
  if (rank <= 100)   return { color: '#13b92f', label: `#${rank}`, glow: true,  glowLevel: 3 };
  if (rank <= 250)   return { color: '#ff3d3d', label: `#${rank}`, glow: true,  glowLevel: 2 };
  if (rank <= 500)   return { color: '#2e54ff', label: `#${rank}`, glow: true,  glowLevel: 2 };
  if (rank <= 1000)  return { color: '#af66f3', label: `#${rank}`, glow: true,  glowLevel: 2 };
  if (rank <= 5000)  return { color: '#e2e8f0', label: `#${rank}`, glow: true,  glowLevel: 1 };
  if (rank <= 10000) return { color: '#ffd621', label: `#${rank}`, glow: true,  glowLevel: 1 };
  if (rank <= 50000) return { color: '#979797', label: `#${rank}`, glow: false, glowLevel: 0 };
  return               { color: '#cd7f32', label: `#${rank}`, glow: false, glowLevel: 0 };
}

function Particles({ color }: { color: string }) {
  const particles = useMemo(() =>
    Array.from({ length: 10 }, (_, i) => ({
      id:       i,
      left:     `${10 + Math.random() * 80}%`,
      delay:    `-${(i * 1.2).toFixed(2)}s`,
      duration: `${(2 + Math.random() * 2).toFixed(2)}s`,
      size:     1 + Math.random() * 1.5,
    })), []);

  return (
    <>
      {particles.map(p => (
        <div key={p.id} className="absolute rounded-full pointer-events-none"
          style={{
            left:            p.left,
            bottom:          0,
            width:           `${p.size}px`,
            height:          `${p.size}px`,
            backgroundColor: color,
            boxShadow:       `0 0 ${p.size * 2}px ${color}`,
            animation:       `floatUpBadge ${p.duration} ${p.delay} infinite ease-out`,
          }}
        />
      ))}
    </>
  );
}

export default function RankBadge({ rank, label }: { rank: number; label: string }) {
  const tier = getRankTier(rank);

  const keyframeName = `breatheBadge_${tier.color.replace('#', '')}`;

  const glowMin = tier.glowLevel === 3
    ? `0 0 6px ${tier.color}55, 0 0 14px ${tier.color}33`
    : `0 0 4px ${tier.color}44, 0 0 10px ${tier.color}22`;

  const glowMax = tier.glowLevel === 3
    ? `0 0 16px ${tier.color}cc, 0 0 32px ${tier.color}88, 0 0 60px ${tier.color}44`
    : `0 0 12px ${tier.color}99, 0 0 24px ${tier.color}55`;

  return (
    <>
      <style>{`
        @keyframes floatUpBadge {
          0%   { transform: translateY(0) scale(1); opacity: 0; }
          20%  { opacity: 1; }
          80%  { opacity: 0.6; }
          100% { transform: translateY(-40px) scale(0); opacity: 0; }
        }
        @keyframes ${keyframeName} {
          0%, 100% { box-shadow: ${glowMin}; }
          50%       { box-shadow: ${glowMax}; }
        }
      `}</style>
      <div className="pointer-events-none absolute right-0 bottom-full mb-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col items-end">
        <div
          className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap overflow-hidden"
          style={{
            backgroundColor: '#1a1a1a',
            border:    `1px solid ${tier.color}55`,
            color:     tier.color,
            boxShadow: tier.glowLevel === 1 ? `0 0 8px ${tier.color}77` : 'none',
            animation: tier.glowLevel >= 2
              ? `${keyframeName} ${tier.glowLevel === 3 ? '2s' : '2.5s'} ease-in-out infinite`
              : 'none',
          }}
        >
          {tier.glowLevel === 3 && <Particles color={tier.color} />}
          <span className="opacity-60 relative z-10">{label}</span>
          <span className="relative z-10">{tier.label}</span>
        </div>
        <div className="w-2 h-2 rotate-45 mr-2 -mt-1"
          style={{
            backgroundColor: '#1a1a1a',
            border:     `1px solid ${tier.color}55`,
            borderTop:  'none',
            borderLeft: 'none',
          }}
        />
      </div>
    </>
  );
}