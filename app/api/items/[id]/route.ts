// app/api/items/[id]/route.ts
import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

function bucket30(date: Date): string {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
  return d.toISOString();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;
    const isAssetId = /^\d+$/.test(itemId);

    const include = {
      priceHistory: {
        select: {
          id: true,
          itemId: true,
          price: true,
          rap: true,
          salesVolume: true,
          timestamp: true,
        },
        orderBy: { timestamp: 'asc' as const },
      },
    };

    const item = isAssetId
      ? await prisma.item.findUnique({
          where: { assetId: BigInt(itemId) },
          include,
        })
      : await prisma.item.findFirst({
          where: { name: { equals: itemId.replace(/-/g, ' '), mode: 'insensitive' } },
          include,
        });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const bucketMap = new Map<string, {
      id: string;
      itemId: string;
      price: number;
      rap: number | null;
      salesVolume: number | null;
      timestamp: string;
    }>();

    for (const ph of item.priceHistory) {
      const key = bucket30(ph.timestamp);
      bucketMap.set(key, {
        id: ph.id,
        itemId: ph.itemId.toString(),
        price: ph.price,
        rap: ph.rap ?? null,
        salesVolume: ph.salesVolume ?? null,
        timestamp: key,
      });
    }

    const groupedHistory = Array.from(bucketMap.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const latest = item.priceHistory[item.priceHistory.length - 1];

    return NextResponse.json({
      assetId: item.assetId.toString(),
      name: item.name,
      imageUrl: item.imageUrl ?? null,
      description: item.description ?? null,
      manipulated: item.manipulated,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      currentPrice: latest?.price ?? null,
      currentRap: latest?.rap ?? null,
      salesVolume: latest?.salesVolume ?? null,
      lastUpdated: latest?.timestamp ?? null,
      priceHistory: groupedHistory,
    });

  } catch (error) {
    console.error('Fetch item error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch item', details: String(error) },
      { status: 500 }
    );
  }
}