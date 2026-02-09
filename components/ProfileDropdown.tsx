"use client";
import { useState, useRef, useEffect } from "react";
// Define the user type for type safety
type UserSession = {
  robloxUserId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
};
import Link from "next/link";
import { getUserSession, clearUserSession } from "../lib/userSession";

export default function ProfileDropdown() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<UserSession | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const session = getUserSession();
    setUser(session ? session : null);
  }, []);

  const handleLogout = () => {
    clearUserSession();
    setUser(null);
    setOpen(false);
    window.location.reload();
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div
      className="relative inline-block"
      ref={dropdownRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{ minHeight: 40 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'left' }}>
        <button
          className="flex flex-col items-center focus:outline-none"
          tabIndex={0}
          aria-haspopup="true"
          aria-expanded={open}
          style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {user ? (
            <>
              <img
                src={user.avatarUrl || "/Images/profile.png"}
                alt="Profile"
                draggable="false"
                style={{ width: 40, height: 40, borderRadius: '50%' }}
              />
              <p style={{ fontSize: '0.85rem', margin: 0 }}>{user.displayName || user.username}</p>
            </>
          ) : (
            <>
              <img src="/Images/profile.png" alt="Profile" draggable="false" style={{ width: 40, height: 40 }} />
              <p style={{ fontSize: '0.85rem', margin: 0 }}>Profile</p>
            </>
          )}
        </button>
        {/* Bridge area to dropdown to prevent mouseout gap */}
        {open && <div style={{ height: 8, marginBottom: -8, width: '100%' }} />}
      </div>
      {open && (
        <div
          className="absolute right-0 mt-2 w-44 bg-slate-800 border border-purple-500/20 rounded-lg shadow-lg z-50"
          style={{ pointerEvents: 'auto', marginTop: 0 }}
        >
          {!user ? (
            <Link href="/verify" className="block px-4 py-2 text-white hover:bg-purple-600">Verify Account</Link>
          ) : (
            <>
              <Link href={`/player/${user.robloxUserId}`} className="block px-4 py-2 text-white hover:bg-purple-600">Profile</Link>
              <button onClick={handleLogout} className="block w-full text-left px-4 py-2 text-white hover:bg-purple-600">Logout</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
