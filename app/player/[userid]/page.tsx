// app/player/[userid]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import ClientInventoryGrid from './ClientInventoryGrid';
import PlayerInteractive from './PlayerInteractive';

interface PageProps {
  params: Promise<{ userid: string }>;
}

// ─── Rank tier helper ──────────────────────────────────────────────────────

function getRankTier(rank: number): { color: string; label: string; glow: boolean } {
  if (rank === 1)    return { color: '#c2b506', label: '👑',       glow: true  };
  if (rank === 2)    return { color: '#f3f3f3', label: `#${rank}`, glow: true  };
  if (rank === 3)    return { color: '#cf7500', label: `#${rank}`, glow: true  };
  if (rank <= 10)    return { color: '#49e0ff', label: `#${rank}`, glow: true  };
  if (rank <= 50)    return { color: '#ff6dff', label: `#${rank}`, glow: true  };
  if (rank <= 100)   return { color: '#9ff400', label: `#${rank}`, glow: true  };
  if (rank <= 250)   return { color: '#ffa121', label: `#${rank}`, glow: true  };
  if (rank <= 500)   return { color: '#9d66f3', label: `#${rank}`, glow: false };
  if (rank <= 1000)  return { color: '#17c7b4', label: `#${rank}`, glow: false };
  if (rank <= 5000)  return { color: '#ff7967', label: `#${rank}`, glow: false };
  if (rank <= 10000) return { color: '#979797', label: `#${rank}`, glow: false };
  return               { color: '#666666',  label: `#${rank}`, glow: false };
}

// ─── generateMetadata ─────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { userid } = await params;
  try {
    const user = await prisma.user.findUnique({
      where: { robloxUserId: BigInt(userid) },
      select: { username: true, displayName: true },
    });
    const name = user?.displayName || user?.username || 'Player';
    return {
      title: `${name} | Inventory`,
      description: `View ${name}'s Roblox limited inventory, RAP history and trade data on Azurewrath.`,
    };
  } catch {
    return {
      title: 'Player | Inventory',
      description: 'View Roblox limited inventory and trade data on Azurewrath.',
    };
  }
}

// ─── Data fetching ─────────────────────────────────────────────────────────

async function canViewInventory(robloxUserId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://inventory.roblox.com/v1/users/${robloxUserId}/can-view-inventory`, { cache: 'no-store' });
    if (!res.ok) return true;
    const data = await res.json();
    return data.canView !== false;
  } catch {
    return true;
  }
}

