import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;
    const item = await prisma.item.findFirst({
      where: {
        OR: [{ id: itemId }, { assetId: itemId }],
      },
      include: {
        priceHistory: {
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

    const sales = await prisma.sale.findMany({
      where: { itemId: item.id },
      orderBy: {
        saleDate: 'desc',
      },
    });

    // Get all price history for this item
    const priceHistory = await prisma.priceHistory.findMany({
      where: { itemId: item.id },
      orderBy: { timestamp: 'asc' },
    });

    // Calculate actual sale prices
    const salesWithCorrectPrices = sales.map((sale) => {
      // Find the RAP at the time of sale (closest timestamp before or at sale date)
      const rapAtSale = priceHistory
        .filter(ph => new Date(ph.timestamp) <= new Date(sale.saleDate))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

      // Find the previous RAP entry before the sale (this is what we show in the RAP column)
      const previousRap = priceHistory
        .filter(ph => new Date(ph.timestamp) < new Date(rapAtSale?.timestamp || sale.saleDate))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

      if (rapAtSale && previousRap && rapAtSale.rap !== null && previousRap.rap !== null) {
        const rapDifference = rapAtSale.rap - previousRap.rap;
        // Sale Price = Previous RAP + (RAP Difference × 10)
        const actualSalePrice = previousRap.rap + (rapDifference * 10);
        
        return {
          ...sale,
          salePrice: actualSalePrice,
          rapAfterSale: rapAtSale.rap,  // NEW: RAP after the sale
          rapBeforeSale: previousRap.rap,
          rapDifference: rapDifference
        };
      }

      // If we can't calculate, return the stored price
      return {
        ...sale,
        rapBeforeSale: null
      };
    });

    // Get current RAP
    const currentRap = item.priceHistory[0]?.rap || null;

    return NextResponse.json({
      sales: salesWithCorrectPrices,
      currentRap: currentRap
    });
  } catch (error) {
    console.error('Fetch sales error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales', details: String(error) },
      { status: 500 }
    );
  }
}