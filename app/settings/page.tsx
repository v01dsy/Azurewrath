'use client';

import { useEffect, useState } from 'react';
import { getUserSession } from '@/lib/userSession';
import { DiscordNotificationSettings } from '@/components/DiscordNotificationSettings';

export default function SettingsPage() {
  const [discordUsername, setDiscordUsername] = useState<string | null>(null);
  const [discordNotifications, setDiscordNotifications] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getUserSession();
    if (!session) { setLoading(false); return; }

    fetch(`/api/user/settings?userId=${session.robloxUserId}`)
      .then(r => r.json())
      .then(data => {
        setDiscordUsername(data.discordUsername ?? null);
        setDiscordNotifications(data.discordNotifications ?? false);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-white p-12">Loading...</p>;

  return (
    <main className="max-w-lg mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-white mb-8">Settings</h1>
      <DiscordNotificationSettings
        initialDiscordUsername={discordUsername}
        initialEnabled={discordNotifications}
      />
    </main>
  );
}