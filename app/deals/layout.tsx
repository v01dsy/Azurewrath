// app/deals/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Roblox Limited Deals',
  description: 'Browse Roblox Limited items currently listed below their Recent Average Price. Find the best deals on limiteds in real time.',
};

export default function DealsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="sr-only">Roblox Limited Deals — Items Below RAP</h1>
      {children}
    </>
  );
}