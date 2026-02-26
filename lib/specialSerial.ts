export type SerialTier = 'crown' | 'elite' | 'special' | 'leet' | null;

export function getSerialTier(serial: number | null | undefined): SerialTier {
  if (serial === null || serial === undefined) return null;
  if (serial === 1337) return 'leet';
  if (serial === 1) return 'crown';
  if (serial < 10) return 'elite';
  if (serial === 123 || serial === 1234 || serial === 12345) return 'special';
  return null;
}

export function isSpecialSerial(serial: number | null | undefined): boolean {
  return getSerialTier(serial) !== null;
}

// Card border glow classes per tier
export function getCardGlowClass(tier: SerialTier): string {
  switch (tier) {
    case 'crown':  return 'border-yellow-400/50 shadow-md shadow-yellow-500/20';
    case 'elite':  return 'border-violet-400/50 shadow-md shadow-violet-500/20';
    case 'special': return 'border-cyan-400/50 shadow-md shadow-cyan-500/20';
    case 'leet':   return 'border-green-400/50 shadow-md shadow-green-500/20';
    default:       return 'border-purple-500/10 hover:border-purple-500/30';
  }
}

export const SPECIAL_SERIAL_CSS = `
@keyframes crownShimmer {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes eliteGlow {
  0%, 100% { text-shadow: 0 0 6px #a78bfa, 0 0 12px #7c3aed; }
  50%       { text-shadow: 0 0 12px #c4b5fd, 0 0 24px #a78bfa; }
}
@keyframes specialSweep {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes leetFlicker {
  0%, 100%     { opacity: 1; }
  92%          { opacity: 1; }
  93%          { opacity: 0.3; }
  94%          { opacity: 1; }
  97%          { opacity: 1; }
  98%          { opacity: 0.5; }
  99%          { opacity: 1; }
}
`;