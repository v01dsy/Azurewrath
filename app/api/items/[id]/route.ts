import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const item = await prisma.item.findUnique({
      where: { assetId: params.id },
      include: {
        priceHistory: {
          orderBy: { timestamp: 'desc' },
          take: 100,
        },
        marketTrends: true,
        manualValue: true,
      },
    });

    if (!item) {
      return Response.json({ error: 'Item not found' }, { status: 404 });
    }

    return Response.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    return Response.json({ error: 'Failed to fetch item' }, { status: 500 });
  }
}
