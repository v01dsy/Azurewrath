'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUserSession } from '@/lib/userSession';
import { usePushNotifications } from '@/lib/usePushNotifications';

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  oldValue?: number | null;
  newValue?: number | null;
  read: boolean;
  createdAt: string;
  item: {
    assetId: string;
    name: string;
    imageUrl?: string | null;
  };
}

function timeAgo(dateStr: string): string {
  // Prisma returns the worker's naive local time with a Z appended, making JS
  // think it's UTC. Strip the Z and replace with the local timezone offset
  // so the browser interprets it as the actual local time it was stored as.
  const clean = dateStr.replace('Z', '').replace('T', ' ');
  const date = new Date(clean);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const user = typeof window !== 'undefined' ? getUserSession() : null;
  const unreadCount = notifications.filter((n) => !n.read).length;
  const { permission, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications();

  useEffect(() => {
    document.title = 'Notifications | Azurewrath';
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/user/notifications?userId=${user.robloxUserId}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user?.robloxUserId]);

  // Initial fetch
  useEffect(() => {
    if (!user) {
      router.push('/verify');
      return;
    }
    fetchNotifications();
  }, [user, router, fetchNotifications]);

  // ADDED: Auto-refresh every 10 seconds to poll for new notifications
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(() => {
      fetchNotifications();
    }, 10000); // 10 seconds
    
    return () => clearInterval(interval);
  }, [user, fetchNotifications]);

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await fetch('/api/user/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.robloxUserId, markAll: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  };

  const handleClick = async (n: NotificationItem) => {
    if (!n.read && user) {
      try {
        await fetch('/api/user/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.robloxUserId, ids: [n.id] }),
        });
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
        );
      } catch {
        // ignore
      }
    }
    router.push(`/item/${n.item.assetId}`);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="animate-spin text-4xl mb-4">⚙️</div>
        <p className="text-slate-400">Loading notifications...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold glow-purple">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-slate-400 mt-1">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="text-sm px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition disabled:opacity-50"
            >
              {markingAll ? 'Marking...' : 'Mark all read'}
            </button>
          )}
          {permission !== 'unsupported' && (
            <button
              onClick={permission === 'granted' ? unsubscribe : subscribe}
              disabled={pushLoading || permission === 'denied'}
              title={permission === 'denied' ? 'Notifications blocked — enable in browser settings' : ''}
              className={`text-sm px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                permission === 'granted'
                  ? 'bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300'
                  : permission === 'denied'
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-neon-blue/20 to-neon-purple/20 border border-neon-blue/30 text-white hover:border-neon-blue/60'
              }`}
            >
              {pushLoading
                ? 'Loading...'
                : permission === 'granted'
                ? 'Browser alerts on'
                : permission === 'denied'
                ? 'Notifications blocked'
                : 'Enable browser alerts'}
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <p className="text-slate-500 text-lg">No notifications yet</p>
          <p className="text-slate-600 text-sm">
            Add items to your watchlist to get alerts when prices change.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const imgSrc =
              n.item.imageUrl ??
              `https://www.roblox.com/asset-thumbnail/image?assetId=${n.item.assetId}&width=80&height=80&format=png`;

            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-150
                  ${!n.read
                    ? 'bg-purple-500/5 border-purple-500/20 hover:border-purple-500/40'
                    : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'
                  }`}
              >
                {/* Thumbnail */}
                <img
                  src={imgSrc}
                  alt={n.item.name}
                  className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-slate-700"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/Images/icon.png';
                  }}
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${!n.read ? 'text-white font-medium' : 'text-slate-300'}`}>
                    {n.message}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{timeAgo(n.createdAt)}</p>
                </div>

                {/* Unread indicator */}
                {!n.read && (
                  <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-purple-500" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}