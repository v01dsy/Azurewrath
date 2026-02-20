//app/components/DiscordNotificationSettings.tsx
'use client';

import { getUserSession } from '@/lib/userSession';
import { useState } from 'react';

interface Props {
  initialDiscordUsername: string | null;
  initialEnabled: boolean;
}

export function DiscordNotificationSettings({
  initialDiscordUsername,
  initialEnabled,
}: Props) {
  const [discordUsername, setDiscordUsername] = useState(initialDiscordUsername);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);

  // ── Link Discord ──────────────────────────────────────────────────────────
  const handleLink = () => {
    const session = getUserSession();
    window.location.href = `/api/auth/discord?userId=${session?.robloxUserId}`;
};

  // ── Unlink Discord ────────────────────────────────────────────────────────
  const handleUnlink = async () => {
    if (!confirm('Unlink your Discord account? You will stop receiving Discord notifications.')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/user/discord-notifications', { method: 'DELETE' });
      if (res.ok) {
        setDiscordUsername(null);
        setEnabled(false);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Toggle notifications on/off ───────────────────────────────────────────
  const handleToggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setLoading(true);
    try {
      await fetch('/api/user/discord-notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
    } catch {
      setEnabled(!next); // revert on error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-white">Discord Notifications</h3>

      {discordUsername ? (
        <>
          {/* Linked state */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Discord blurple dot */}
              <span className="inline-block w-2 h-2 rounded-full bg-[#5865F2]" />
              <span className="text-sm text-white/70">
                Linked as <span className="text-white font-medium">{discordUsername}</span>
              </span>
            </div>
            <button
              onClick={handleUnlink}
              disabled={loading}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              Unlink
            </button>
          </div>

          {/* Toggle */}
          <label className="flex items-center justify-between cursor-pointer select-none">
            <span className="text-sm text-white/70">
              Send watchlist alerts to Discord
            </span>
            <button
              role="switch"
              aria-checked={enabled}
              onClick={handleToggle}
              disabled={loading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                enabled ? 'bg-[#5865F2]' : 'bg-white/20'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>

          <p className="text-xs text-white/40">
            You&apos;ll receive a DM from the bot when a watched item&apos;s price or RAP changes.
          </p>
        </>
      ) : (
        <>
          {/* Unlinked state */}
          <p className="text-sm text-white/60">
            Link your Discord account to receive watchlist alerts as DMs.
          </p>
          <button
            onClick={handleLink}
            className="flex items-center gap-2 rounded-md bg-[#5865F2] hover:bg-[#4752C4] px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            {/* Simple Discord icon via SVG */}
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
            </svg>
            Link Discord
          </button>
        </>
      )}
    </div>
  );
}