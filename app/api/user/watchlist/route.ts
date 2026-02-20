import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const userIdBigInt = BigInt(userId);

    const watchlistEntries = await prisma.watchlist.findMany({
      where: { userId: userIdBigInt },
      include: {
        item: {
          include: {
            priceHistory: {
              orderBy: { timestamp: 'desc' },
              take: 1,
              select: {
                price: true,
                rap: true,
                timestamp: true,
              },
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
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Fetch watchlist error:', error);
    return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 });
  }
}