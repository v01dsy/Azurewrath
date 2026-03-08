import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sniper | Azurewrath",
  description: "Real-time Roblox limited deal sniper — automatically detect and buy limiteds below RAP on Azurewrath.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}