//components/RobloxAuthSection.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setUserSession } from "../lib/userSession";

export default function RobloxAuthSection() {
  const [username, setUsername] = useState("");
  const [code] = useState(() => Math.floor(100 + Math.random() * 900).toString());
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const router = useRouter();

  const handleCheck = async () => {
    setChecking(true);
    setStatus(null);
    try {
      // Use proxy API route to search for user
      const res = await fetch(`/api/roblox/search-user?username=${encodeURIComponent(username)}`);
      if (!res.ok) {
        setStatus("Roblox search API error: " + res.status);
        setChecking(false);
        return;
      }
      const data = await res.json();
      if (!data.data || !Array.isArray(data.data) || !data.data[0]) {
        setStatus("User not found or Roblox API changed.");
        setChecking(false);
        return;
      }
      const userId = data.data[0].id;
      if (!userId) {
        setStatus("User ID not found.");
        setChecking(false);
        return;
      }
      // Use proxy API route to fetch user profile
      const profileRes = await fetch(`/api/roblox/user-profile?userId=${encodeURIComponent(userId)}`);
      if (!profileRes.ok) {
        setStatus("Roblox profile API error: " + profileRes.status);
        setChecking(false);
        return;
      }
      const profileData = await profileRes.json();
      if (typeof profileData.description !== "string") {
        setStatus("Could not read bio. Roblox API may have changed.");
        setChecking(false);
        return;
      }
      if (profileData.description.includes(code)) {
        setStatus("Authentication successful!");
        
        // Fetch the real avatar URL using the API route
        const headshotRes = await fetch(`/api/roblox/headshot?userId=${userId}`);
        const headshotData = await headshotRes.json();
        const avatarUrl = headshotData.imageUrl || null;
        
        // Upsert user in DB
        fetch("/api/user/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            robloxUserId: userId,
            username: profileData.name,
            displayName: profileData.displayName,
            avatarUrl: avatarUrl,
            description: profileData.description,
          }),
        })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json();
            setStatus("Failed to save profile: " + (err.error || res.status));
            setChecking(false);
            return;
          }
          // Store user session client-side
          setUserSession({
            robloxUserId: userId,
            username: profileData.name,
            displayName: profileData.displayName,
            avatarUrl: avatarUrl,
          });
          setTimeout(() => {
            router.push(`/player/${userId}`);
          }, 1200);
        })
        .catch((err) => {
          setStatus("Failed to save profile: " + err.message);
          setChecking(false);
        });
        return;
      } else {
        setStatus("Bio does not contain the code. Please update your Roblox bio and try again.");
      }
    } catch (err) {
      setStatus("Network or unexpected error: " + (err instanceof Error ? err.message : String(err)));
    }
    setChecking(false);
  };

  return (
    <div className="bg-slate-700 rounded-lg p-6 border border-purple-500/10 mb-8">
      <h3 className="text-xl font-bold text-white mb-2">Roblox Account Authentication</h3>
      <div className="mb-2 text-purple-300">Enter your Roblox username and set your bio to <span className="font-mono bg-slate-800 px-2 py-1 rounded">{code}</span> to verify ownership.</div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Roblox username"
          className="px-4 py-2 rounded bg-slate-800 text-white border border-purple-500/20 focus:border-purple-500 outline-none"
        />
        <button
          onClick={handleCheck}
          disabled={checking || !username}
          className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg"
        >
          {checking ? "Checking..." : "Authenticate"}
        </button>
      </div>
      {status && <div className="mt-2 text-purple-300">{status}</div>}
    </div>
  );
}