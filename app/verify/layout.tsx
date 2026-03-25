// app/verify/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to Azurewrath with your Roblox account to track your limiteds and start sniping deals.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="sr-only">Sign In to Azurewrath with Roblox</h1>
      {children}
    </>
  );
}