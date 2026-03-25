// app/sales/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sales Activity",
  description: "Live Roblox limited item sales feed — track real-time sales and RAP changes on Azurewrath.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="sr-only">Roblox Limited Sales — Live RAP Changes</h1>
      {children}
    </>
  );
}