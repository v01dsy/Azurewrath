import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Verify webhook signature
function verifySignature(payload: string, signature: string): boolean {
  const secret = process.env.AZURE_SECRET_KEY || 'dev-secret';
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return hash === signature;
}

// Calculate market trends from price history
async function calculateTrends(itemId: string) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const prices7d = await prisma.priceHistory.findMany({
    where: {
      itemId,
      timestamp: { gte: sevenDaysAgo },
    },
  });

  const prices30d = await prisma.priceHistory.findMany({
    where: {
      itemId,
      timestamp: { gte: thirtyDaysAgo },
    },
  });

  if (prices7d.length === 0) return null;

  const avg7d = prices7d.reduce((sum, p) => sum + p.price, 0) / prices7d.length;
  const avg30d = prices30d.length > 0
    ? prices30d.reduce((sum, p) => sum + p.price, 0) / prices30d.length
    : avg7d;

  const oldest7d = prices7d[0].price;
  const latest = prices7d[prices7d.length - 1].price;
  const change7d = ((latest - oldest7d) / oldest7d) * 100;

  let trend = 'stable';
  if (change7d > 5) trend = 'increasing';
  if (change7d < -5) trend = 'decreasing';

  let demandRating = 'moderate';
  const avgVolume = prices7d.reduce((sum, p) => sum + (p.salesVolume || 0), 0) / prices7d.length;
  if (avgVolume > 100) demandRating = 'high';
  if (avgVolume < 10) demandRating = 'low';

  return {
    avgPrice7d: avg7d,
    avgPrice30d: avg30d,
    priceChange7d: change7d,
    priceChange30d: ((latest - (prices30d[0]?.price || latest)) / (prices30d[0]?.price || latest)) * 100,
    trend,
    demandRating,
  };
}

// POST /api/ingest
export async function POST(req: Request) {
  try {
    const signature = req.headers.get('X-Signature');
    const body = await req.text();

    if (!signature || !verifySignature(body, signature)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = JSON.parse(body);
    const { items } = data;

    if (!Array.isArray(items)) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    let processed = 0;
    let updated = 0;

    for (const itemData of items) {
      const {
        assetId,
        name,
        imageUrl,
        price,
        rap,
        lowestResale,
        salesVolume,
      } = itemData;

      if (!assetId || !price) continue;

      // Upsert item
      const item = await prisma.item.upsert({
        where: { assetId },
        update: { name, imageUrl },
        create: { assetId, name, imageUrl },
      });

      // Create price history entry
      await prisma.priceHistory.create({
        data: {
          itemId: item.id,
          price,
          rap,
          lowestResale,
          salesVolume,
        },
      });

      // Update market trends
      const trends = await calculateTrends(item.id);
      if (trends) {
        await prisma.marketTrends.upsert({
          where: { itemId: item.id },
          update: trends,
          create: { itemId: item.id, ...trends },
        });
      }

      updated++;
      processed++;
    }

    // Log ingestion
    await prisma.ingestLog.create({
      data: {
        itemsProcessed: processed,
        itemsUpdated: updated,
        status: updated > 0 ? 'success' : 'partial',
      },
    });

    return Response.json({
      success: true,
      processed,
      updated,
    });
  } catch (error) {
    console.error('Ingest error:', error);

    return Response.json(
      { error: 'Ingest failed', details: String(error) },
      { status: 500 }
    );
  }
}
