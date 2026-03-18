// app/api/user/profile/[userid]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userid: string }> }
) {
  const { userid } = await params;

  try {
    const robloxUserId = BigInt(userid);

    // Fetch user and all snapshots in parallel — the snapshot list (summary
    // fields only) is needed for graphData regardless of whether the user exists.
    const [dbUser, allSnapshots] = await Promise.all([
      prisma.user.findUnique({
        where: { robloxUserId },
        include: {
          inventorySnapshots: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              items: {
                include: {
                  item: {
                    include: {
                      priceHistory: {
                        select: {
                          id: true,
                          itemId: true,
                          price: true,
                          rap: true,
                          salesVolume: true,
                          timestamp: true,
                        },
                        orderBy: { timestamp: 'desc' },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      // Only select the pre-computed summary columns — no items needed here.
      prisma.inventorySnapshot.findMany({
        where: { userId: robloxUserId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          createdAt: true,
          totalRAP: true,
          totalItems: true,
          uniqueItems: true,
        },
      }),
    ]);

    if (!dbUser) {
      return NextResponse.json(
        { error: 'User not found in database' },
        { status: 404 }
      );
    }

    // Get the latest snapshot
    const latestSnapshot = dbUser.inventorySnapshots[0];

    // Group inventory items by assetId and count them
    const inventoryMap = new Map<string, {
      assetId: string;
      name: string;
      imageUrl: string | null;
      rap: number;
      count: number;
      userAssetIds: string[];
      serialNumbers: (number | null)[];
    }>();

    latestSnapshot?.items.forEach(invItem => {
      const assetIdString = invItem.assetId.toString();

      if (!inventoryMap.has(assetIdString)) {
        const latestPrice = invItem.item?.priceHistory[0];

        inventoryMap.set(assetIdString, {
          assetId: assetIdString,
          name: invItem.item?.name || 'Unknown Item',
          imageUrl: invItem.item?.imageUrl || null,
          rap: latestPrice?.rap || 0,
          count: 0,
          userAssetIds: [],
          serialNumbers: [],
        });
      }

      const entry = inventoryMap.get(assetIdString)!;
      entry.count += 1;
      entry.userAssetIds.push(invItem.userAssetId.toString());
      entry.serialNumbers.push(invItem.serialNumber);
    });

    const inventory = Array.from(inventoryMap.values());

    // Use the pre-computed snapshot totals where available; fall back to
    // summing the latest inventory items so the stats are always correct.
    // Note: totalRAP/totalItems/uniqueItems may be null on older snapshots
    // that were created before these columns were added to the schema.
    const totalRAP = latestSnapshot?.totalRAP ?? inventory.reduce((sum, item) => sum + (item.rap * item.count), 0);
    const totalItems = latestSnapshot?.totalItems ?? inventory.reduce((sum, item) => sum + item.count, 0);
    const uniqueItems = latestSnapshot?.uniqueItems ?? inventory.length;

    // Build graphData from the lightweight summary snapshots — no item scan needed.
    const graphData = allSnapshots.map(snapshot => ({
      snapshotId: snapshot.id,
      date: snapshot.createdAt.toISOString(),
      rap: Number(snapshot.totalRAP ?? 0),
      itemCount: Number(snapshot.totalItems ?? 0),
      uniqueCount: Number(snapshot.uniqueItems ?? 0),
    }));

    return NextResponse.json({
      user: {
        robloxUserId: dbUser.robloxUserId.toString(),
        username: dbUser.username,
        displayName: dbUser.displayName,
        avatarUrl: dbUser.avatarUrl,
        description: dbUser.description,
      },
      inventory,
      stats: {
        totalRAP,
        totalItems,
        uniqueItems,
        lastScanned: latestSnapshot?.createdAt.toISOString() || null,
      },
      graphData,
    });

  } catch (error) {
    console.error('Error fetching player data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}