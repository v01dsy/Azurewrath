// app/trade/[id]/TradeAdActions.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUserSession } from '@/lib/userSession';

interface Props {
  adId: string;
  active: boolean;
  robloxUserId: string;
}

export default function TradeAdActions({ adId, active, robloxUserId }: Props) {
  const router = useRouter();
  const [isOwn, setIsOwn] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const session = getUserSession();
    if (session?.robloxUserId === robloxUserId) setIsOwn(true);
  }, [robloxUserId]);

  const handleDelete = async () => {
    if (!confirm('Delete this trade ad?')) return;
    setDeleting(true);
    await fetch(`/api/trade/${adId}`, { method: 'DELETE' });
    router.push('/trade');
  };

  return (
    <div className="flex items-center gap-2">
      {active && (
        <a
          href={`https://www.roblox.com/users/${robloxUserId}/trade`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-xl font-bold text-sm bg-purple-600/30 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 transition"
        >
          Send Trade ↗
        </a>
      )}
      {isOwn && active && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-3 py-2 rounded-xl text-sm font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition disabled:opacity-40"
        >
          {deleting ? '...' : 'Delete'}
        </button>
      )}
    </div>
  );
}