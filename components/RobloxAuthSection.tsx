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

        const headshotRes = await fetch(`/api/roblox/headshot?userId=${userId}`);
        const headshotData = await headshotRes.json();
        const avatarUrl = headshotData.imageUrl || null;

        const sessionRes = await fetch("/api/auth/bio/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            robloxUserId: userId,
            username: profileData.name,
            displayName: profileData.displayName,
            avatarUrl: avatarUrl,
            description: profileData.description,
          }),
        });

        if (!sessionRes.ok) {
          const err = await sessionRes.json();
          setStatus("Failed to create session: " + (err.error || sessionRes.status));
          setChecking(false);
          return;
        }

        setUserSession({
          robloxUserId: userId,
          username: profileData.name,
          displayName: profileData.displayName,
          avatarUrl: avatarUrl,
          authMethod: 'bio',
        });

        setTimeout(() => {
          router.push(`/player/${userId}`);
        }, 1200);
      } else {
        setStatus("Bio does not contain the code. Please update your Roblox bio and try again.");
      }
    } catch (err) {
      setStatus("Network or unexpected error: " + (err instanceof Error ? err.message : String(err)));
    }
    setChecking(false);
  };

  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-3">Roblox Account Authentication</h3>
      <p className="text-slate-400 text-sm mb-4">
        Enter your Roblox username and set your bio to{" "}
        <span
          className="font-mono text-white px-2 py-0.5 rounded text-xs"
          style={{ backgroundColor: '#1e1e1e', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          {code}
        </span>{" "}
        to verify ownership.
      </p>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Roblox username"
          className="flex-1 px-4 py-2 rounded-lg text-white text-sm outline-none transition"
          style={{
            backgroundColor: '#1e1e1e',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
          onFocus={e => (e.target.style.borderColor = 'rgba(139,92,246,0.6)')}
          onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
        />
        {/* Button color unchanged */}
        <button
          onClick={handleCheck}
          disabled={checking || !username}
          className="px-5 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {checking ? "Checking..." : "Authenticate"}
        </button>
      </div>
      {status && (
        <p className={`text-sm mt-1 ${status.includes('successful') ? 'text-green-400' : 'text-slate-400'}`}>
          {status}
        </p>
      )}
    </div>
  );
}