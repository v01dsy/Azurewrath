"use client";
import { useState } from "react";
import RobloxAuthSection from "../../components/RobloxAuthSection";

export default function VerifyPage() {
  const [method, setMethod] = useState<"bio" | "roblox" | null>(null);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 w-full max-w-md shadow-lg">
        <h1 className="text-3xl font-bold text-white mb-4 text-center">Verify Your Roblox Account</h1>
        <div className="flex flex-col gap-4 mb-6">
          <button
            className={`px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg ${method === "bio" ? "ring-2 ring-purple-400" : ""}`}
            onClick={() => setMethod("bio")}
          >
            Verify via Roblox Bio
          </button>
          <button
            className={`px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 transition-all duration-200 shadow-lg ${method === "roblox" ? "ring-2 ring-blue-400" : ""}`}
            onClick={() => setMethod("roblox")}
          >
            Verify via Roblox OAuth
          </button>
        </div>
        {method === null && (
          <div className="text-purple-200 text-center">Choose a verification method above.</div>
        )}
        {method === "bio" && (
          <div className="mt-4">
            <h2 className="text-xl font-bold text-white mb-2">Bio Verification</h2>
            <p className="text-purple-200 mb-2">this kih don't trust me 😹</p>
            <RobloxAuthSection />
          </div>
        )}
        {method === "roblox" && (
          <div className="mt-4">
            <h2 className="text-xl font-bold text-white mb-2">Roblox OAuth (Coming Soon)</h2>
            <p className="text-blue-200 mb-2">This method will allow you to securely verify your account using Roblox's official login system. Stay tuned!</p>
            <a href="https://devforum.roblox.com/t/oauth-20-roblox-api/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">Learn about Roblox OAuth</a>
          </div>
        )}
      </div>
    </div>
  );
}
