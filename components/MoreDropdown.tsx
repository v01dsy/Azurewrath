'use client';

import { useState } from 'react';
import Link from 'next/link';

const items = [
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

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Trigger */}
      <div className="flex flex-col items-center gap-[3px] cursor-pointer transition-transform duration-200 hover:-translate-y-0.5">
        <img
          src="/Images/more.png"
          alt="More"
          draggable="false"
          style={{ height: 40, width: 'auto', objectFit: 'contain', userSelect: 'none' } as React.CSSProperties}
        />
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
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              // ↓ inline style wins over the .navbar a { flex-direction: column } global rule
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
              <img
                src={item.icon}
                alt={item.label}
                draggable="false"
                style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="text-white text-sm font-semibold group-hover:text-purple-200 transition-colors">
                  {item.label}
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