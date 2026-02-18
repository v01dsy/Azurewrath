// app/api/snipe/stream/route.ts
// Proxies to the Python snipe server which has no timeout.
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SNIPE_SERVER = process.env.SNIPE_SERVER_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return new Response('Missing userId', { status: 400 });

  const upstream = await fetch(`${SNIPE_SERVER}/stream?userId=${userId}`, {
    headers: { Accept: 'text/event-stream' },
    // @ts-ignore — Node fetch supports this
    duplex: 'half',
  });

  if (!upstream.ok || !upstream.body) {
    return new Response('Snipe server unavailable', { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}