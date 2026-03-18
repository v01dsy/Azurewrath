// app/api/items/[id]/sales/route.ts
import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

// Helper to convert BigInt to string for JSON serialization
function serializeBigInt<T>(obj: T): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(item => serializeBigInt(item));
  if (typeof obj === 'object') {
    const serialized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        serialized[key] = serializeBigInt((obj as any)[key]);
      }
    }
    return serialized;
  }
  return obj;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemIdString } = await params;
    
    // Convert itemId to BigInt for database query
    const itemIdBigInt = BigInt(itemIdString);

    // Fetch item (latest price) and sales in parallel.
    const [item, sales] = await Promise.all([
      prisma.item.findUnique({
        where: { assetId: itemIdBigInt },
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
      }),
      prisma.sale.findMany({
        where: { itemId: itemIdBigInt },
        orderBy: { saleDate: 'desc' },
      }),
    ]);

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // Transform sales data to match frontend expectations
    const salesWithCalculatedPrices = sales.map((sale) => {
      const rapDifference = sale.newRap - sale.oldRap;
      
      return {
        id: sale.id,
        salePrice: Math.round(sale.oldRap + ((sale.newRap - sale.oldRap) * 10)),
        sellerUsername: undefined,
        buyerUsername: undefined,
        serialNumber: undefined,
        // FIX: Keep the full ISO string with Z so the frontend parses it as UTC,
        // not local time (which was causing a 5-hour offset).
        saleDate: sale.saleDate.toISOString(),
        rapAfterSale: sale.newRap,
        rapBeforeSale: sale.oldRap,
        rapAtSale: sale.newRap,
        previousRap: sale.oldRap,
        rapDifference: rapDifference
      };
    });

    // Get current RAP
    const currentRap = item.priceHistory[0]?.rap || null;

    return NextResponse.json(serializeBigInt({
      sales: salesWithCalculatedPrices,
      currentRap: currentRap
    }));
  } catch (error) {
    console.error('Fetch sales error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales', details: String(error) },
      { status: 500 }
    );
  }
}