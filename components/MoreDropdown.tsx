// components/MoreDropdown.tsx

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getUserSession } from '@/lib/userSession';
import { hasRole } from '@/lib/roles';

const staticItems = [
  {
    href: '/news',
    icon: '/Images/news.png',
    label: 'News',
    description: 'Latest updates',
    external: false,
  },
  {
    href: 'https://chromewebstore.google.com/detail/azuresniper/mpbklfiemgpdbcghjpbepnkbjbbickdm',
    icon: '/Images/azuresniper.png',
    label: 'Azuresniper',
    description: 'Snipe tool',
    external: true,
  },
];

export default function MoreDropdown() {
  const [open, setOpen] = useState(false);
  const [unreadNews, setUnreadNews] = useState(0);
  const [userRole, setUserRole] = useState<string>('user');
  const [pendingFlags, setPendingFlags] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const session = getUserSession();
    if (!session) return;
    setUserId(session.robloxUserId);

    // Fetch role
    fetch(`/api/user/role?userId=${session.robloxUserId}`)
      .then(r => r.json())
      .then(d => setUserRole(d.role ?? 'user'))
      .catch(() => {});

    // Fetch unread news
    const checkNews = () => {
      fetch(`/api/news/unread?userId=${session.robloxUserId}`)
        .then(r => r.json())
        .then(d => setUnreadNews(d.unread ?? 0))
        .catch(() => {});
    };
    checkNews();
    const interval = setInterval(checkNews, 120_000);
    return () => clearInterval(interval);
  }, []);

  // Poll pending flags for admins+
  useEffect(() => {
    if (!userId || !hasRole(userRole, 'admin')) return;
    const checkFlags = () => {
      fetch(`/api/admin/manipulation-flags?status=pending&userId=${userId}`)
        .then(r => r.json())
        .then(data => setPendingFlags(Array.isArray(data) ? data.length : 0))
        .catch(() => {});
    };
    checkFlags();
    const interval = setInterval(checkFlags, 60_000);
    return () => clearInterval(interval);
  }, [userId, userRole]);

  const isAdmin = hasRole(userRole, 'admin');

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Trigger */}
      <div className="flex flex-col items-center gap-[3px] cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 relative">
        <div className="relative">
          <img
            src="/Images/more.png"
            alt="More"
            draggable="false"
            style={{ height: 40, width: 'auto', objectFit: 'contain', userSelect: 'none' } as React.CSSProperties}
          />
          {/* Badge: show news OR pending flags, whichever is higher priority */}
          {(unreadNews > 0 || pendingFlags > 0) && (
            <span style={{
              position: 'absolute', top: -2, right: -4,
              background: pendingFlags > 0 ? '#ef4444' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff', borderRadius: '9999px', fontSize: '0.55rem',
              fontWeight: 700, minWidth: 15, height: 15, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              padding: '0 3px', lineHeight: 1, border: '1.5px solid #0a0a0a',
            }}>
              {pendingFlags > 0 ? (pendingFlags > 9 ? '9+' : pendingFlags) : (unreadNews > 9 ? '9+' : unreadNews)}
            </span>
          )}
        </div>
        <p style={{
          margin: 0,
          color: 'var(--white)',
          fontWeight: 'bold',
          fontSize: '0.7em',
          lineHeight: 1,
          textShadow: '0 0 8px rgba(139, 92, 246, 0.6)',
        }}>
          More
        </p>
      </div>

      {/* Bridge strip */}
      {open && (
        <div style={{ position: 'absolute', bottom: -8, left: 0, right: 0, height: 8 }} />
      )}

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 w-52 bg-slate-800 border border-purple-500/20 rounded-xl shadow-xl z-50 overflow-hidden py-1"
          style={{ top: 'calc(100% + 8px)' }}
        >
          {staticItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                textDecoration: 'none',
              }}
              className="hover:bg-purple-600/30 transition-colors group"
            >
              <div className="relative flex-shrink-0">
                <img
                  src={item.icon}
                  alt={item.label}
                  draggable="false"
                  style={{ width: 28, height: 28, objectFit: 'contain' }}
                />
                {item.label === 'News' && unreadNews > 0 && (
                  <span style={{
                    position: 'absolute', top: -3, right: -3,
                    width: 8, height: 8,
                    background: '#3b82f6',
                    borderRadius: '9999px',
                    border: '1.5px solid #1e293b',
                  }} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="text-white text-sm font-semibold group-hover:text-purple-200 transition-colors">
                  {item.label}
                  {item.label === 'News' && unreadNews > 0 && (
                    <span className="ml-1.5 text-xs font-bold text-blue-400">{unreadNews} new</span>
                  )}
                </span>
                <span className="text-slate-400 text-xs">{item.description}</span>
              </div>
            </Link>
          ))}

          {/* Admin section — only for admins+ */}
          {isAdmin && (
            <>
              <div className="mx-3 my-1 border-t border-slate-700/60" />
              <Link
                href="/admin"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  textDecoration: 'none',
                }}
                className="hover:bg-red-600/20 transition-colors group"
              >
                <div className="relative flex-shrink-0 w-7 h-7 flex items-center justify-center">
                  <span className="text-lg">🛡️</span>
                  {pendingFlags > 0 && (
                    <span style={{
                      position: 'absolute', top: -3, right: -3,
                      background: '#ef4444',
                      color: '#fff', borderRadius: '9999px', fontSize: '0.5rem',
                      fontWeight: 700, minWidth: 13, height: 13, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      padding: '0 2px', lineHeight: 1, border: '1.5px solid #1e293b',
                    }}>
                      {pendingFlags > 9 ? '9+' : pendingFlags}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="text-red-300 text-sm font-semibold group-hover:text-red-200 transition-colors">
                    Admin
                    {pendingFlags > 0 && (
                      <span className="ml-1.5 text-xs font-bold text-red-400">{pendingFlags} pending</span>
                    )}
                  </span>
                  <span className="text-slate-500 text-xs">Moderation tools</span>
                </div>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}