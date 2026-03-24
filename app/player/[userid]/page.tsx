// app/player/[userid]/page.tsx
import type { Metadata } from 'next';
import prisma from '@/lib/prisma';
import ClientInventoryGrid from './ClientInventoryGrid';
import PlayerInteractive from './PlayerInteractive';
import DescriptionButton from './DescriptionButton';
import RankBadge from '@/components/RankBadge';

interface PageProps {
  params: Promise<{ userid: string }>;
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

  const [
    isPrivateResult,
    avatarResult,
    inventoryData,
    allSnapshots,
    rankRes,
  ] = await Promise.all([
    canViewInventory(robloxUserIdString).then(v => !v),
    fetch(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${robloxUserIdString}&size=420x420&format=Webp&isCircular=false`,
      { next: { revalidate: 300 } }
    ).then(r => r.ok ? r.json() : null).catch(() => null),
    prisma.$queryRaw<Array<{
      assetId: bigint;
      name: string;
      imageUrl: string | null;
      manipulated: boolean;
      isLimitedUnique: boolean | null;
      rap: number | null;
      itemCount: number;
      serialNumbers: (number | null)[];
      userAssetIds: bigint[];
      scannedAts: Date[];
      uaidUpdatedAts: (Date | null)[];
      isOnHold: boolean;
    }>>`
      WITH LatestSnapshot AS (
        SELECT id
        FROM "InventorySnapshot"
        WHERE "userId" = ${user.robloxUserId}
        ORDER BY "createdAt" DESC
        LIMIT 1
      ),
      Aggregated AS (
        SELECT
          ii."assetId",
          COUNT(*) as item_count,
          ARRAY_AGG(ii."userAssetId" ORDER BY ii."scannedAt" ASC) as user_asset_ids,
          ARRAY_AGG(ii."serialNumber" ORDER BY ii."scannedAt" ASC) as serial_numbers,
          ARRAY_AGG(ii."scannedAt" ORDER BY ii."scannedAt" ASC) as scanned_ats,
          ARRAY_AGG(ii."uaidUpdatedAt" ORDER BY ii."scannedAt" ASC) as uaid_updated_ats,
          COALESCE(BOOL_OR(ii."isOnHold"), false) as is_on_hold
        FROM "InventoryItem" ii
        INNER JOIN LatestSnapshot ls ON ii."snapshotId" = ls.id
        GROUP BY ii."assetId"
      )
      SELECT
        a."assetId",
        COALESCE(i.name, 'Unknown Item') as name,
        i."imageUrl",
        COALESCE(i.manipulated, false) as manipulated,
        i."isLimitedUnique",
        COALESCE(ph.rap, 0) as rap,
        a.item_count::int as "itemCount",
        a.serial_numbers as "serialNumbers",
        a.user_asset_ids as "userAssetIds",
        a.scanned_ats as "scannedAts",
        a.uaid_updated_ats as "uaidUpdatedAts",
        a.is_on_hold as "isOnHold"
      FROM Aggregated a
      LEFT JOIN "Item" i ON a."assetId" = i."assetId"
      LEFT JOIN LATERAL (
        SELECT rap
        FROM "PriceHistory"
        WHERE "itemId" = a."assetId"
        ORDER BY timestamp DESC
        LIMIT 1
      ) ph ON true
      ORDER BY ph.rap DESC NULLS LAST
    `,
    prisma.inventorySnapshot.findMany({
      where: { userId: user.robloxUserId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true, totalRAP: true, totalItems: true, uniqueItems: true },
    }),
    fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/player/${user.robloxUserId.toString()}/rank`,
      { cache: 'no-store' }
    ).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);

  const isPrivate = isPrivateResult;
  const avatarUrl = avatarResult?.data?.[0]?.imageUrl || user.avatarUrl;

  const inventory = inventoryData.map(item => ({
    assetId: item.assetId.toString(),
    name: item.name,
    imageUrl: item.imageUrl,
    manipulated: item.manipulated ?? false,
    isOnHold: item.isOnHold ?? null,
    isLimitedUnique: item.isLimitedUnique ?? null,
    rap: item.rap || 0,
    count: item.itemCount,
    userAssetIds: item.userAssetIds.map((id: bigint) => id.toString()),
    serialNumbers: item.serialNumbers,
    scannedAt: item.scannedAts?.[0] ?? null,
    scannedAts: item.scannedAts,
    uaidUpdatedAts: item.uaidUpdatedAts,
  }));

  const totalRAP = inventory.reduce((sum, item) => sum + (item.rap * item.count), 0);
  const totalItems = inventory.reduce((sum, item) => sum + item.count, 0);
  const uniqueItems = inventory.length;

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
    stats: { totalRAP, totalItems, uniqueItems, lastScanned: allSnapshots[allSnapshots.length - 1]?.createdAt.toISOString() ?? null },
    graphData,
    isPrivate,
    ranks: {
      rapRank:    rankRes?.rapRank    ?? null,
      itemsRank:  rankRes?.itemsRank  ?? null,
      uniqueRank: rankRes?.uniqueRank ?? null,
    },
  };
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

        <div className="flex flex-col md:flex-row items-stretch gap-6 mb-6">
  

          {/* ── Sidebar ───────────────────────────────────────────── */}
          <div className="w-full md:w-80 flex-shrink-0">
            <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6 h-full relative">

              {/* Role badgelol */}
              {user.role && user.role !== 'user' && (
                <div className="absolute top-4 left-4 group z-10">
                  <img src={`/Images/${user.role}.webp`} alt={user.role ?? ''} className="w-7 h-7 object-contain opacity-90 hover:opacity-100 transition" />
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
                  <DescriptionButton description={user.description} name={user.displayName || user.username} />
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
                      <span className="text-[#aaa] text-sm">Items</span>
                      <span className="font-semibold text-sm" style={{ color: '#4fc3f7' }}>{stats.totalItems}</span>
                      {ranks.itemsRank != null && <RankBadge rank={ranks.itemsRank} label="Items rank" />}
                    </div>
                    <div className="group relative flex justify-between items-center cursor-default">
                      <span className="text-[#aaa] text-sm">Uniques</span>
                      <span className="font-semibold text-sm" style={{ color: '#a259f7' }}>{stats.uniqueItems}</span>
                      {ranks.uniqueRank != null && <RankBadge rank={ranks.uniqueRank} label="Unique rank" />}
                    </div>
                    <div className="group relative flex justify-between items-center cursor-default">
                      <span className="text-[#aaa] text-sm">RAP</span>
                      <span className="font-semibold text-sm" style={{ color: '#4ade80' }}>{stats.totalRAP.toLocaleString()} R$</span>
                      {ranks.rapRank != null && <RankBadge rank={ranks.rapRank} label="RAP rank" />}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Graph + modals (client component) ─────────────────── */}
          <PlayerInteractive graphData={graphData} user={user} isPrivate={isPrivate} hasInventory={inventory.length > 0} />

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