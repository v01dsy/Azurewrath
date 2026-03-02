// components/DevLoginButton.tsx
// ⚠️ DEVELOPMENT ONLY — renders nothing in production
'use client';

import { useState } from 'react';
import { setUserSession } from '@/lib/userSession';
import { useRouter } from 'next/navigation';

interface Props {
  robloxUserId: string;
  username: string;
}

export default function DevLoginButton({ robloxUserId, username }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Renders nothing in production — double safety on top of API route
  if (process.env.NODE_ENV === 'production') return null;

  const handleLogin = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dev/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ robloxUserId }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`Dev login failed: ${data.error}`);
        return;
      }

      setUserSession(data.user);
      router.refresh();
    } catch (err) {
      alert('Dev login error: ' + String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogin}
      disabled={loading}
      title="Dev only — not visible in production"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        fontSize: '11px',
        fontWeight: 600,
        color: '#fff',
        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
        border: '1px solid rgba(245,158,11,0.4)',
        borderRadius: '6px',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
        letterSpacing: '0.02em',
      }}
    >
      <span>🛠️</span>
      {loading ? 'Logging in...' : `Dev Login as ${username}`}
    </button>
  );
}