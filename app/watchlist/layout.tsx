// app/watchlist/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Watchlist',
  description: 'Track your favorite Roblox Limited items and get notified via Discord or browser push when prices drop, items sell, or trade ads appear.',
};

export default function WatchlistLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="sr-only">Your Roblox Limited Watchlist</h1>
      {children}
    </>
  );
}