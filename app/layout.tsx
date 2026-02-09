import type { Metadata } from 'next';
import './globals.css';
import ProfileDropdown from '../components/ProfileDropdown';

export const metadata: Metadata = {
  title: 'Azurewrath | Roblox Limited Trading',
  description: 'Real-time price tracking for Roblox Limited items',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" href="/Images/icon.png" />
      </head>
      <body className="bg-[#0a0a0a] text-[#e0e0e0]">
        <nav className="navbar">
          <a href="/">
            <img src="/Images/azurewrath-logo2.png" alt="Logo" draggable="false" />
          </a>
          <a href="/search">
            <img src="/Images/search.png" alt="Search" draggable="false" />
            <p>Search</p>
          </a>
          <a href="/deals">
            <img src="/Images/deals.png" alt="Deals" draggable="false" />
            <p>Deals</p>
          </a>
          <ProfileDropdown />
        </nav>
        <main className="pt-20">
          {children}
        </main>
      </body>
    </html>
  );
}
