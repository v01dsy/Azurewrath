// components/MoreDropdown.tsx

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getUserSession } from '@/lib/userSession';

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

  useEffect(() => {
    const session = getUserSession();
    if (!session) return;

    const check = () => {
      fetch(`/api/news/unread?userId=${session.robloxUserId}`)
        .then(r => r.json())
        .then(d => setUnreadNews(d.unread ?? 0))
        .catch(() => {});
    };

    check();
    // Re-check every 2 minutes
    const interval = setInterval(check, 120_000);
    return () => clearInterval(interval);
  }, []);

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
          {unreadNews > 0 && (
            <span style={{
              position: 'absolute', top: -2, right: -4,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff', borderRadius: '9999px', fontSize: '0.55rem',
              fontWeight: 700, minWidth: 15, height: 15, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              padding: '0 3px', lineHeight: 1, border: '1.5px solid #0a0a0a',
            }}>
              {unreadNews > 9 ? '9+' : unreadNews}
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
        </div>
      )}
    </div>
  );
}