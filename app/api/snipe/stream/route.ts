// app/api/snipe/stream/route.ts
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel max, ignored locally but good to have

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return new Response('Missing userId', { status: 400 });

  let userIdBigInt: bigint;
  try {
    userIdBigInt = BigInt(userId);
  } catch {
    return new Response('Invalid userId', { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let lastSeenId: string | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          closed = true;
        }
      };

      // Send immediate open confirmation
      send(': connected\n\n');

      const poll = async () => {
        if (closed) return;
        try {
          const configs = await prisma.snipeConfig.findMany({
            where: { userId: userIdBigInt, enabled: true },
          });

          if (configs.length === 0) return;

          const cutoff = new Date(Date.now() - 2 * 60 * 1000);
          const deals = await prisma.snipeDeal.findMany({
            where: {
              createdAt: { gte: cutoff },
              ...(lastSeenId ? { id: { gt: lastSeenId } } : {}),
            },
            orderBy: { createdAt: 'asc' },
            take: 50,
          });

          if (deals.length === 0) return;
          lastSeenId = deals[deals.length - 1].id;

          for (const deal of deals) {
            for (const cfg of configs) {
              if (cfg.assetId !== null && cfg.assetId !== deal.assetId) continue;
              if (deal.deal < cfg.minDeal) continue;
              if (cfg.minPrice !== null && deal.price < cfg.minPrice) continue;
              if (cfg.maxPrice !== null && deal.price > cfg.maxPrice) continue;

              send(`data: ${JSON.stringify({
                assetId: deal.assetId.toString(),
                name: deal.name,
                imageUrl: deal.imageUrl,
                price: deal.price,
                rap: deal.rap,
                deal: Math.round(deal.deal),
              })}\n\n`);
              break;
            }
          }
        } catch (err) {
          console.error('[snipe/stream] poll error:', err);
        }
      };

      // Heartbeat every 5s — short enough to beat any proxy timeout
      const heartbeat = setInterval(() => {
        send(': heartbeat\n\n');
      }, 5_000);

      const interval = setInterval(poll, 5_000);
      poll(); // immediate first poll

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(heartbeat);
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}