import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const revalidate = 300; // Cache for 5 minutes

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userid: string }> }
) {
  try {
    const { userid } = await params;

    // Find user (try robloxUserId first, then id)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { robloxUserId: userid },
          { id: userid }
        ]
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get latest snapshot with OPTIMIZED RAW SQL - calculates everything in database!
    const inventoryData = await prisma.$queryRaw<Array<{
      assetId: string;
      userAssetId: string;
      name: string;
      imageUrl: string | null;
      rap: number | null;
      itemCount: number;
      serialNumbers: (number | null)[];
      userAssetIds: string[];
    }>>`
      WITH LatestSnapshot AS (
        SELECT id, "createdAt"
        FROM "InventorySnapshot"
        WHERE "userId" = ${user.id}
        ORDER BY "createdAt" DESC
        LIMIT 1
      ),
      InventoryWithPrices AS (
        SELECT 
          ii."assetId",
          ii."userAssetId",
          i.name,
          i."imageUrl",
          ph.rap,
          -- Aggregate serial numbers and userAssetIds per assetId
          ARRAY_AGG(ii."userAssetId") OVER (PARTITION BY ii."assetId") as user_asset_ids,
          COUNT(*) OVER (PARTITION BY ii."assetId") as item_count
        FROM "InventoryItem" ii
        INNER JOIN LatestSnapshot ls ON ii."snapshotId" = ls.id
        LEFT JOIN "Item" i ON ii."assetId" = i."assetId"
        LEFT JOIN LATERAL (
          SELECT rap
          FROM "PriceHistory"
          WHERE "itemId" = i.id
          ORDER BY timestamp DESC
          LIMIT 1
        ) ph ON true
      )
      SELECT DISTINCT ON ("assetId")
        "assetId",
        "userAssetId",
        COALESCE(name, 'Unknown Item') as name,
        "imageUrl",
        COALESCE(rap, 0) as rap,
        item_count::int as "itemCount",
        ARRAY[]::int[] as "serialNumbers",  -- Placeholder for serial numbers
        user_asset_ids as "userAssetIds"
      FROM InventoryWithPrices
      ORDER BY "assetId", rap DESC NULLS LAST
    `;

    // Get graph data - last 30 snapshots with RAP calculations in SQL
    const graphData = await prisma.$queryRaw<Array<{
      snapshotId: string;
      createdAt: Date;
      totalRap: number;
      itemCount: number;
      uniqueCount: number;
    }>>`
      WITH RecentSnapshots AS (
        SELECT id, "createdAt"
        FROM "InventorySnapshot"
        WHERE "userId" = ${user.id}
        ORDER BY "createdAt" DESC
        LIMIT 30
      )
      SELECT 
        rs.id as "snapshotId",
        rs."createdAt",
        COALESCE(SUM(ph.rap), 0) as "totalRap",
        COUNT(ii.id)::int as "itemCount",
        COUNT(DISTINCT ii."assetId")::int as "uniqueCount"
      FROM RecentSnapshots rs
      LEFT JOIN "InventoryItem" ii ON ii."snapshotId" = rs.id
      LEFT JOIN "Item" i ON ii."assetId" = i."assetId"
      LEFT JOIN LATERAL (
        SELECT rap
        FROM "PriceHistory"
        WHERE "itemId" = i.id
        ORDER BY timestamp DESC
        LIMIT 1
      ) ph ON true
      GROUP BY rs.id, rs."createdAt"
      ORDER BY rs."createdAt" ASC
    `;

    // Calculate totals from already-fetched data (no extra queries!)
    const totalRAP = inventoryData.reduce((sum, item) => sum + ((item.rap || 0) * item.itemCount), 0);
    const totalItems = inventoryData.reduce((sum, item) => sum + item.itemCount, 0);

    // Get latest snapshot timestamp from graph data (already fetched!)
    const latestSnapshot = graphData.length > 0 
      ? graphData[graphData.length - 1] 
      : null;

    // Fetch avatar from Roblox API (server-side)
    let avatarUrl: string | null = null;
    try {
      const avatarResponse = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.robloxUserId}&size=420x420&format=Png&isCircular=false`
      );
      if (avatarResponse.ok) {
        const avatarData = await avatarResponse.json();
        avatarUrl = avatarData.data?.[0]?.imageUrl || null;
      }
    } catch (error) {
      console.warn('Failed to fetch avatar:', error);
      // Continue without avatar
    }

    return NextResponse.json({
      user: {
        id: user.id,
        robloxUserId: user.robloxUserId,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: avatarUrl || user.avatarUrl, // Use fetched or stored avatar
        description: user.description
      },
      inventory: inventoryData.map(item => ({
        assetId: item.assetId,
        name: item.name,
        imageUrl: item.imageUrl,
        rap: item.rap || 0,
        count: item.itemCount,
        userAssetIds: item.userAssetIds,
        serialNumbers: item.serialNumbers
      })),
      stats: {
        totalRAP,
        totalItems,
        uniqueItems: inventoryData.length,
        lastScanned: latestSnapshot?.createdAt
      },
      graphData: graphData.map(snap => ({
        snapshotId: snap.snapshotId,
        date: new Date(snap.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        rap: snap.totalRap,
        itemCount: snap.itemCount,
        uniqueCount: snap.uniqueCount
      }))
    });

  } catch (error) {
    console.error('Player inventory error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inventory', details: String(error) },
      { status: 500 }
    );
  }
}