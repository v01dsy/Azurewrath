// app/snipe/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Snipe",
  description: "Real-time Roblox limited deal sniper — automatically detect and buy limiteds below RAP on Azurewrath.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="sr-only">Roblox Limited Sniper — Real-Time Deal Detection</h1>
      {children}
    </>
  );
}