import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Players | Azurewrath",
  description: "Browse and search Roblox traders tracked on Azurewrath — view RAP, inventory, and trade history.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}