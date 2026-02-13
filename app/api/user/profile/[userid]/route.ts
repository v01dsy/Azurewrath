// app/api/user/profile/[userid]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userid: string }> }
) {
  const { userid } = await params;

  try {
    // Fetch user with latest snapshot
    const dbUser = await prisma.user.findUnique({
      where: { robloxUserId: userid },
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
    });

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
      const assetId = invItem.assetId;
      
      if (!inventoryMap.has(assetId)) {
        const latestPrice = invItem.item?.priceHistory[0];
        
        inventoryMap.set(assetId, {
          assetId: assetId,
          name: invItem.item?.name || 'Unknown Item',
          imageUrl: invItem.item?.imageUrl || null,
          rap: latestPrice?.rap || 0,
          count: 0,
          userAssetIds: [],
          serialNumbers: [],
        });
      }

      const entry = inventoryMap.get(assetId)!;
      entry.count += 1;
      entry.userAssetIds.push(invItem.userAssetId);
      entry.serialNumbers.push(invItem.serialNumber);
    });

    const inventory = Array.from(inventoryMap.values());

    // Calculate stats
    const totalRAP = inventory.reduce((sum, item) => sum + (item.rap * item.count), 0);
    const totalItems = inventory.reduce((sum, item) => sum + item.count, 0);
    const uniqueItems = inventory.length;

    // Fetch all snapshots with items for graph data
    const allSnapshots = await prisma.inventorySnapshot.findMany({
      where: { userId: dbUser.id },
      orderBy: { createdAt: 'asc' },
      include: {
        items: {
          include: {
            item: {
              include: {
                priceHistory: {
                  orderBy: { timestamp: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    // Calculate metrics for each snapshot
    const graphData = allSnapshots.map(snapshot => {
      const snapshotInventoryMap = new Map<string, number>();
      let snapshotTotalRAP = 0;
      let snapshotTotalItems = 0;

      snapshot.items.forEach(invItem => {
        const latestPrice = invItem.item?.priceHistory[0];
        const rap = latestPrice?.rap || 0;
        
        snapshotTotalRAP += rap;
        snapshotTotalItems += 1;
        snapshotInventoryMap.set(invItem.assetId, (snapshotInventoryMap.get(invItem.assetId) || 0) + 1);
      });

      return {
        snapshotId: snapshot.id,
        date: snapshot.createdAt.toISOString(),
        rap: snapshotTotalRAP,
        itemCount: snapshotTotalItems,
        uniqueCount: snapshotInventoryMap.size,
      };
    });

    // Return the complete player data
    return NextResponse.json({
      user: {
        id: dbUser.id,
        robloxUserId: dbUser.robloxUserId,
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