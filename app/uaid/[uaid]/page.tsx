//app/uaid/[uaid]/page.tsx
import prisma from "@/lib/prisma";
import React from "react";
import { LocalTime } from "@/components/LocalTime";
import { getSerialTier, getGhostTier, getCardGlowClass } from '@/lib/specialSerial';
import { SpecialSerialText } from '@/components/specialSerialText';
import { timeSince } from '@/lib/timeSince';

interface UAIDPageProps {
  params: Promise<{ uaid: string }>;
}

async function checkUserStillOwnsUAID(userId: string, userAssetId: string): Promise<boolean> {
  let cursor: string | null = null;
  let url = "";
  let res: Response;
  let data: any;

  do {
    url = cursor
      ? `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100&cursor=${cursor}`
      : `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100`;

    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });

    if (!res.ok) return false;

    data = await res.json();
    const items: any[] = data.data ?? [];

    if (items.some((item: any) => item.userAssetId?.toString() === userAssetId)) {
      return true;
    }

    cursor = data.nextPageCursor ?? null;
  } while (cursor);

  return false;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return 'Unknown';
  return new Date(date).toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}


export default async function UAIDPage({ params }: UAIDPageProps) {
  const { uaid } = await params;

  const uaidBigInt = BigInt(uaid);

  const mostRecentItem = await prisma.inventoryItem.findFirst({
    where: { userAssetId: uaidBigInt },
    orderBy: { scannedAt: "desc" },
    include: {
      snapshot: { include: { user: true } },
      item: {
        include: {
          priceHistory: {
            orderBy: { timestamp: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!mostRecentItem) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-24 px-4 pb-20">
        <div className="max-w-2xl w-full">
          <div className="bg-[#111] rounded-xl border border-white/10 p-8">
            <h1 className="text-3xl font-bold text-white mb-4">UAID Not Found</h1>
            <p className="text-slate-400">
              No items found for UAID:{" "}
              <span className="text-purple-300 font-mono">{uaid}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const allOwnerships = await prisma.inventoryItem.findMany({
    where: { userAssetId: uaidBigInt },
    orderBy: { scannedAt: "desc" },
    distinct: ["snapshotId"],
    include: {
      snapshot: { include: { user: true } },
    },
  });

  const dedupedHistory: typeof allOwnerships = [];
  for (const entry of allOwnerships) {
    const lastEntry = dedupedHistory[dedupedHistory.length - 1];
    const sameOwner =
      lastEntry?.snapshot?.user?.robloxUserId?.toString() ===
      entry.snapshot?.user?.robloxUserId?.toString();
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

  const uaidCreatedAt = mostRecentItem.uaidCreatedAt;
  const uaidUpdatedAt = mostRecentItem.uaidUpdatedAt;

  const serialTier = getGhostTier(itemData?.isLimitedUnique, serialNumber) ?? getSerialTier(serialNumber);

  let ownerStillHasIt = false;
  if (lastKnownOwnerId) {
    ownerStillHasIt = await checkUserStillOwnsUAID(lastKnownOwnerId, uaid);
  }

  const itemTraded = !ownerStillHasIt && lastKnownOwnerId !== null;
  const currentOwner = ownerStillHasIt ? lastKnownOwnerUsername : null;
  const currentOwnerUserId = ownerStillHasIt ? lastKnownOwnerId : null;

  let currentOwnerAvatar: string | null = null;
  const avatarUserId = currentOwnerUserId ?? lastKnownOwnerId;
  if (avatarUserId) {
    try {
      const avatarResponse = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${avatarUserId}&size=420x420&format=Png&isCircular=false`,
        { cache: "no-store" }
      );
      const avatarData = await avatarResponse.json();
      currentOwnerAvatar = avatarData.data?.[0]?.imageUrl ?? null;
    } catch {}
  }

  const historyUserIds = [
    ...new Set(
      dedupedHistory
        .map((i) => i.snapshot?.user?.robloxUserId?.toString())
        .filter(Boolean)
    ),
  ];
  const avatarMap = new Map<string, string>();

  if (historyUserIds.length > 0) {
    try {
      const avatarResponse = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${historyUserIds.join(",")}&size=150x150&format=Png&isCircular=false`,
        { cache: "no-store" }
      );
      const avatarData = await avatarResponse.json();
      avatarData.data?.forEach((avatar: any) => {
        avatarMap.set(avatar.targetId.toString(), avatar.imageUrl);
      });
    } catch {}
  }

  const awaitingScan = !uaidCreatedAt && !uaidUpdatedAt;

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-24 px-4 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header Card */}
        <div className="bg-[#111] rounded-xl border border-white/10 p-[26px]">
          <div className="flex items-start gap-6">
            <div className="relative w-48 h-48 bg-white/5 rounded-lg overflow-hidden flex-shrink-0">
              {itemData?.imageUrl ? (
                <img
                  src={itemData.imageUrl}
                  alt={itemData.name || "Item"}
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

            <div className="flex-1 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <h1 className="text-2xl font-bold text-white">
                    {itemData?.name || "Unknown Item"}
                  </h1>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-l uppercase tracking-wider font-semibold">UAID</span>
                  <div className="font-mono text-purple-300 text-m bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                    {uaid}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 px-4 gap-x-12 py-2 gap-y-4">
                <div>
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">ASSET ID</div>
                  <div className="font-mono text-white text-xl font-semibold">
                    {mostRecentItem?.assetId?.toString() || "N/A"}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">SERIAL</div>
                  <div className="font-semibold text-xl">
                    {(() => {
                      if (serialTier) {
                        return (
                          <SpecialSerialText
                            serial={serialNumber}
                            tier={serialTier}
                            variant="stat"
                          />
                        );
                      }
                      if (serialNumber != null) {
                        return (
                          <span className="text-orange-400">
                            #{serialNumber.toLocaleString()}
                          </span>
                        );
                      }
                      return <span className="text-slate-500">—</span>;
                    })()}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">RAP</div>
                  <div className="text-green-400 text-xl font-semibold">
                    {latestPrice?.rap?.toLocaleString() || "N/A"} R$
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">BEST PRICE</div>
                  <div className="text-blue-400 text-xl font-semibold">
                    {latestPrice?.price?.toLocaleString() || "N/A"} R$
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">ACQUIRED AT</div>
                  {uaidUpdatedAt ? (
                    <div>
                      <div className="text-white text-sm font-semibold">{timeSince(uaidUpdatedAt)}</div>
                      <div className="text-slate-500 text-xs mt-0.5">{formatDate(uaidUpdatedAt)}</div>
                    </div>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </div>

                <div>
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">CREATED AT</div>
                  {uaidCreatedAt ? (
                    <div>
                      <div className="text-white text-sm font-semibold">{timeSince(uaidCreatedAt)}</div>
                      <div className="text-slate-500 text-xs mt-0.5">{formatDate(uaidCreatedAt)}</div>
                    </div>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Current Owner Card */}
        <div className="bg-[#111] rounded-xl border border-white/10 px-6 py-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                {ownerStillHasIt && !awaitingScan ? (
                  <div className="w-2 h-3 bg-green-400 rounded-full animate-pulse"></div>
                ) : ownerStillHasIt && awaitingScan ? (
                  <div className="w-2 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
                ) : itemTraded ? (
                  <div className="w-2 h-3 bg-yellow-400 rounded-full"></div>
                ) : !lastKnownOwnerId ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <span className="text-yellow-400 text-xs font-medium">Awaiting Scan</span>
                  </div>
                ) : (
                  <div className="w-2 h-2 bg-slate-500 rounded-full"></div>
                )}
                <h2 className="text-sm uppercase tracking-wider text-slate-400 font-bold">{ownerStillHasIt && awaitingScan ? "Verifying..." : "Current Owner"}</h2>
              </div>

              {ownerStillHasIt ? (
                <>
                  <div className="flex flex-col items-start gap-3">
                    <a
                      href={`/player/${currentOwnerUserId}`}
                      className="text-4xl font-bold text-white hover:text-purple-300 transition-colors"
                    >
                      {currentOwner}
                    </a>
                    {awaitingScan ? (
                      <div className="inline-block bg-yellow-500/10 border border-yellow-500/20 px-4 py-2 rounded-lg">
                        <div className="text-yellow-400 text-xs uppercase tracking-wider mb-1">STATUS</div>
                        <div className="text-yellow-400 text-lg font-semibold">Pending</div>
                      </div>
                    ) : (
                      <div className="inline-block bg-white/5 px-4 py-2 rounded-lg">
                        <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">DAYS OWNED</div>
                        <div className="text-white text-lg font-semibold">
                          {Math.floor(
                            (new Date().getTime() - new Date(allOwnerships[0].scannedAt).getTime()) /
                              (1000 * 60 * 60 * 24)
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : itemTraded ? (
                <div>
                  <div className="text-2xl font-bold text-yellow-400 mb-2">Unknown Owner</div>
                  <div className="text-slate-400 text-sm max-w-sm">
                    This item is no longer in{" "}
                    <a href={`/player/${lastKnownOwnerId}`} className="text-purple-300 hover:underline">
                      {lastKnownOwnerUsername}
                    </a>
                    's inventory. It was likely traded or sold to someone not yet tracked.
                  </div>
                  <div className="mt-3 inline-block bg-white/5 px-4 py-2 rounded-lg">
                    <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">LAST SEEN WITH</div>
                    <div className="text-white text-base font-semibold">{lastKnownOwnerUsername}</div>
                  </div>
                </div>
              ) : (
                <span className="text-xl text-red-400 font-semibold">No owner found</span>
              )}
            </div>

            {currentOwnerAvatar && (
              <div className="w-40 h-40 bg-white/5 rounded-lg overflow-hidden flex items-center justify-center">
                <img
                  src={currentOwnerAvatar}
                  alt={`${currentOwner ?? lastKnownOwnerUsername}'s avatar`}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        </div>

        {/* Ownership History Table */}
        <div className="bg-[#111] rounded-xl border border-white/10 overflow-hidden">
          <div className="px-6 py-5 border-b border-white/10">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <img src="/Images/hold.png" alt="" className="w-5 h-5" style={{ filter: 'invert(58%) sepia(60%) saturate(500%) hue-rotate(230deg) brightness(110%)' }} />
              Ownership History
            </h2>
            <p className="text-slate-400 text-sm mt-1">All tracked owners — most recent first</p>
          </div>

          {dedupedHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr className="border-b border-white/10">
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">Owner</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">Acquired At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {dedupedHistory.map((entry, i) => {
                    const userId = entry.snapshot?.user?.robloxUserId?.toString();
                    const username = entry.snapshot?.user?.username;
                    const avatarUrl = userId ? avatarMap.get(userId) : null;
                    const isCurrentTracked = i === 0 && ownerStillHasIt;

                    // Hide current owner from history table while still verifying
                    if (isCurrentTracked && awaitingScan) return null;

                    return (
                      <tr key={`${entry.snapshotId}-${i}`} className="hover:bg-white/5/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {avatarUrl ? (
                              <div className="w-12 h-12 bg-white/5 rounded-lg overflow-hidden flex-shrink-0">
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
                              {isCurrentTracked && !awaitingScan && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <img src="/Images/verify.png" alt="" className="w-3 h-3" style={{ filter: 'brightness(0.3) sepia(1) saturate(10) hue-rotate(90deg)' }} />
                                  <span className="text-xs text-green-400">Current owner</span>
                                </div>
                              )}
                              {i === 0 && itemTraded && (
                                <div className="text-xs text-yellow-400 mt-0.5">Last known owner</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {entry.uaidUpdatedAt ? (
                            <div>
                              <div className="text-white text-sm font-medium">{timeSince(entry.uaidUpdatedAt)}</div>
                              <div className="text-slate-500 text-xs mt-0.5">{formatDate(entry.uaidUpdatedAt)}</div>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-sm">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
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