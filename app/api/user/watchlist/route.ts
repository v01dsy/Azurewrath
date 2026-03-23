import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    const userIdBigInt = BigInt(userId);

    const watchlistEntries = await prisma.watchlist.findMany({
      where: { userId: userIdBigInt },
      include: {
        item: {
          include: {
            priceHistory: {
              orderBy: { timestamp: 'desc' },
              take: 1,
              select: { price: true, rap: true, timestamp: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const items = watchlistEntries.map((entry) => {
      const latest = entry.item.priceHistory[0];
      return {
        assetId: entry.item.assetId.toString(),
        name: entry.item.name,
        imageUrl: entry.item.imageUrl,
        manipulated: entry.item.manipulated,
        currentPrice: latest?.price ?? null,
        currentRap: latest?.rap ?? null,
        lastUpdated: latest?.timestamp ?? null,
        addedAt: entry.createdAt,
        priceAlerts: entry.priceAlerts,
        salesAlerts: entry.salesAlerts,
        tradeAlerts: entry.tradeAlerts,
        tradeAlertType: entry.tradeAlertType,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Fetch watchlist error:', error);
    return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId, assetId, priceAlerts, salesAlerts, tradeAlerts, tradeAlertType } = await request.json();
    if (!userId || !assetId) return NextResponse.json({ error: 'Missing userId or assetId' }, { status: 400 });

    await prisma.watchlist.update({
      where: { userId_itemId: { userId: BigInt(userId), itemId: BigInt(assetId) } },
      data: { priceAlerts, salesAlerts, tradeAlerts, tradeAlertType },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update watchlist error:', error);
    return NextResponse.json({ error: 'Failed to update watchlist' }, { status: 500 });
  }
}