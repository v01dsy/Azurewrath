// app/search/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search | Azurewrath",
  description: "Search for Roblox limited items, and more on Azurewrath.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}