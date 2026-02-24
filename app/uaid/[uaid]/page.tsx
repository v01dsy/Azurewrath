//app/uaid/[uaid]/page.tsx
import prisma from "@/lib/prisma";
import React from "react";
import { LocalTime } from "@/components/LocalTime";

interface UAIDPageProps {
  params: Promise<{ uaid: string }>;
}

type RealOwnerResult =
  | { found: true; userId: string; username: string }
  | { found: false; error?: string };

/**
 * Finds the real current owner of a specific UAID by paging through
 * inventory.roblox.com/v2/assets/{assetId}/owners until we find the
 * matching userAssetId. Works even for untracked users.
 */
async function findRealOwnerByUAID(assetId: string, userAssetId: string): Promise<RealOwnerResult> {
  try {
    let cursor: string | null = null;
    let pageCount = 0;
    const MAX_PAGES = 50; // Safety cap to avoid infinite loops on huge items

    do {
      const url = cursor
        ? `https://inventory.roblox.com/v2/assets/${assetId}/owners?sortOrder=Asc&limit=100&cursor=${cursor}`
        : `https://inventory.roblox.com/v2/assets/${assetId}/owners?sortOrder=Asc&limit=100`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store',
      });

      if (!res.ok) {
        return { found: false, error: `API returned ${res.status}` };
      }

      const data = await res.json();
      const owners: any[] = data.data ?? [];

      // Each entry has: id (userId), name (username), userAssetId, serialNumber, etc.
      const match = owners.find((o: any) => o.userAssetId?.toString() === userAssetId);
      if (match) {
        return {
          found: true,
          userId: match.id?.toString(),
          username: match.name,
        };
      }

      cursor = data.nextPageCursor ?? null;
      pageCount++;
    } while (cursor && pageCount < MAX_PAGES);

    return { found: false, error: 'UAID not found in owner list' };
  } catch (e: any) {
    return { found: false, error: e?.message ?? 'Unknown error' };
  }
}

