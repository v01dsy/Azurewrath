import type { Metadata } from 'next';
import Script from 'next/script';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import ProfileDropdown from '../components/ProfileDropdown';

export const metadata: Metadata = {
  title: {
    template: '%s - Azurewrath',
    default: 'Azurewrath | Roblox Limited Trading',
  },
  description: 'Real-time price tracking for Roblox Limited items',
  verification: {
    google: 'DDifGHbDO6rPl9_duVTbkQsg3AEQdbf_r6-NVg2jRMs',
  },
  other: {
    'google-adsense-account': 'ca-pub-5901846749996606',
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
        <link rel="icon" type="image/png" href="/Images/icon.png" />
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
        
        <nav className="navbar" aria-label="Main navigation">
          <a href="/">
            <img src="/Images/azurewrath-logo2.png" alt="Azurewrath logo" draggable="false" />
          </a>
          <a href="/search">
            <img src="/Images/search.png" alt="Search icon" draggable="false" />
            <p>Search</p>
          </a>
          <a href="/deals">
            <img src="/Images/deals.png" alt="Deals icon" draggable="false" />
            <p>Deals</p>
          </a>
          <ProfileDropdown />
        </nav>
        <main className="pt-20">
          {children}
        </main>
        <SpeedInsights />
      </body>
    </html>
  );
}