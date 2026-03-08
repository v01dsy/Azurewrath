import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deals | Azurewrath",
  description: "Find the best deals on Roblox limited items — browse discounted limiteds below RAP on Azurewrath.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}