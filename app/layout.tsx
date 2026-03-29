// app/layout.tsx
import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import ProfileDropdown from '../components/ProfileDropdown';
import MoreDropdown from '../components/MoreDropdown';
import QueryProvider from './QueryProvider.tsx';

export const metadata: Metadata = {
  title: {
    template: '%s | Azurewrath',
    default: 'Azurewrath | Roblox Limited Trading',
  },
  description: 'Real-time price tracking for Roblox Limited items',
  metadataBase: new URL('https://azurewrath.lol'),
  applicationName: 'Azurewrath',
  verification: {
    google: 'DDifGHbDO6rPl9_duVTbkQsg3AEQdbf_r6-NVg2jRMs',
  },
  other: {
    'google-adsense-account': 'ca-pub-5901846749996606',
  },
  icons: {
    icon: '/Images/icon-black.webp',       // CHANGED
    shortcut: '/Images/icon-black.webp',
    apple: '/Images/icon-black.webp',      // ADD
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" role="document">
      <head>
        <link rel="icon" type="image/webp" href="/Images/icon-black.webp" />
        <link rel="shortcut icon" type="image/webp" href="/Images/icon-black.webp" />
        <link rel="apple-touch-icon" href="/Images/icon-black.webp" />
        <style>{`
          ::-webkit-scrollbar { width: 8px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 10px; }
          ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
          * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.3) transparent; }
        `}</style>
      </head>
      <body className="bg-[#0a0a0a] text-[#e0e0e0]">
        <Script
          strategy="afterInteractive"
          src="https://www.googletagmanager.com/gtag/js?id=G-220BXG48P2"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-220BXG48P2');
          `}
        </Script>

        <QueryProvider>
          <nav className="navbar" aria-label="Main navigation">
            <a href="/">
              <img src="/Images/icon.webp" alt="Azurewrath logo" draggable="false" />
            </a>
            <a href="/search">
              <img src="/Images/search.webp" alt="Search icon" draggable="false" />
              <p>Search</p>
            </a>
            <a href="/players">
              <img src="/Images/players.webp" alt="Players icon" draggable="false" />
              <p>Players</p>
            </a>
            <a href="/deals">
              <img src="/Images/deals.webp" alt="Deals icon" draggable="false" />
              <p>Deals</p>
            </a>
            <a href="/snipe">
              <img src="/Images/snipe.webp" alt="Snipe icon" draggable="false" />
              <p>Snipe</p>
            </a>
            <a href="/sales">
              <img src="/Images/sales.webp" alt="Sales icon" draggable="false" />
              <p>Sales</p>
            </a>
            <ProfileDropdown />
            <MoreDropdown />
          </nav>

          {/* pt-20 on desktop (nav is on top), no top padding on mobile (nav is on bottom) */}
          <main className="pt-0 md:pt-20">
            {children}
          </main>

           {/* SEO crawler links — visually hidden */}
          <div className="sr-only" aria-hidden="true">
            <a href="/verify">Sign In with Roblox</a>
            <a href="/watchlist">Your Watchlist</a>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}