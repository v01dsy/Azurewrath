// app/notifications/page.tsx
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
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getCardStyle(n: NotificationItem) {
  const isValueChange = n.type === 'rap_change' || n.type === 'price_and_rap_change' || n.type === 'price_change';
  if (isValueChange && n.oldValue != null && n.newValue != null) {
    const isGain = n.newValue > n.oldValue;
    if (n.read) {
      return isGain
        ? 'bg-green-500/[0.07] border-green-500/20 hover:border-green-500/30'
        : 'bg-red-500/[0.07] border-red-500/20 hover:border-red-500/30';
    }
    return isGain
      ? 'bg-green-500/10 border-green-500/30 hover:border-green-500/45'
      : 'bg-red-500/10 border-red-500/30 hover:border-red-500/45';
  }

  return n.read
    ? 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'
    : 'bg-purple-500/5 border-purple-500/20 hover:border-purple-500/40';
}

function getArrowImage(n: NotificationItem): string | null {
  if (n.read) return null;
  const isValueChange = n.type === 'rap_change' || n.type === 'price_and_rap_change' || n.type === 'price_change';
  if (!isValueChange || n.oldValue == null || n.newValue == null) return null;
  return n.newValue > n.oldValue ? '/Images/gain.png' : '/Images/loss.png';
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const user = typeof window !== 'undefined' ? getUserSession() : null;
  const unreadCount = notifications.filter((n) => !n.read).length;
  const { permission, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications();

  useEffect(() => { document.title = 'Notifications | Azurewrath'; }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/user/notifications?userId=${user.robloxUserId}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications);
    } catch { } finally { setLoading(false); }
  }, [user?.robloxUserId]);

  useEffect(() => {
    if (!user) { router.push('/verify'); return; }
    fetchNotifications();
  }, [user, router, fetchNotifications]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => { fetchNotifications(); }, 10000);
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
    } catch { } finally { setMarkingAll(false); }
  };

  const handleClick = async (n: NotificationItem) => {
    if (!n.read && user) {
      try {
        await fetch('/api/user/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.robloxUserId, ids: [n.id] }),
        });
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      } catch { }
    }
    router.push(`/item/${n.item.assetId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12">
      <div className="max-w-2xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold glow-purple">Notifications</h1>
            {unreadCount > 0 && <p className="text-slate-400 mt-1">{unreadCount} unread</p>}
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
                {pushLoading ? 'Loading...' : permission === 'granted' ? 'Browser alerts on' : permission === 'denied' ? 'Notifications blocked' : 'Enable browser alerts'}
              </button>
            )}
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <p className="text-slate-500 text-lg">No notifications yet</p>
            <p className="text-slate-600 text-sm">Add items to your watchlist to get alerts when prices change.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const imgSrc = n.item.imageUrl ?? `https://www.roblox.com/asset-thumbnail/image?assetId=${n.item.assetId}&width=80&height=80&format=png`;
              const arrowSrc = getArrowImage(n);
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-150 ${getCardStyle(n)}`}
                >
                  <img
                    src={imgSrc}
                    alt={n.item.name}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-slate-700"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/Images/icon.png'; }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${!n.read ? 'text-white font-medium' : 'text-slate-300'}`}>
                      {n.message}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
                      {arrowSrc && (
                        <img
                          src={arrowSrc}
                          alt=""
                          style={{ width: 16, height: 16, objectFit: 'contain' }}
                        />
                      )}
                      <div className="w-2 h-2 rounded-full bg-purple-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}