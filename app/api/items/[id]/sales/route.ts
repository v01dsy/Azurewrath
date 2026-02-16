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
    
    const item = await prisma.item.findUnique({
      where: {
        assetId: itemIdBigInt
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
          take: 1
        }
      }
    });

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // Fetch sales - now with oldRap and newRap
    const sales = await prisma.sale.findMany({
      where: { itemId: itemIdBigInt },
      orderBy: {
        saleDate: 'desc',
      },
    });

    // Transform sales data - calculate sale price from oldRap and newRap
    const salesWithCalculatedPrices = sales.map((sale) => {
      const { itemId, oldRap, newRap, ...saleData } = sale;
      
      // Calculate sale price: oldRap + ((newRap - oldRap) * 10)
      const rapDifference = newRap - oldRap;
      const salePrice = oldRap + (rapDifference * 10);
      
      return {
        ...saleData,
        itemId: itemId.toString(), // Convert BigInt to string
        oldRap: oldRap,
        newRap: newRap,
        salePrice: salePrice,
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