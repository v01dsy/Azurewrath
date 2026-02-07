import type { Metadata } from 'next';
import './globals.css';

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
      <body className="bg-[#0a0a0a] text-[#e0e0e0]">
        <nav className="navbar">
          <a href="/">
            <img src="/Images/azurewrath-logo2.png" alt="Logo" draggable="false" />
          </a>
          <a href="/dashboard">
            <img src="/Images/search.png" alt="Search" draggable="false" />
            <p>Search</p>
          </a>
          <a href="/dashboard">
            <img src="/Images/deals.png" alt="Deals" draggable="false" />
            <p>Deals</p>
          </a>
          <a href="/dashboard">
            <img src="/Images/profile.png" alt="Profile" draggable="false" />
            <p>Profile</p>
          </a>
        </nav>
        <main className="pt-20">
          {children}
        </main>
      </body>
    </html>
  );
}
