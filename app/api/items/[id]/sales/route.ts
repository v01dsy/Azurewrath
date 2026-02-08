import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

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

    return NextResponse.json(sales);
  } catch (error) {
    console.error('Fetch sales error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales', details: String(error) },
      { status: 500 }
    );
  }
}
