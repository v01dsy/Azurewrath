import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: Request,
  { params }: { params: { snapshotId: string } }
) {
  try {
    const snapshot = await prisma.inventorySnapshot.findUnique({
      where: { id: params.snapshotId },
      include: {
        items: {
          include: {
            item: true
          }
        }
      }
    });

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    // Group items by assetId and count them
    const itemMap = new Map<string, {
      assetId: string;
      name: string;
      imageUrl: string;
      rapThen: number;
      count: number;
    }>();

    let totalRapThen = 0;

    for (const invItem of snapshot.items) {
      const key = invItem.assetId.toString();
      
      if (itemMap.has(key)) {
        const existing = itemMap.get(key)!;
        existing.count++;
      } else {
        itemMap.set(key, {
          assetId: invItem.assetId.toString(),
          name: invItem.item.name,
          imageUrl: invItem.item.imageUrl || '',
          rapThen: 0,
          count: 1
        });
      }
    }

    // Fetch current RAP values
    const assetIds = Array.from(itemMap.keys()).map(id => BigInt(id));
    
    const latestPrices = await prisma.priceHistory.findMany({
      where: {
        itemId: { in: assetIds }
      },
      orderBy: {
        timestamp: 'desc'
      },
      distinct: ['itemId']
    });

    // Get RAP at snapshot time
    const snapshotPrices = await prisma.priceHistory.findMany({
      where: {
        itemId: { in: assetIds },
        timestamp: {
          lte: snapshot.createdAt
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      distinct: ['itemId']
    });

    let totalRapNow = 0;

    // Build final items array
    const items = Array.from(itemMap.values()).map(item => {
      const currentPrice = latestPrices.find(price => price.itemId.toString() === item.assetId);
      const snapshotPrice = snapshotPrices.find(price => price.itemId.toString() === item.assetId);
      
      const rapThen = snapshotPrice?.rap || 0;
      const rapNow = currentPrice?.rap || 0;

      totalRapThen += rapThen * item.count;
      totalRapNow += rapNow * item.count;

      return {
        ...item,
        rapThen,
        rapNow
      };
    });

    return NextResponse.json({
      items,
      totalRapThen,
      totalRapNow
    });

  } catch (error) {
    console.error('Snapshot fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch snapshot' }, { status: 500 });
  }
}