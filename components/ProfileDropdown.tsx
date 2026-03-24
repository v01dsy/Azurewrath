"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getUserSession, setUserSession, clearUserSession } from "../lib/userSession";

type UserSession = {
  robloxUserId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  authMethod?: string;
};

const iconStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  objectFit: 'contain',
  flexShrink: 0,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
  padding: '10px 16px',
  color: 'white',
  textDecoration: 'none',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.15s',
  fontSize: '0.875rem',
};

function DropdownLink({ href, onClick, children }: { href: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={rowStyle}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.25)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {children}
    </Link>
  );
}

function DropdownButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={rowStyle}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.25)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {children}
    </button>
  );
}

export default function ProfileDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<UserSession | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const restore = async () => {
      const local = getUserSession();
      if (local) { setUser(local); return; }
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (data.user) { setUserSession(data.user); setUser(data.user); }
      } catch {}
    };
    restore();
  }, []);

  const fetchUnreadCount = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/user/notifications?userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(data.unreadCount ?? 0);
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchUnreadCount(user.robloxUserId);
    pollRef.current = setInterval(() => fetchUnreadCount(user.robloxUserId), 60000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, fetchUnreadCount]);

  const handleLogout = async () => {
    clearUserSession();
    setUser(null);
    setUnreadCount(0);
    setOpen(false);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  };

  const handleNotificationsClick = async () => {
    setOpen(false);
    if (user && unreadCount > 0) {
      try {
        await fetch('/api/user/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.robloxUserId, markAll: true }),
        });
        setUnreadCount(0);
      } catch {}
    }
    router.push('/notifications');
  };

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div
      className="relative inline-block"
      ref={dropdownRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <button
          className="flex flex-col items-center focus:outline-none relative"
          tabIndex={0}
          aria-haspopup="true"
          aria-expanded={open}
          style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <div className="relative">
            <img
              src={user?.avatarUrl || "/Images/profile.webp"}
              alt="Profile"
              draggable="false"
              style={{ borderRadius: '50%', objectFit: 'contain' }}
              className="h-[26px] w-[26px] md:h-[40px] md:w-[40px] max-h-[40px]"
            />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -2, right: -4,
                background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                color: '#fff', borderRadius: '9999px', fontSize: '0.55rem',
                fontWeight: 700, minWidth: 15, height: 15, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                padding: '0 3px', lineHeight: 1, border: '1.5px solid #0a0a0a',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <p style={{ margin: 0, color: 'var(--white)', fontWeight: 'bold', fontSize: '0.7em', lineHeight: 1, textShadow: '0 0 8px rgba(139, 92, 246, 0.6)' }}>
            {user ? (user.displayName || user.username) : 'Profile'}
          </p>
        </button>
        {open && <div style={{ height: 8, marginBottom: -8, width: '100%' }} />}
      </div>

      {open && (
        <div
          className="absolute right-0 w-52 bg-slate-800 border border-purple-500/20 rounded-xl shadow-xl z-50 overflow-hidden py-1 bottom-[calc(100%+8px)] md:bottom-auto md:top-[calc(100%+8px)]"
          style={{ pointerEvents: 'auto' }}
        >
          {!user ? (
            <DropdownLink href="/verify">
              <img src="/Images/verify.png" alt="" style={iconStyle} draggable="false" />
              <span>Verify Account</span>
            </DropdownLink>
          ) : (
            <>
              <DropdownLink href={`/player/${user.robloxUserId}`} onClick={() => setOpen(false)}>
                <img src="/Images/profile.webp" alt="" style={iconStyle} draggable="false" />
                <span>Profile</span>
              </DropdownLink>

              <DropdownLink href="/trade" onClick={() => setOpen(false)}>
                <img src="/Images/trade.webp" alt="" style={iconStyle} draggable="false" />
                <span>Trade Ads</span>
              </DropdownLink>

              <DropdownLink href="/watchlist" onClick={() => setOpen(false)}>
                <img src="/Images/watchlist.webp" alt="" style={iconStyle} draggable="false" />
                <span>Watchlist</span>
              </DropdownLink>

              <DropdownButton onClick={handleNotificationsClick}>
                <img src="/Images/notification.webp" alt="" style={iconStyle} draggable="false" />
                <span style={{ flex: 1 }}>Notifications</span>
                {unreadCount > 0 && (
                  <span style={{
                    background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                    color: '#fff', borderRadius: '9999px', fontSize: '0.6rem',
                    fontWeight: 700, minWidth: 18, height: 18,
                    display: 'inline-flex', alignItems: 'center',
                    justifyContent: 'center', padding: '0 4px',
                  }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </DropdownButton>

              <div className="border-t border-slate-700 my-1" />

              <DropdownLink href="/settings" onClick={() => setOpen(false)}>
                <img src="/Images/settings.webp" alt="" style={iconStyle} draggable="false" />
                <span>Settings</span>
              </DropdownLink>

              <div className="border-t border-slate-700 my-1" />

              <DropdownButton onClick={handleLogout}>
                <img src="/Images/logout.webp" alt="" style={iconStyle} draggable="false" />
                <span>Logout</span>
              </DropdownButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}