// app/api/items/[id]/owners/route.ts
import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemIdString } = await params;
    const assetIdBigInt = BigInt(itemIdString);

    // For each user, get only their latest snapshot, then check if they hold this item in it.
    // We group by userAssetId (UAID) — one row per copy, showing current holder.
    const owners = await prisma.$queryRaw<Array<{
      userAssetId: bigint;
      serialNumber: number | null;
      username: string;
      displayName: string | null;
      robloxUserId: bigint;
      avatarUrl: string | null;
      scannedAt: Date;
    }>>`
      WITH LatestSnapshots AS (
        SELECT DISTINCT ON ("userId")
          id,
          "userId",
          "createdAt"
        FROM "InventorySnapshot"
        ORDER BY "userId", "createdAt" DESC
      )
      SELECT
        ii."userAssetId",
        ii."serialNumber",
        u.username,
        u."displayName",
        u."robloxUserId",
        u."avatarUrl",
        ii."scannedAt"
      FROM "InventoryItem" ii
      INNER JOIN LatestSnapshots ls ON ii."snapshotId" = ls.id
      INNER JOIN "User" u ON ls."userId" = u."robloxUserId"
      WHERE ii."assetId" = ${assetIdBigInt}
      ORDER BY ii."serialNumber" ASC NULLS LAST, ii."userAssetId" ASC
    `;

    // Fetch avatars in bulk for any missing ones
    const missingAvatarUserIds = owners
      .filter(o => !o.avatarUrl)
      .map(o => o.robloxUserId.toString());

    let avatarMap = new Map<string, string>();
    if (missingAvatarUserIds.length > 0) {
      try {
        const res = await fetch(
          `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${missingAvatarUserIds.join(',')}&size=150x150&format=Png`
        );
        const data = await res.json();
        data.data?.forEach((a: any) => {
          avatarMap.set(a.targetId.toString(), a.imageUrl);
        });
      } catch { /* silently fail — avatars are cosmetic */ }
    }

    return NextResponse.json({
      owners: owners.map(o => ({
        userAssetId: o.userAssetId.toString(),
        serialNumber: o.serialNumber ?? null,
        username: o.username,
        displayName: o.displayName || o.username,
        robloxUserId: o.robloxUserId.toString(),
        avatarUrl: o.avatarUrl || avatarMap.get(o.robloxUserId.toString()) || null,
        scannedAt: o.scannedAt.toISOString(),
      })),
      total: owners.length,
    });
  } catch (error) {
    console.error('Owners fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch owners', details: String(error) },
      { status: 500 }
    );
  }
}