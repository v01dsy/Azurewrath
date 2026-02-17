// app/api/snipe/stream/route.ts
// Server-Sent Events endpoint.
// The browser connects once (while on the snipe page) and we push deal
// events as the worker writes them to the SnipeDeal table.
//
// Flow:
//   1. Worker detects a deal → inserts row into SnipeDeal
//   2. This endpoint polls SnipeDeal every ~5 s
//   3. Filters deals against the user's SnipeConfig(s)
//   4. Streams matching deals to the browser as SSE messages
//   5. Browser opens the item page in a new tab

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return new Response('Missing userId', { status: 400 });
  }

  const userIdBigInt = BigInt(userId);

  const encoder = new TextEncoder();
  let closed = false;

  // Keep track of the most recent SnipeDeal we've already sent so we don't replay
  let lastSeenId: string | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      // Send a heartbeat comment every 20 s to keep the connection alive
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          closed = true;
        }
      }, 20_000);

      const poll = async () => {
        if (closed) return;

        try {
          // 1. Load the user's enabled snipe configs
          const configs = await prisma.snipeConfig.findMany({
            where: { userId: userIdBigInt, enabled: true },
          });

          if (configs.length === 0) {
            // No configs — still connected, just nothing to match against
            return;
          }

          // 2. Pull recent SnipeDeals (last 2 minutes window, after lastSeenId)
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

          // Update cursor
          lastSeenId = deals[deals.length - 1].id;

          // 3. For each deal, check if it passes at least one of the user's configs
          for (const deal of deals) {
            for (const cfg of configs) {
              // Item filter
              if (cfg.assetId !== null && cfg.assetId !== deal.assetId) continue;

              // Deal % filter
              if (deal.deal < cfg.minDeal) continue;

              // Price filters
              if (cfg.minPrice !== null && deal.price < cfg.minPrice) continue;
              if (cfg.maxPrice !== null && deal.price > cfg.maxPrice) continue;

              // ✅ Match — send the event
              const payload = JSON.stringify({
                assetId: deal.assetId.toString(),
                name: deal.name,
                imageUrl: deal.imageUrl,
                price: deal.price,
                rap: deal.rap,
                deal: Math.round(deal.deal),
              });

              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
              break; // only send each deal once per user even if multiple configs match
            }
          }
        } catch (err) {
          // Don't crash the stream on transient DB errors
          console.error('[snipe/stream] poll error:', err);
        }
      };

      // Poll every 5 seconds
      const interval = setInterval(poll, 5_000);
      // Also poll immediately
      await poll();

      // Cleanup when the client disconnects
      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(heartbeat);
        clearInterval(interval);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    },
  });
}