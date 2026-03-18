// app/api/stats/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Cache platform stats for 5 minutes — these change very slowly.
// Note: module-level cache is per-instance (consistent with players/route.ts).
const CACHE_TTL_MS = 5 * 60_000;
let statsCache: { data: unknown; expires: number } | null = null;

export async function GET() {
  if (statsCache && statsCache.expires > Date.now()) {
    return NextResponse.json(statsCache.data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Cache': 'HIT',
      },
    });
  }

  const [userCount, itemCount, uaidCount] = await Promise.all([
    prisma.user.count(),
    prisma.item.count(),
    prisma.inventoryItem.count(),
  ]);

  const data = {
    users: userCount,
    itemsTracked: itemCount,
    uaidsTracked: uaidCount,
  };

  statsCache = { data, expires: Date.now() + CACHE_TTL_MS };

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      'X-Cache': 'MISS',
    },
  });
}