// app/api/items/[id]/route.ts
import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Round a Date down to the nearest 30-minute boundary.
 * e.g. 14:37 -> 14:30, 14:12 -> 14:00
 * This is done in-memory so the DB stores real timestamps.
 */
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

    let item;

    if (isAssetId) {
      item = await prisma.item.findUnique({
        where: { assetId: BigInt(itemId) },
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
            orderBy: { timestamp: 'asc' },
          },
        },
      });
    } else {
      const nameSearch = itemId.replace(/-/g, ' ');

      item = await prisma.item.findFirst({
        where: {
          name: { equals: nameSearch, mode: 'insensitive' },
        },
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
            orderBy: { timestamp: 'asc' },
          },
        },
      });
    }

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Group price history into 30-minute buckets in-memory.
    // For each bucket, keep the LAST record (most recent within that window).
    const bucketMap = new Map<string, {
      id: string;
      itemId: string;
      price: number;
      rap: number | null;
      salesVolume: number | null;
      timestamp: string; // the bucket boundary ISO string
    }>();

    for (const ph of item.priceHistory) {
      const bucketKey = bucket30(ph.timestamp);
      // Always overwrite — last record in the bucket wins
      bucketMap.set(bucketKey, {
        id: ph.id,
        itemId: ph.itemId.toString(),
        price: ph.price,
        rap: ph.rap ?? null,
        salesVolume: ph.salesVolume ?? null,
        timestamp: bucketKey,
      });
    }

    // Sort buckets chronologically
    const groupedHistory = Array.from(bucketMap.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const latestPrice = item.priceHistory[item.priceHistory.length - 1];

    const response = {
      ...item,
      assetId: item.assetId.toString(),
      currentPrice: latestPrice?.price ?? null,
      currentRap: latestPrice?.rap ?? null,
      salesVolume: latestPrice?.salesVolume ?? null,
      lastUpdated: latestPrice?.timestamp ?? null,
      // Grouped for the chart
      priceHistory: groupedHistory,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Fetch item error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch item', details: String(error) },
      { status: 500 }
    );
  }
}