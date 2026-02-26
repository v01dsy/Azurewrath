'use client';

import { useEffect, useRef, useState } from 'react';
import { getSerialTier, SPECIAL_SERIAL_CSS, type SerialTier } from '@/lib/specialSerial';

const LEET_CHARS = ['#', '$', '%', '&', '!', '@', '0', '1', '/', '\\', '|'];
const LEET_MAP: Record<string, string[]> = {
  '1': ['1', '|', '!', 'i'],
  '3': ['3', 'E', '€', '£'],
  '7': ['7', 'T', '↑', '/'],
};

function GlitchChar({ char }: { char: string }) {
  const [display, setDisplay] = useState(char);
  const variants = LEET_MAP[char] ?? [char];

  useEffect(() => {
    // Random glitch interval per character so they don't all fire together
    const delay = Math.random() * 3000;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        // Quick 3-frame glitch then snap back
        const frames = [
          LEET_CHARS[Math.floor(Math.random() * LEET_CHARS.length)],
          variants[Math.floor(Math.random() * variants.length)],
          char,
        ];
        let i = 0;
        const frameTimer = setInterval(() => {
          setDisplay(frames[i]);
          i++;
          if (i >= frames.length) clearInterval(frameTimer);
        }, 60);
      }, 1800 + Math.random() * 2000);
      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [char]);

  return <span>{display}</span>;
}

function LeetSerial({ serial }: { serial: number }) {
  const chars = `#${serial}`.split('');
  return (
    <span
      style={{
        color: '#4ade80',
        fontFamily: '"Courier New", Courier, monospace',
        fontWeight: 900,
        textShadow: '0 0 8px #16a34a, 0 0 16px #15803d',
        animation: 'leetFlicker 4s infinite',
        letterSpacing: '0.05em',
      }}
    >
      {chars.map((c, i) => (
        LEET_MAP[c]
          ? <GlitchChar key={i} char={c} />
          : <span key={i}>{c}</span>
      ))}
    </span>
  );
}

function CrownSerial({ serial }: { serial: number }) {
  return (
    <span
      style={{
        background: 'linear-gradient(90deg, #ca8a04, #facc15, #fef08a, #facc15, #ca8a04)',
        backgroundSize: '200% auto',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        animation: 'crownShimmer 2s linear infinite',
        fontWeight: 900,
        filter: 'drop-shadow(0 0 4px rgba(250,204,21,0.5))',
      }}
    >
      #{serial}
    </span>
  );
}

function EliteSerial({ serial }: { serial: number }) {
  return (
    <span
      style={{
        color: '#c4b5fd',
        fontWeight: 900,
        animation: 'eliteGlow 2s ease-in-out infinite',
      }}
    >
      #{serial}
    </span>
  );
}

function SpecialSerial({ serial }: { serial: number }) {
  return (
    <span
      style={{
        background: 'linear-gradient(90deg, #67e8f9, #ffffff, #67e8f9, #a5f3fc, #ffffff, #67e8f9)',
        backgroundSize: '200% auto',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        animation: 'specialSweep 2.5s linear infinite',
        fontWeight: 900,
        filter: 'drop-shadow(0 0 3px rgba(103,232,249,0.6))',
      }}
    >
      #{serial}
    </span>
  );
}

interface SpecialSerialTextProps {
  serial: number;
  tier: SerialTier;
  /** 'badge' = compact inventory card badge, 'stat' = large UAID page display, 'button' = modal button */
  variant?: 'badge' | 'stat' | 'button';
}

export function SpecialSerialText({ serial, tier, variant = 'badge' }: SpecialSerialTextProps) {
  const sizeClass =
    variant === 'stat'   ? 'text-2xl' :
    variant === 'button' ? 'text-xs'  :
                           'text-xs';

  return (
    <>
      <style>{SPECIAL_SERIAL_CSS}</style>
      <span className={`${sizeClass} font-black`}>
        {tier === 'crown'   && <CrownSerial   serial={serial} />}
        {tier === 'elite'   && <EliteSerial   serial={serial} />}
        {tier === 'special' && <SpecialSerial serial={serial} />}
        {tier === 'leet'    && <LeetSerial    serial={serial} />}
      </span>
    </>
  );
}