async function fetchPlayerData(userid: string) {
  const user = await prisma.user.findUnique({ where: { robloxUserId: BigInt(userid) } });
  if (!user) return null;

  const robloxUserIdString = user.robloxUserId.toString();
  const isPrivate = !(await canViewInventory(robloxUserIdString));

  // Fetch fresh avatar
  let avatarUrl = user.avatarUrl;
  try {
    const avatarRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${robloxUserIdString}&size=420x420&format=Png&isCircular=false`,
      { next: { revalidate: 300 } }
    );
    if (avatarRes.ok) {
      const avatarData = await avatarRes.json();
      avatarUrl = avatarData.data?.[0]?.imageUrl || avatarUrl;
    }
  } catch {}

  // Latest snapshot + items
  const latestSnapshot = await prisma.inventorySnapshot.findFirst({
    where: { userId: user.robloxUserId },
    orderBy: { createdAt: 'desc' },
    include: {
      items: {
        include: {
          item: { include: { priceHistory: { orderBy: { timestamp: 'desc' }, take: 1 } } },
        },
      },
    },
  });

  // Build inventory
  const inventoryMap = new Map<string, any>();
  for (const invItem of latestSnapshot?.items ?? []) {
    const key = invItem.assetId.toString();
    const rap = invItem.item?.priceHistory?.[0]?.rap ?? 0;
    const existing = inventoryMap.get(key);
    if (existing) {
      existing.count += 1;
      existing.userAssetIds.push(invItem.userAssetId.toString());
      existing.serialNumbers.push(invItem.serialNumber);
    } else {
      inventoryMap.set(key, {
        assetId: key,
        name: invItem.item?.name ?? 'Unknown',
        imageUrl: invItem.item?.imageUrl ?? null,
        manipulated: invItem.item?.manipulated ?? false,
        isLimitedUnique: invItem.item?.isLimitedUnique ?? null,
        rap,
        count: 1,
        userAssetIds: [invItem.userAssetId.toString()],
        serialNumbers: [invItem.serialNumber],
        scannedAt: invItem.scannedAt.toISOString(),
      });
    }
  }

  const inventory = Array.from(inventoryMap.values());
  const totalRAP = inventory.reduce((sum, item) => sum + item.rap * item.count, 0);
  const totalItems = inventory.reduce((sum, item) => sum + item.count, 0);
  const uniqueItems = inventory.length;

// Graph data — read stored values directly, never recalculate
const allSnapshots = await prisma.inventorySnapshot.findMany({
  where: { userId: user.robloxUserId },
  orderBy: { createdAt: 'asc' },
  select: {
    id: true,
    createdAt: true,
    totalRAP: true,
    totalItems: true,
    uniqueItems: true,
  },
});

const graphData = allSnapshots.map(snapshot => ({
  snapshotId: snapshot.id,
  date: snapshot.createdAt.toISOString(),
  timestamp: snapshot.createdAt.getTime(),
  rap: snapshot.totalRAP ?? 0,
  itemCount: snapshot.totalItems ?? 0,
  uniqueCount: snapshot.uniqueItems ?? 0,
}));

  return {
    user: {
      robloxUserId: robloxUserIdString,
      username: user.username,
      displayName: user.displayName,
      avatarUrl,
      description: user.description,
      role: user.role,
    },
    inventory,
    stats: { totalRAP, totalItems, uniqueItems, lastScanned: latestSnapshot?.createdAt.toISOString() ?? null },
    graphData,
    isPrivate,
    ranks: { rapRank: null as number | null, itemsRank: null as number | null, uniqueRank: null as number | null },
  };
}

// ─── Rank badge ───────────────────────────────────────────────────────────

function RankBadge({ rank, label }: { rank: number; label: string }) {
  const tier = getRankTier(rank);
  return (
    <div className="pointer-events-none absolute right-0 bottom-full mb-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col items-end">
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap"
        style={{ backgroundColor: '#1a1a1a', border: `1px solid ${tier.color}55`, color: tier.color, boxShadow: tier.glow ? `0 0 10px ${tier.color}33` : 'none' }}>
        <span className="opacity-60">{label}</span>
        <span>{tier.label}</span>
      </div>
      <div className="w-2 h-2 rotate-45 mr-2 -mt-1"
        style={{ backgroundColor: '#1a1a1a', border: `1px solid ${tier.color}55`, borderTop: 'none', borderLeft: 'none' }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default async function PlayerPage({ params }: PageProps) {
  const { userid } = await params;
  const data = await fetchPlayerData(userid);

  if (!data) {
    return (
      <div className="min-h-screen w-full text-white -mt-20 pt-24 flex items-center justify-center">
        <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl p-8 text-center max-w-md">
          <h2 className="text-white text-2xl font-bold mb-4">User Not in Database</h2>
          <p className="text-[#aaa] mb-6">This user isn't in the database yet. Would you like to add them?</p>
          <form action={`/api/load-user/${userid}`} method="POST">
            <button type="submit" className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition">
              Add User to Database
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { user, inventory, stats, graphData, isPrivate, ranks } = data;

  const roleStyles: Record<string, { bg: string; border: string; text: string }> = {
    mod:   { bg: '#0a1a2e', border: '#3b82f6', text: '#93c5fd' },
    admin: { bg: '#2e0a0a', border: '#ef4444', text: '#fca5a5' },
    owner: { bg: '#1a0a2e', border: '#8b5cf6', text: '#c4b5fd' },
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white p-4 -mt-20 pt-24">
      <div className="max-w-7xl mx-auto">

        <div className="flex items-stretch gap-6 mb-6">

          {/* ── Sidebar ───────────────────────────────────────────── */}
          <div className="w-80 flex-shrink-0">
            <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6 h-full relative">

              {/* Role badge */}
              {user.role && user.role !== 'user' && (
                <div className="absolute top-4 left-4 group z-10">
                  <img src={`/Images/${user.role}.png`} alt={user.role ?? ''} className="w-7 h-7 object-contain opacity-90 hover:opacity-100 transition" />
                  {(() => {
                    const s = roleStyles[user.role ?? ''] ?? roleStyles.owner;
                    const label = user.role === 'mod' ? 'Moderator' : user.role === 'admin' ? 'Admin' : user.role === 'owner' ? 'Owner' : user.role;
                    return (
                      <div className="absolute left-0 top-full mt-1.5 px-2 py-1 rounded-md text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg"
                        style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
                        {label}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Avatar */}
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={`${user.displayName || user.username}'s avatar`} className="w-full h-auto rounded-lg mb-5" />
              ) : (
                <div className="w-full aspect-square bg-white/5 rounded-lg flex items-center justify-center mb-5">
                  <span className="text-[#888]">No avatar</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <h1 className="text-2xl font-bold text-white">{user.displayName || user.username}</h1>
                  <p className="text-[#aaa] text-sm">@{user.username}</p>
                </div>

                {user.description && (
                  <div>
                    <p className="text-[#888] text-sm truncate">{user.description}</p>
                  </div>
                )}

                <div className="text-[#777] text-xs">Roblox ID: {user.robloxUserId}</div>

                {isPrivate && (
                  <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-amber-400 text-sm">
                      <span>🔒</span>
                      <span className="font-medium">Inventory is Private</span>
                    </div>
                  </div>
                )}

                {!isPrivate && (
                  <div className="space-y-2 pt-4 border-t border-white/10">
                    <div className="group relative flex justify-between items-center cursor-default">
                      <span className="text-[#aaa] text-sm">Total Items</span>
                      <span className="font-semibold text-sm" style={{ color: '#4fc3f7' }}>{stats.totalItems}</span>
                      {ranks.itemsRank != null && <RankBadge rank={ranks.itemsRank} label="Items rank" />}
                    </div>
                    <div className="group relative flex justify-between items-center cursor-default">
                      <span className="text-[#aaa] text-sm">Unique Items</span>
                      <span className="font-semibold text-sm" style={{ color: '#a259f7' }}>{stats.uniqueItems}</span>
                      {ranks.uniqueRank != null && <RankBadge rank={ranks.uniqueRank} label="Unique rank" />}
                    </div>
                    <div className="group relative flex justify-between items-center cursor-default">
                      <span className="text-[#aaa] text-sm">Total RAP</span>
                      <span className="font-semibold text-sm" style={{ color: '#43e97b' }}>{stats.totalRAP.toLocaleString()} R$</span>
                      {ranks.rapRank != null && <RankBadge rank={ranks.rapRank} label="RAP rank" />}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Graph + modals (client component) ─────────────────── */}
          <PlayerInteractive graphData={graphData} user={user} isPrivate={isPrivate} />

        </div>

        {/* ── Inventory grid ───────────────────────────────────────── */}
        {isPrivate ? (
          <div className="bg-[#1e1e1e] border border-white/10 rounded-xl p-12 text-center">
            <div className="text-[#888] text-xl mb-4">🔒</div>
            <h3 className="text-white text-2xl mb-2">Inventory is Private</h3>
            <p className="text-[#888]">This player has their inventory settings set to private.</p>
          </div>
        ) : (
          <ClientInventoryGrid items={inventory as any[]} />
        )}

      </div>
    </div>
  );
}