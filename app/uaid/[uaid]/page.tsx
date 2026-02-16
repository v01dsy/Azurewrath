//app/uaid/[uaid]/page.tsx
import prisma from "@/lib/prisma";
import React from "react";
import { LocalTime } from "@/components/LocalTime";

interface UAIDPageProps {
  params: Promise<{ uaid: string }>;
}

export default async function UAIDPage({ params }: UAIDPageProps) {
  const { uaid } = await params;
  
  // First, find the most recent snapshot that contains this UAID
  const mostRecentItem = await prisma.inventoryItem.findFirst({
    where: { 
      userAssetId: uaid
    },
    orderBy: { scannedAt: "desc" },
    include: {
      snapshot: true,
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
            <h1 className="text-3xl font-bold text-white mb-4">
              UAID Not Found
            </h1>
            <p className="text-slate-400">No items found for UAID: <span className="text-purple-300 font-mono">{uaid}</span></p>
          </div>
        </div>
      </div>
    );
  }

  // Now fetch all items from that specific snapshot with this UAID
  const items = await prisma.inventoryItem.findMany({
    where: { 
      userAssetId: uaid,
      snapshotId: mostRecentItem.snapshotId,
    },
    orderBy: { scannedAt: "desc" },
    include: {
      snapshot: {
        include: {
          user: true,
        },
      },
      item: true,
    },
  });

  const current = items[0];
  const currentOwner = current?.snapshot?.user?.username || null;
  const currentOwnerUserId = current?.snapshot?.user?.robloxUserId || null;
  const itemData = mostRecentItem.item;
  const latestPrice = itemData?.priceHistory?.[0];
  const serialNumber = (current as any)?.serialNumber;

  // Fetch current owner's avatar
  let currentOwnerAvatar = null;
  if (currentOwnerUserId) {
    const avatarResponse = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${currentOwnerUserId}&size=420x420&format=Png&isCircular=false`
    );
    const avatarData = await avatarResponse.json();
    currentOwnerAvatar = avatarData.data?.[0]?.imageUrl;
  }

  // Fetch avatars for all users in the history
  const userIds = [...new Set(items.map(item => item.snapshot?.user?.robloxUserId).filter(Boolean))];
  let avatarMap = new Map();
  
  if (userIds.length > 0) {
    const avatarResponse = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userIds.join(',')}&size=150x150&format=Png&isCircular=false`
    );
    const avatarData = await avatarResponse.json();
    avatarData.data?.forEach((avatar: any) => {
      avatarMap.set(avatar.targetId.toString(), avatar.imageUrl);
    });
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Card - Item Info */}
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6">
          <div className="flex items-start gap-6">
            {/* Item Thumbnail */}
            <div className="w-40 h-40 bg-slate-700/50 rounded-lg overflow-hidden flex-shrink-0">
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
            </div>

            {/* Item Details */}
            <div className="flex-1 flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold text-white mb-12">
                  {itemData?.name || 'Unknown Item'}
                </h1>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-l uppercase tracking-wider font-semibold">UAID</span>
                  <div className="font-mono text-purple-300 text-m bg-slate-700/50 px-3 py-1.5 rounded-lg border border-purple-500/20">
                    {uaid}
                  </div>
                </div>
              </div>
              
            {/* Item Stats - 2x2 GRID TO THE RIGHT */}
              <div className="grid grid-cols-2 px-4 gap-x-36 py-2 gap-y-12">
                <div>
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">ASSET ID</div>
                  <div className="font-mono text-white text-xl font-semibold">{current?.assetId || 'N/A'}</div>
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
                <div className="w-2 h-3 bg-green-400 rounded-full animate-pulse"></div>
                <h2 className="text-sm uppercase tracking-wider text-slate-400 font-bold">Current Owner</h2>
              </div>
              {currentOwner ? (
                <>
                  <div className="text-4xl font-bold text-white mb-4">
                    {currentOwner}
                  </div>
                  <div className="inline-block bg-slate-700/30 px-4 py-2 rounded-lg">
                    <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">DAYS OWNED</div>
                    <div className="text-white text-lg font-semibold">
                      {Math.floor((new Date().getTime() - new Date(current.scannedAt).getTime()) / (1000 * 60 * 60 * 24))}
                    </div>
                  </div>
                </>
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
            <p className="text-slate-400 text-sm mt-1">From most recent snapshot</p>
          </div>
          
          {items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/30">
                  <tr className="border-b border-slate-700">
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">
                      Owner
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-purple-400 uppercase tracking-wider">
                      Scanned At
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {items.map((item) => {
                    const userId = item.snapshot?.user?.robloxUserId;
                    const avatarUrl = userId ? avatarMap.get(userId.toString()) : null;
                    
                    return (
                      <tr 
                        key={item.assetId} 
                        className="hover:bg-slate-700/20 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {avatarUrl ? (
                              <div className="w-12 h-12 bg-slate-700/50 rounded-lg overflow-hidden flex-shrink-0">
                                <img 
                                  src={avatarUrl} 
                                  alt={`${item.snapshot?.user?.username}'s avatar`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                                {(item.snapshot?.user?.username || "?")[0].toUpperCase()}
                              </div>
                            )}
                            <span className="font-semibold text-white">
                              {item.snapshot?.user?.username || "Unknown"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-slate-400 text-sm">
                            <LocalTime date={item.scannedAt.toISOString()} />
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