import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';

    let items;
    if (query.length < 1) {
      // No query: return all items (up to 2500)
      items = await prisma.item.findMany({
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
        take: 2500,
        orderBy: {
          assetId: 'asc', // Sort numerically by assetId
        },
      });
    } else {
      // Check if query is purely numeric
      const isNumeric = /^\d+$/.test(query);
      
      if (isNumeric) {
        // If numeric, search by exact assetId match
        items = await prisma.item.findMany({
          where: {
            assetId: BigInt(query), // Convert string to BigInt
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
              orderBy: { timestamp: 'desc' },
              take: 1,
            },
          },
          take: 20,
        });
      } else {
        // If text, search by name only
        items = await prisma.item.findMany({
          where: {
            name: {
              contains: query,
              mode: 'insensitive',
            },
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
              orderBy: { timestamp: 'desc' },
              take: 1,
            },
          },
          take: 20,
        });
      }
    }

    // Convert BigInt to string for JSON serialization
    const serializedItems = items.map(item => ({
      ...item,
      assetId: item.assetId.toString(),
      priceHistory: item.priceHistory.map(ph => ({
        ...ph,
        itemId: ph.itemId.toString(),
      })),
    }));

    console.log(`Search query: "${query}", found: ${serializedItems.length} items`);
    return NextResponse.json(serializedItems);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed', details: String(error) },
      { status: 500 }
    );
  }
}