export default async function UAIDPage({ params }: UAIDPageProps) {
  const { uaid } = await params;
  
  const uaidBigInt = BigInt(uaid);
  
  // Get item metadata from most recent record
  const mostRecentItem = await prisma.inventoryItem.findFirst({
    where: { userAssetId: uaidBigInt },  
    orderBy: { scannedAt: "desc" },
    include: {
      snapshot: { include: { user: true } },
      item: {
        include: {
          priceHistory: {
            orderBy: { timestamp: 'desc' },
            take: 1
          }
        }
      }
    },
  });

  if (!mostRecentItem) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8">
            <h1 className="text-3xl font-bold text-white mb-4">UAID Not Found</h1>
            <p className="text-slate-400">No items found for UAID: <span className="text-purple-300 font-mono">{uaid}</span></p>
          </div>
        </div>
      </div>
    );
  }

  // ── Ownership History: ALL distinct snapshots that contained this UAID ──
  const allOwnerships = await prisma.inventoryItem.findMany({
    where: { userAssetId: uaidBigInt },
    orderBy: { scannedAt: "desc" },
    distinct: ['snapshotId'],
    include: {
      snapshot: { include: { user: true } },
    },
  });

  // Deduplicate consecutive same-owner entries for display
  const dedupedHistory: typeof allOwnerships = [];
  for (const entry of allOwnerships) {
    const lastEntry = dedupedHistory[dedupedHistory.length - 1];
    const sameOwner = lastEntry?.snapshot?.user?.robloxUserId?.toString() === entry.snapshot?.user?.robloxUserId?.toString();
    if (!sameOwner) {
      dedupedHistory.push(entry);
    }
  }

  const lastKnownOwner = allOwnerships[0]?.snapshot?.user;
  const lastKnownOwnerId = lastKnownOwner?.robloxUserId?.toString() ?? null;
  const lastKnownOwnerUsername = lastKnownOwner?.username ?? null;
  const itemData = mostRecentItem.item;
  const latestPrice = itemData?.priceHistory?.[0];
  const serialNumber = mostRecentItem?.serialNumber;
  const assetId = mostRecentItem.assetId.toString();

  // ── Live owner lookup via Roblox API — works even for untracked users ──
  const ownerResult = await findRealOwnerByUAID(assetId, uaid);

  const currentOwner = ownerResult.found ? ownerResult.username : null;
  const currentOwnerUserId = ownerResult.found ? ownerResult.userId : null;

  // Is the real owner someone we haven't tracked yet?
  const isNewUntracked = ownerResult.found && ownerResult.userId !== lastKnownOwnerId;
  const ownerCheckFailed = !ownerResult.found && !!ownerResult.error && ownerResult.error !== 'UAID not found in owner list';
  const itemTraded = !ownerResult.found && !ownerCheckFailed && lastKnownOwnerId !== null;

  // ── Avatars ──
  let currentOwnerAvatar: string | null = null;
  if (currentOwnerUserId) {
    try {
      const avatarResponse = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${currentOwnerUserId}&size=420x420&format=Png&isCircular=false`,
        { next: { revalidate: 60 } }
      );
      const avatarData = await avatarResponse.json();
      currentOwnerAvatar = avatarData.data?.[0]?.imageUrl ?? null;
    } catch {}
  }

  const historyUserIds = [...new Set(dedupedHistory.map(i => i.snapshot?.user?.robloxUserId?.toString()).filter(Boolean))];
  const avatarMap = new Map<string, string>();

  if (historyUserIds.length > 0) {
    try {
      const avatarResponse = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${historyUserIds.join(',')}&size=150x150&format=Png&isCircular=false`,
        { next: { revalidate: 300 } }
      );
      const avatarData = await avatarResponse.json();
      avatarData.data?.forEach((avatar: any) => {
        avatarMap.set(avatar.targetId.toString(), avatar.imageUrl);
      });
    } catch {}
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header Card - Item Info */}
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
          <div className="flex items-start gap-6">
            {/* Item Thumbnail */}
            <div className="relative w-40 h-40 bg-slate-700/50 rounded-lg overflow-hidden flex-shrink-0">
              {itemData?.imageUrl ? (
                <img 
                  src={itemData.imageUrl} 
                  alt={itemData.name || 'Item'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              {itemData?.manipulated && (
                <div className="absolute top-1.5 left-1.5">
                  <img
                    src="/Images/manipulated1.png"
                    alt="Manipulated"
                    title="This item's RAP may be manipulated"
                    className="w-7 h-7"
                  />
                </div>
              )}
            </div>

            {/* Item Details */}
            <div className="flex-1 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <h1 className="text-2xl font-bold text-white">
                    {itemData?.name || 'Unknown Item'}
                  </h1>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-l uppercase tracking-wider font-semibold">UAID</span>
                  <div className="font-mono text-purple-300 text-m bg-slate-700/50 px-3 py-1.5 rounded-lg border border-purple-500/20">
                    {uaid}
                  </div>
                </div>
              </div>
              
              {/* Item Stats Grid */}
              <div className="grid grid-cols-2 px-4 gap-x-36 py-2 gap-y-12">
                <div>
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">ASSET ID</div>
                  <div className="font-mono text-white text-xl font-semibold">{mostRecentItem?.assetId?.toString() || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">SERIAL</div>
                  <div className={`font-semibold ${serialNumber ? 'text-orange-400 text-xl' : 'text-slate-500'}`}>
                    {serialNumber ? `#${serialNumber.toLocaleString()}` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">RAP</div>
                  <div className="text-green-400 text-xl font-semibold">{latestPrice?.rap?.toLocaleString() || 'N/A'} R$</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">BEST PRICE</div>
                  <div className="text-blue-400 text-xl font-semibold">{latestPrice?.price?.toLocaleString() || 'N/A'} R$</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Current Owner Card */}
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 px-6 py-6">
          <div className="flex items-top justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                {currentOwner ? (
                  <div className="w-2 h-3 bg-green-400 rounded-full animate-pulse"></div>
                ) : itemTraded ? (
                  <div className="w-2 h-3 bg-yellow-400 rounded-full"></div>
                ) : (
                  <div className="w-2 h-3 bg-slate-500 rounded-full"></div>
                )}
                <h2 className="text-sm uppercase tracking-wider text-slate-400 font-bold">Current Owner</h2>
              </div>

              {currentOwner ? (
                <>
                  <a
                    href={currentOwnerUserId ? `/player/${currentOwnerUserId}` : '#'}
                    className="text-4xl font-bold text-white hover:text-purple-300 transition-colors"
                  >
                    {currentOwner}
                  </a>
                  {isNewUntracked && (
                    <div className="mt-2 inline-flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs px-3 py-1.5 rounded-lg">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
                      </svg>
                      Not yet tracked — <a href={`/player/${currentOwnerUserId}`} className="underline hover:text-yellow-300">scan their profile</a> to add them
                    </div>
                  )}
                  <div className="inline-block bg-slate-700/30 px-4 py-2 rounded-lg mt-4">
                    <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">DAYS OWNED</div>
                    <div className="text-white text-lg font-semibold">
                      {Math.floor((new Date().getTime() - new Date(allOwnerships[0].scannedAt).getTime()) / (1000 * 60 * 60 * 24))}
                    </div>
                  </div>
                </>
              ) : itemTraded ? (
                <div>
                  <div className="text-2xl font-bold text-yellow-400 mb-2">Unknown Owner</div>
                  <div className="text-slate-400 text-sm max-w-sm">
                    This item is no longer in{' '}
                    <a href={`/player/${lastKnownOwnerId}`} className="text-purple-300 hover:underline">
                      {lastKnownOwnerUsername}
                    </a>
                    's inventory. It was likely traded or sold to someone not yet tracked.
                  </div>
                  <div className="mt-3 inline-block bg-slate-700/30 px-4 py-2 rounded-lg">
                    <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">LAST SEEN WITH</div>
                    <div className="text-white text-base font-semibold">{lastKnownOwnerUsername}</div>
                  </div>
                </div>
              ) : ownerCheckFailed ? (
                <div>
                  <div className="text-2xl font-bold text-slate-400 mb-2">{lastKnownOwnerUsername ?? 'Unknown'}</div>
                  <div className="text-slate-500 text-sm">Could not verify current ownership (inventory may be private).</div>
                </div>
              ) : (
                <span className="text-xl text-red-400 font-semibold">No owner found</span>
              )}
            </div>

            {currentOwnerAvatar && (
              <div className="w-40 h-40 bg-slate-700/50 rounded-lg overflow-hidden flex items-center justify-center">
                <img 
                  src={currentOwnerAvatar}
                  alt={`${currentOwner}'s avatar`}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        </div>

        {/* Ownership History Table */}
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-700">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Ownership History
            </h2>
            <p className="text-slate-400 text-sm mt-1">All tracked owners — most recent first</p>
          </div>
          
          {dedupedHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/30">
                  <tr className="border-b border-slate-700">
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">Owner</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">First Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {dedupedHistory.map((entry, i) => {
                    const userId = entry.snapshot?.user?.robloxUserId?.toString();
                    const username = entry.snapshot?.user?.username;
                    const avatarUrl = userId ? avatarMap.get(userId) : null;
                    const isCurrentTracked = i === 0 && ownerResult.found && !isNewUntracked;
                    
                    return (
                      <tr key={`${entry.snapshotId}-${i}`} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {avatarUrl ? (
                              <div className="w-12 h-12 bg-slate-700/50 rounded-lg overflow-hidden flex-shrink-0">
                                <img 
                                  src={avatarUrl} 
                                  alt={`${username}'s avatar`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                                {(username || "?")[0].toUpperCase()}
                              </div>
                            )}
                            <div>
                              <a
                                href={`/player/${userId}`}
                                className="font-semibold text-white hover:text-purple-300 transition-colors"
                              >
                                {username || "Unknown"}
                              </a>
                              {isCurrentTracked && (
                                <div className="text-xs text-green-400 mt-0.5">✓ Confirmed current owner</div>
                              )}
                              {i === 0 && itemTraded && (
                                <div className="text-xs text-yellow-400 mt-0.5">Last known owner</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-slate-400 text-sm">
                            <LocalTime date={entry.scannedAt.toISOString()} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <div className="w-12 h-12 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <span className="text-slate-500">No history found for this UAID</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}