// app/api/players/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Cache the leaderboard for 60 seconds — rankings don't need to be real-time
// and this eliminates the most expensive query from hammering on every page load.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: unknown; expires: number }>();

function getCached(key: string) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  cache.delete(key);
  return null;
}

function setCached(key: string, data: unknown) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

const SORT_FIELD: Record<string, string> = {
  rap:    'totalRAP',
  items:  'totalItems',
  unique: 'uniqueItems',
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sort  = SORT_FIELD[searchParams.get('sort') || 'rap'] ?? 'totalRAP';
    const page  = Math.max(1, parseInt(searchParams.get('page')  || '1'));
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 99999);
    const skip  = (page - 1) * limit;

    const cacheKey = `${sort}:${page}:${limit}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'X-Cache': 'HIT' },
      });
    }

    // ── Single DB query: use a lateral join to get each user's latest snapshot,
    //    sort in Postgres, paginate in Postgres. No more full table scan in JS. ──
    const [rows, totalResult] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{
        robloxUserId: bigint;
        username: string;
        displayName: string | null;
        avatarUrl: string | null;
        totalRAP: number | null;
        totalItems: number | null;
        uniqueItems: number | null;
        lastScanned: Date | null;
      }>>(
        `
        SELECT
          u."robloxUserId",
          u.username,
          u."displayName",
          u."avatarUrl",
          s."totalRAP",
          s."totalItems",
          s."uniqueItems",
          s."createdAt" AS "lastScanned"
        FROM "User" u
        INNER JOIN LATERAL (
          SELECT "totalRAP", "totalItems", "uniqueItems", "createdAt"
          FROM "InventorySnapshot"
          WHERE "userId" = u."robloxUserId"
          ORDER BY "createdAt" DESC
          LIMIT 1
        ) s ON true
        ORDER BY s."${sort}" DESC NULLS LAST
        LIMIT $1 OFFSET $2
        `,
        limit,
        skip
      ),

      // Count only users who have at least one snapshot
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT u."robloxUserId") AS count
        FROM "User" u
        WHERE EXISTS (
          SELECT 1 FROM "InventorySnapshot" WHERE "userId" = u."robloxUserId"
        )
      `,
    ]);

    const total      = Number(totalResult[0]?.count ?? 0);
    const totalPages = Math.ceil(total / limit);

    // Fetch full body avatars in bulk server-side — same approach as player page
    const userIds = rows.map(u => u.robloxUserId.toString());
    let fullBodyMap = new Map<string, string>();
    if (userIds.length > 0) {
      try {
        const avatarRes = await fetch(
          `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userIds.join(',')}&size=420x420&format=Png&isCircular=false`
        );
        const avatarData = await avatarRes.json();
        avatarData.data?.forEach((a: any) => {
          if (a.targetId && a.imageUrl) {
            fullBodyMap.set(a.targetId.toString(), a.imageUrl);
          }
        });
      } catch { /* avatars are cosmetic, don't fail the request */ }
    }

    const players = rows.map((u, idx) => ({
      rank:          skip + idx + 1,
      robloxUserId:  u.robloxUserId.toString(),
      username:      u.username,
      displayName:   u.displayName,
      avatarUrl:     fullBodyMap.get(u.robloxUserId.toString()) ?? u.avatarUrl,
      totalRAP:      u.totalRAP    ?? 0,
      totalItems:    u.totalItems  ?? 0,
      uniqueItems:   u.uniqueItems ?? 0,
      lastScanned:   u.lastScanned ?? null,
    }));

    const payload = { players, total, totalPages, page, limit };
    setCached(cacheKey, payload);

    return NextResponse.json(payload, {
      headers: { 'X-Cache': 'MISS' },
    });
  } catch (error) {
    console.error('Players API error:', error);
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}