'use client';

import { useEffect, useState } from 'react';
import { SPECIAL_SERIAL_CSS, type SerialTier } from '@/lib/specialSerial';

const LEET_MAP: Record<string, string[]> = {
  '1': ['1', '|', '!', 'i'],
  '3': ['3', 'E', '€', '£'],
  '7': ['7', 'T', '↑', '/'],
};

function GlitchChar({ char }: { char: string }) {
  const [display, setDisplay] = useState(char);
  const variants = LEET_MAP[char] ?? null;

  useEffect(() => {
    // If this character has no map variants, don't animate it
    if (!variants) return;

    const delay = Math.random() * 3000;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        // Only cycle through this character's own leet variants, then snap back
        const frames = [
          variants[Math.floor(Math.random() * variants.length)],
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
      title="Special: lol hax for dayz"
    >
      {chars.map((c, i) =>
        LEET_MAP[c] ? <GlitchChar key={i} char={c} /> : <span key={i}>{c}</span>
      )}
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

/**
 * GhostSerial — LimitedU item with no serial (null).
 * Displays "#???" with a haunting fade/drift animation.
 */
function GhostSerial() {
  const chars = '#???'.split('');
  return (
      <span
    style={{
      fontFamily: 'Papyrus, fantasy',
      fontWeight: 900,
      letterSpacing: '0.15em',
      display: 'inline-block',  // 👈 was inline-flex
      animation: 'ghostFlicker 4s ease-in-out infinite',
      filter: 'drop-shadow(0 0 3px #3d3a47)',
      fontSize: '1.2em',
    }}
  >
    {chars.map((c, i) => (
      <span
        key={i}
        style={{
          color: '#6b6875',
          display: 'inline-block',  // this is what makes translateY work on inline elements
          animation: 'ghostWave 2.5s ease-in-out infinite, ghostFade 3s ease-in-out infinite',
          animationDelay: `${i * 0.2}s, ${i * 0.15}s`,
        }}
      >
        {c}
      </span>
    ))}
  </span>
  );
}

/**
 * RobloxSerial — serial is 0, meaning Roblox Corp owns this copy.
 * Displays "#0" with a red Roblox-branded glow.
 */
function RobloxSerial() {
  return (
    <span
      style={{
        color: '#f87171',
        fontWeight: 900,
        animation: 'robloxPulse 2.5s ease-in-out infinite',
        letterSpacing: '0.05em',
      }}
      title="Owned by Roblox"
    >
      #0
    </span>
  );
}

interface SpecialSerialTextProps {
  serial: number | null | undefined;
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
        {tier === 'crown'   && serial != null && <CrownSerial   serial={serial} />}
        {tier === 'elite'   && serial != null && <EliteSerial   serial={serial} />}
        {tier === 'special' && serial != null && <SpecialSerial serial={serial} />}
        {tier === 'leet'    && serial != null && <LeetSerial    serial={serial} />}
        {tier === 'ghost'   && serial == null && <GhostSerial />}
        {tier === 'roblox'  && serial === 0 && <RobloxSerial />}
      </span>
    </>
  );
}