"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getUserSession, clearUserSession } from "../lib/userSession";

type UserSession = {
  robloxUserId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
};

export default function ProfileDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<UserSession | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const session = getUserSession();
    setUser(session ?? null);
  }, []);

  const fetchUnreadCount = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/user/notifications?userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // silently fail
    }
  }, []);

  // Poll for unread count every 60s
  useEffect(() => {
    if (!user) return;
    fetchUnreadCount(user.robloxUserId);
    pollRef.current = setInterval(() => fetchUnreadCount(user.robloxUserId), 60000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, fetchUnreadCount]);

  const handleLogout = () => {
    clearUserSession();
    setUser(null);
    setUnreadCount(0);
    setOpen(false);
    window.location.reload();
  };

  const handleNotificationsClick = async () => {
    setOpen(false);
    if (user && unreadCount > 0) {
      // Mark all read when navigating to notifications page
      try {
        await fetch('/api/user/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.robloxUserId, markAll: true }),
        });
        setUnreadCount(0);
      } catch {
        // ignore
      }
    }
    router.push('/notifications');
  };

  // Close on outside click
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
      style={{ minHeight: 40 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <button
          className="flex flex-col items-center focus:outline-none relative"
          tabIndex={0}
          aria-haspopup="true"
          aria-expanded={open}
          style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {/* Avatar with unread badge */}
          <div className="relative">
            <img
              src={user?.avatarUrl || "/Images/profile.png"}
              alt="Profile"
              draggable="false"
              style={{ width: 40, height: 40, borderRadius: '50%' }}
            />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: -2,
                right: -4,
                background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                color: '#fff',
                borderRadius: '9999px',
                fontSize: '0.55rem',
                fontWeight: 700,
                minWidth: 15,
                height: 15,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
                lineHeight: 1,
                border: '1.5px solid #0a0a0a',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>
            {user ? (user.displayName || user.username) : 'Profile'}
          </p>
        </button>

        {/* Bridge area to prevent mouseout gap */}
        {open && <div style={{ height: 8, marginBottom: -8, width: '100%' }} />}
      </div>

      {open && (
        <div
          className="absolute right-0 mt-2 w-48 bg-slate-800 border border-purple-500/20 rounded-lg shadow-lg z-50"
          style={{ pointerEvents: 'auto', marginTop: 0 }}
        >
          {!user ? (
            <Link
              href="/verify"
              className="block px-4 py-2 text-white hover:bg-purple-600 rounded-lg transition"
            >
              Verify Account
            </Link>
          ) : (
            <>
              <Link
                href={`/player/${user.robloxUserId}`}
                className="block px-4 py-2 text-white hover:bg-purple-600 transition"
                onClick={() => setOpen(false)}
              >
                Profile
              </Link>
              <Link
                href="/watchlist"
                className="block px-4 py-2 text-white hover:bg-purple-600 transition"
                onClick={() => setOpen(false)}
              >
                Watchlist
              </Link>
              <button
                onClick={handleNotificationsClick}
                className="flex items-center justify-between w-full px-4 py-2 text-white hover:bg-purple-600 transition text-left"
              >
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <span style={{
                    background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                    color: '#fff',
                    borderRadius: '9999px',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    minWidth: 18,
                    height: 18,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                  }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              <div className="border-t border-slate-700 my-1" />
              <button
                onClick={handleLogout}
                className="block w-full text-left px-4 py-2 text-white hover:bg-purple-600 transition"
              >
                Logout
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}