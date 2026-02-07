import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sort = searchParams.get('sort') || 'name';
    const order = searchParams.get('order') || 'asc';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const items = await prisma.item.findMany({
      include: {
        priceHistory: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
        marketTrends: true,
        manualValue: true,
      },
      orderBy: {
        [sort]: order as 'asc' | 'desc',
      },
      take: limit,
      skip: offset,
    });

    const total = await prisma.item.count();

    return Response.json({
      items,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    return Response.json({ error: 'Failed to fetch items' }, { status: 500 });
  }
}
