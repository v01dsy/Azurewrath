// app/api/items/[id]/route.ts
import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

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
            orderBy: {
              timestamp: 'asc',
            },
          },
        },
      });
    } else {
      const nameSearch = itemId.replace(/-/g, ' ');
      
      item = await prisma.item.findFirst({
        where: {
          name: {
            equals: nameSearch,
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
            orderBy: {
              timestamp: 'asc',
            },
          },
        },
      });
    }

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    const latestPrice = item.priceHistory[item.priceHistory.length - 1];
    const response = {
      ...item,
      assetId: item.assetId.toString(),
      currentPrice: latestPrice?.price || null,
      currentRap: latestPrice?.rap || null,
      salesVolume: latestPrice?.salesVolume || null,
      lastUpdated: latestPrice?.timestamp || null,
      priceHistory: item.priceHistory.map(ph => ({
        ...ph,
        itemId: ph.itemId.toString(),
      })),
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