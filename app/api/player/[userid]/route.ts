// app/api/player/[userid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { saveInventorySnapshot } from '@/lib/inventoryTracker';

export const revalidate = 300; // Cache for 5 minutes

// ✅ Track ongoing scans to prevent duplicates
const ongoingScans = new Set<string>();

// ✅ Helper function to check if inventory is viewable
async function canViewInventory(robloxUserId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://inventory.roblox.com/v1/users/${robloxUserId}/can-view-inventory`
    );
    
    if (!response.ok) {
      console.warn(`canViewInventory returned ${response.status} for ${robloxUserId} — assuming public`);
      return true; // ✅ Don't punish users for Roblox API errors
    }
    
    const data = await response.json();
    // Only return false if Roblox explicitly says canView is false
    return data.canView !== false;
  } catch (error) {
    console.error('Error checking inventory visibility — assuming public:', error);
    return true; // ✅ Default to public on network errors
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userid: string }> }
) {
  try {
    const { userid } = await params;

    const user = await prisma.user.findUnique({
      where: {
        robloxUserId: BigInt(userid)
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const robloxUserIdString = user.robloxUserId.toString();

    // Fetch avatar from Roblox API (server-side)
    let avatarUrl: string | null = null;
    try {
      const avatarResponse = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${robloxUserIdString}&size=420x420&format=Png&isCircular=false`
      );
      if (avatarResponse.ok) {
        const avatarData = await avatarResponse.json();
        avatarUrl = avatarData.data?.[0]?.imageUrl || null;
      }
    } catch (error) {
      console.warn('Failed to fetch avatar:', error);
    }

    // ✅ CHECK IF SCAN IS ALREADY RUNNING
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
              avatarUrl: avatarUrl || user.avatarUrl,
              description: user.description
            },
            inventory: [],
            stats: {
              totalRAP: 0,
              totalItems: 0,
              uniqueItems: 0,
              lastScanned: null
            },
            graphData: [],
            isPrivate: true
          });
        }

        console.log(`📸 No snapshot exists for user ${user.username} - creating initial scan (BLOCKING)`);
        ongoingScans.add(robloxUserIdString);
        
        try {
          await saveInventorySnapshot(robloxUserIdString, robloxUserIdString);
          console.log(`✅ Initial snapshot created successfully`);
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
        const now = new Date();
        const snapshotAge = now.getTime() - latestSnapshotCheck.createdAt.getTime();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (snapshotAge > fiveMinutes) {
          console.log(`🔄 Triggering background rescan for ${user.username}...`);
          ongoingScans.add(robloxUserIdString);
          
          saveInventorySnapshot(robloxUserIdString, robloxUserIdString)
            .then(snapshot => {
              console.log(`✅ Background scan completed - Snapshot ID: ${snapshot.id}`);
            })
            .catch(err => {
              console.error('❌ Background scan failed:', err);
            })
            .finally(() => {
              ongoingScans.delete(robloxUserIdString);
            });
        } else {
          console.log(`⏭️ Skipping scan for ${user.username} (last scan was ${Math.round(snapshotAge / 1000)}s ago)`);
        }
      }
    }

    // Get latest snapshot inventory
    const inventoryData = await prisma.$queryRaw<Array<{
      assetId: bigint;
      userAssetId: bigint;
      name: string;
      imageUrl: string | null;
      manipulated: boolean;
      rap: number | null;
      itemCount: number;
      serialNumbers: (number | null)[];
      userAssetIds: bigint[];
      scannedAt: Date;
    }>>`
      WITH LatestSnapshot AS (
        SELECT id, "createdAt"
        FROM "InventorySnapshot"
        WHERE "userId" = ${user.robloxUserId}
        ORDER BY "createdAt" DESC
        LIMIT 1
      ),
      InventoryWithPrices AS (
        SELECT 
          ii."assetId",
          ii."userAssetId",
          ii."serialNumber",
          ii."scannedAt",
          i.name,
          i."imageUrl",
          i.manipulated,
          ph.rap,
          ARRAY_AGG(ii."userAssetId") OVER (PARTITION BY ii."assetId") as user_asset_ids,
          ARRAY_AGG(ii."serialNumber") OVER (PARTITION BY ii."assetId") as serial_numbers,
          ARRAY_AGG(ii."scannedAt") OVER (PARTITION BY ii."assetId") as scanned_at_array,
          COUNT(*) OVER (PARTITION BY ii."assetId") as item_count
        FROM "InventoryItem" ii
        INNER JOIN LatestSnapshot ls ON ii."snapshotId" = ls.id
        LEFT JOIN "Item" i ON ii."assetId" = i."assetId"
        LEFT JOIN LATERAL (
          SELECT rap
          FROM "PriceHistory"
          WHERE "itemId" = i."assetId"
          ORDER BY timestamp DESC
          LIMIT 1
        ) ph ON true
      )
      SELECT DISTINCT ON ("assetId")
        "assetId",
        "userAssetId",
        COALESCE(name, 'Unknown Item') as name,
        "imageUrl",
        COALESCE(manipulated, false) as manipulated,
        COALESCE(rap, 0) as rap,
        item_count::int as "itemCount",
        serial_numbers as "serialNumbers",
        user_asset_ids as "userAssetIds",
        (scanned_at_array[1]) as "scannedAt"
      FROM InventoryWithPrices
      ORDER BY "assetId", rap DESC NULLS LAST
    `;

    // Get graph data directly from stored snapshot values
    const graphData = await prisma.$queryRaw<Array<{
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
    `;

    // Calculate totals
    const totalRAP = inventoryData.reduce((sum, item) => sum + ((item.rap || 0) * item.itemCount), 0);
    const totalItems = inventoryData.reduce((sum, item) => sum + item.itemCount, 0);

    const latestSnapshot = graphData.length > 0
      ? graphData[graphData.length - 1]
      : null;

    // Deduplicate: keep only the latest snapshot per calendar day
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
        avatarUrl: avatarUrl || user.avatarUrl,
        description: user.description
      },
      inventory: inventoryData.map(item => ({
        assetId: item.assetId.toString(),
        name: item.name,
        imageUrl: item.imageUrl,
        manipulated: item.manipulated ?? false,
        rap: item.rap || 0,
        count: item.itemCount,
        userAssetIds: item.userAssetIds.map(id => id.toString()),
        serialNumbers: item.serialNumbers,
        scannedAt: item.scannedAt
      })),
      stats: {
        totalRAP,
        totalItems,
        uniqueItems: inventoryData.length,
        lastScanned: latestSnapshot?.createdAt
      },
      graphData: dedupedGraphData,
      isPrivate: false
    });

  } catch (error) {
    console.error('Player inventory error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inventory', details: String(error) },
      { status: 500 }
    );
  }
}