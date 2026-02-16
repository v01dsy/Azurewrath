import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;

    // Check if it's all numbers (assetId) or contains letters (slug/name)
    const isAssetId = /^\d+$/.test(itemId);
    
    let item;
    
    if (isAssetId) {
      // Direct assetId lookup - convert to BigInt
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
              timestamp: 'desc',
            },
            take: 1,
          },
        },
      });
    } else {
      // Slug lookup - convert hyphens to spaces and search by name
      const nameSearch = itemId.replace(/-/g, ' ');
      
      item = await prisma.item.findFirst({
        where: {
          name: {
            equals: nameSearch,
            mode: 'insensitive', // Case-insensitive search
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
              timestamp: 'desc',
            },
            take: 1,
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

    // Add latest price data to the top level for easier access
    const latestPrice = item.priceHistory[0];
    const response = {
      ...item,
      assetId: item.assetId.toString(), // Convert BigInt to string
      currentPrice: latestPrice?.price || null,
      currentRap: latestPrice?.rap || null,
      salesVolume: latestPrice?.salesVolume || null,
      lastUpdated: latestPrice?.timestamp || null,
      priceHistory: item.priceHistory.map(ph => ({
        ...ph,
        itemId: ph.itemId.toString(), // Convert BigInt to string
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