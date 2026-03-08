import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sales | Azurewrath",
  description: "Live Roblox limited item sales feed — track real-time sales and RAP changes on Azurewrath.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}