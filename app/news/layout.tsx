import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "News",
  description: "Stay updated with the latest news and updates from Azurewrath.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}