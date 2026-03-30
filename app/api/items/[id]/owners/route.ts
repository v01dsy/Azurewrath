// app/api/items/[id]/owners/route.ts
import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

const countCache = new Map<string, { count: number; expires: number }>();
const avatarCache = new Map<string, { url: string | null; expires: number }>();
const pageCache = new Map<string, { data: string; expires: number }>();

const AVATAR_FETCH_TIMEOUT_MS = 1200;
const AVATAR_CACHE_TTL_MS = 5 * 60_000;
const PAGE_CACHE_TTL_MS = 30_000;

type RobloxAvatarResponse = {
  data?: Array<{ targetId: number; imageUrl: string | null }>;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemIdString } = await params;
    const assetIdBigInt = BigInt(itemIdString);

    const searchParams = request.nextUrl.searchParams;
    const page     = Math.max(1, parseInt(searchParams.get('page')     ?? '1',  10));
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') ?? '25', 10));
    const sort     = searchParams.get('sort') ?? 'serial';
    const offset   = (page - 1) * pageSize;

    const orderBy = sort === 'username'
      ? 'ORDER BY u.username ASC'
      : sort === 'recent'
      ? 'ORDER BY r."uaidUpdatedAt" DESC NULLS LAST'
      : 'ORDER BY r."serialNumber" ASC NULLS LAST, r."userAssetId" ASC';

    // Return cached page if available
    const pageCacheKey = `${itemIdString}:${page}:${pageSize}:${sort}`;
    const cachedPage = pageCache.get(pageCacheKey);
    if (cachedPage && cachedPage.expires > Date.now()) {
      return new NextResponse(cachedPage.data, {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Run count + owners queries in parallel
    const countPromise = (async () => {
      const cached = countCache.get(itemIdString);
      if (cached && cached.expires > Date.now()) return cached.count;
      const result = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count
        FROM (
          SELECT ii."userAssetId",
                 ROW_NUMBER() OVER (PARTITION BY s."userId" ORDER BY s."createdAt" DESC) AS rn
          FROM "InventoryItem" ii
          INNER JOIN "InventorySnapshot" s ON s.id = ii."snapshotId"
          WHERE ii."assetId" = ${assetIdBigInt}
        ) r
        WHERE r.rn = 1
      `;
      const count = Number(result[0]?.count ?? 0);
      countCache.set(itemIdString, { count, expires: Date.now() + 60_000 });
      return count;
    })();

    const ownersPromise = prisma.$queryRawUnsafe<Array<{
      userAssetId: bigint;
      serialNumber: number | null;
      username: string;
      displayName: string | null;
      robloxUserId: bigint;
      avatarUrl: string | null;
      scannedAt: Date;
      uaidUpdatedAt: Date | null;
    }>>(
      `
      SELECT
        r."userAssetId",
        r."serialNumber",
        r."scannedAt",
        r."uaidUpdatedAt",
        u.username,
        u."displayName",
        u."robloxUserId",
        u."avatarUrl"
      FROM (
        SELECT
          ii."userAssetId",
          ii."serialNumber",
          ii."scannedAt",
          ii."uaidUpdatedAt",
          s."userId",
          ROW_NUMBER() OVER (PARTITION BY s."userId" ORDER BY s."createdAt" DESC) AS rn
        FROM "InventoryItem" ii
        INNER JOIN "InventorySnapshot" s ON s.id = ii."snapshotId"
        WHERE ii."assetId" = $1
      ) r
      INNER JOIN "User" u ON r."userId" = u."robloxUserId"
      WHERE r.rn = 1
      ${orderBy}
      LIMIT $2 OFFSET $3
      `,
      assetIdBigInt, pageSize, offset
    );

    const [total, owners] = await Promise.all([countPromise, ownersPromise]);

    const avatarMap = new Map<string, string>();
    const missingAvatarUserIds = new Set<string>();

    for (const owner of owners) {
      if (owner.avatarUrl) continue;
      const userId = owner.robloxUserId.toString();
      const cached = avatarCache.get(userId);

      if (cached && cached.expires > Date.now()) {
        if (cached.url) avatarMap.set(userId, cached.url);
      } else {
        missingAvatarUserIds.add(userId);
      }
    }

    if (missingAvatarUserIds.size > 0) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), AVATAR_FETCH_TIMEOUT_MS);
        const ids = Array.from(missingAvatarUserIds);
        const res = await fetch(
          `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${ids.join(',')}&size=150x150&format=Webp`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const data: RobloxAvatarResponse = await res.json();
          const now = Date.now();

          data.data?.forEach((a) => {
            const targetId = a.targetId.toString();
            if (a.imageUrl) {
              avatarMap.set(targetId, a.imageUrl);
            }
            avatarCache.set(targetId, { url: a.imageUrl, expires: now + AVATAR_CACHE_TTL_MS });
            missingAvatarUserIds.delete(targetId);
          });

          // Cache misses too so repeated paging doesn't keep calling Roblox for users without avatars.
          for (const userId of missingAvatarUserIds) {
            avatarCache.set(userId, { url: null, expires: now + AVATAR_CACHE_TTL_MS });
          }
        }
      } catch {
        // Keep endpoint responsive even if Roblox thumbnails are slow or unavailable.
      }
    }

    const responseBody = JSON.stringify({
      owners: owners.map(o => ({
        userAssetId:   o.userAssetId.toString(),
        serialNumber:  o.serialNumber ?? null,
        username:      o.username,
        displayName:   o.displayName || o.username,
        robloxUserId:  o.robloxUserId.toString(),
        avatarUrl:     o.avatarUrl || avatarMap.get(o.robloxUserId.toString()) || null,
        scannedAt:     o.scannedAt.toISOString(),
        uaidUpdatedAt: o.uaidUpdatedAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });

    pageCache.set(pageCacheKey, { data: responseBody, expires: Date.now() + PAGE_CACHE_TTL_MS });

    return new NextResponse(responseBody, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Owners fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch owners', details: String(error) },
      { status: 500 }
    );
  }
}