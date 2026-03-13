// app/api/player/[userid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { saveInventorySnapshot } from '@/lib/inventoryTracker';

export const dynamic = 'force-dynamic';

const ongoingScans = new Set<string>();

async function canViewInventory(robloxUserId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://inventory.roblox.com/v1/users/${robloxUserId}/can-view-inventory`
    );
    if (!response.ok) return true;
    const data = await response.json();
    return data.canView !== false;
  } catch {
    return true;
  }
}

async function getRank(robloxUserId: bigint) {
  try {
    const result = await prisma.$queryRaw<Array<{
      rap_rank: bigint;
      items_rank: bigint;
      unique_rank: bigint;
      rap: number | null;
    }>>`
      WITH latest_snaps AS (
        SELECT DISTINCT ON ("userId")
          "userId",
          "totalRAP",
          "totalItems",
          "uniqueItems"
        FROM "InventorySnapshot"
        WHERE "totalRAP" IS NOT NULL
        ORDER BY "userId", "createdAt" DESC
      ),
      target AS (
        SELECT "totalRAP", "totalItems", "uniqueItems"
        FROM latest_snaps
        WHERE "userId" = ${robloxUserId}
      )
      SELECT
        (SELECT COUNT(*) FROM latest_snaps, target WHERE latest_snaps."totalRAP"    > target."totalRAP")    + 1 AS rap_rank,
        (SELECT COUNT(*) FROM latest_snaps, target WHERE latest_snaps."totalItems"  > target."totalItems")  + 1 AS items_rank,
        (SELECT COUNT(*) FROM latest_snaps, target WHERE latest_snaps."uniqueItems" > target."uniqueItems") + 1 AS unique_rank,
        (SELECT "totalRAP" FROM target) AS rap
    `;
    const row = result[0];
    if (!row || row.rap === null) return { rapRank: null, itemsRank: null, uniqueRank: null };
    return {
      rapRank: Number(row.rap_rank),
      itemsRank: Number(row.items_rank),
      uniqueRank: Number(row.unique_rank),
    };
  } catch {
    return { rapRank: null, itemsRank: null, uniqueRank: null };
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userid: string }> }
) {
  try {
    const { userid } = await params;

    const user = await prisma.user.findUnique({
      where: { robloxUserId: BigInt(userid) }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const robloxUserIdString = user.robloxUserId.toString();

    console.log(`🔍 ongoingScans has ${robloxUserIdString}: ${ongoingScans.has(robloxUserIdString)}`);
    if (ongoingScans.has(robloxUserIdString)) {
      console.log(`⏳ Scan already in progress for ${user.username}, skipping...`);
    } else {
      const latestSnapshotCheck = await prisma.inventorySnapshot.findFirst({
        where: { userId: user.robloxUserId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      });

      if (!latestSnapshotCheck) {
        const canView = await canViewInventory(robloxUserIdString);

        if (!canView) {
          return NextResponse.json({
            user: {
              robloxUserId: robloxUserIdString,
              username: user.username,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
              description: user.description,
              role: user.role ?? 'user',
            },
            inventory: [],
            stats: { totalRAP: 0, totalItems: 0, uniqueItems: 0, lastScanned: null },
            graphData: [],
            ranks: { rapRank: null, itemsRank: null, uniqueRank: null },
            isPrivate: true
          });
        }

        const raceCheck = await prisma.inventorySnapshot.findFirst({
          where: { userId: user.robloxUserId },
          select: { id: true }
        });

        if (!raceCheck) {
          console.log(`📸 No snapshot for ${user.username} — creating initial scan (BLOCKING)`);
          ongoingScans.add(robloxUserIdString);
          try {
            await saveInventorySnapshot(robloxUserIdString, robloxUserIdString);
            console.log(`✅ Initial snapshot created`);
          } catch (err) {
            console.error('❌ Initial scan failed:', err);
            return NextResponse.json({
              error: 'Failed to create initial inventory snapshot',
              details: String(err)
            }, { status: 500 });
          } finally {
            ongoingScans.delete(robloxUserIdString);
          }
        } else {
          console.log(`⏭️ Snapshot already created by concurrent request, skipping...`);
        }
      } else {
        const snapshotAge = Date.now() - latestSnapshotCheck.createdAt.getTime();
        const fiveMinutes = 5 * 60 * 1000;

        if (snapshotAge > fiveMinutes) {
          console.log(`🔄 Triggering background rescan for ${user.username}...`);
          ongoingScans.add(robloxUserIdString);
          saveInventorySnapshot(robloxUserIdString, robloxUserIdString)
            .then(snapshot => console.log(`✅ Background scan done — Snapshot ID: ${snapshot.id}`))
            .catch(err => console.error('❌ Background scan failed:', err))
            .finally(() => ongoingScans.delete(robloxUserIdString));
        } else {
          console.log(`⏭️ Skipping scan for ${user.username} (${Math.round(snapshotAge / 1000)}s old)`);
        }
      }
    }

    const [inventoryData, graphData, avatarResult, rankRes] = await Promise.all([
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
        uaidCreatedAts: (Date | null)[];
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
            ARRAY_AGG(ii."uaidCreatedAt" ORDER BY ii."scannedAt" ASC) as uaid_created_ats,
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
          a.uaid_created_ats as "uaidCreatedAts",
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
      prisma.$queryRaw<Array<{
        snapshotId: string;
        createdAt: Date;
        totalRap: number;
        itemCount: number;
        uniqueCount: number;
      }>>`
        SELECT
          id as "snapshotId",
          "createdAt",
          "totalRAP" as "totalRap",
          "totalItems" as "itemCount",
          "uniqueItems" as "uniqueCount"
        FROM "InventorySnapshot"
        WHERE "userId" = ${user.robloxUserId}
        ORDER BY "createdAt" ASC
        LIMIT 30
      `,
      fetch(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${robloxUserIdString}&size=420x420&format=Png&isCircular=false`
      ).then(r => r.ok ? r.json() : null).catch(() => null),
      getRank(user.robloxUserId),
    ]);

    const avatarUrl = avatarResult?.data?.[0]?.imageUrl || user.avatarUrl;
    const totalRAP = inventoryData.reduce((sum, item) => sum + (Number(item.rap) || 0) * Number(item.itemCount), 0);
    const totalItems = inventoryData.reduce((sum, item) => sum + Number(item.itemCount), 0);
    const latestSnapshot = graphData.length > 0 ? graphData[graphData.length - 1] : null;

    const dedupedGraphData = (() => {
      const byDay = new Map<string, typeof graphData[0]>();
      for (const snap of graphData) {
        const day = new Date(snap.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'America/New_York',
        });
        byDay.set(day, snap);
      }
      return Array.from(byDay.entries()).map(([day, snap]) => ({
        snapshotId: snap.snapshotId,
        date: day,
        timestamp: new Date(snap.createdAt).getTime(),
        rap: Number(snap.totalRap),
        itemCount: Number(snap.itemCount),
        uniqueCount: Number(snap.uniqueCount),
      }));
    })();

    return NextResponse.json({
      user: {
        robloxUserId: robloxUserIdString,
        username: user.username,
        displayName: user.displayName,
        avatarUrl,
        description: user.description,
        role: user.role ?? 'user',
      },
      inventory: inventoryData.map(item => ({
        assetId: item.assetId.toString(),
        name: item.name,
        imageUrl: item.imageUrl,
        manipulated: item.manipulated ?? false,
        isOnHold: item.isOnHold ?? null,
        isLimitedUnique: item.isLimitedUnique ?? null,
        rap: Number(item.rap) || 0,
        count: Number(item.itemCount),
        userAssetIds: item.userAssetIds.map(id => id.toString()),
        serialNumbers: item.serialNumbers,
        scannedAt: item.scannedAts?.[0] ?? null,
        scannedAts: item.scannedAts,
        uaidCreatedAts: item.uaidCreatedAts ?? [],
        uaidUpdatedAts: item.uaidUpdatedAts ?? [],
      })),
      stats: {
        totalRAP,
        totalItems,
        uniqueItems: inventoryData.length,
        lastScanned: latestSnapshot?.createdAt ?? null,
      },
      graphData: dedupedGraphData,
      ranks: {
        rapRank: rankRes?.rapRank ?? null,
        itemsRank: rankRes?.itemsRank ?? null,
        uniqueRank: rankRes?.uniqueRank ?? null,
      },
      isPrivate: false,
    });

  } catch (error) {
    console.error('Player inventory error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inventory', details: String(error) },
      { status: 500 }
    );
  }
}