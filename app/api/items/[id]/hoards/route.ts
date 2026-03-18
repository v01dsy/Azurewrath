// app/api/items/[id]/hoards/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assetId } = await params;
    const assetIdBigInt = BigInt(assetId);

    // Use SQL to get only the latest snapshot per user that contains this asset,
    // counting copies per user in a single query — avoids a full JS scan.
    const rows = await prisma.$queryRaw<Array<{
      robloxUserId: bigint;
      username: string;
      avatarUrl: string | null;
      scannedAt: Date;
      count: bigint;
      copies: string; // JSON array of {userAssetId, serialNumber}
    }>>`
      WITH LatestSnapshots AS (
        SELECT DISTINCT ON ("userId") id, "userId", "createdAt"
        FROM "InventorySnapshot"
        ORDER BY "userId", "createdAt" DESC
      )
      SELECT
        u."robloxUserId",
        u.username,
        u."avatarUrl",
        ls."createdAt" AS "scannedAt",
        COUNT(ii."userAssetId") AS count,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'userAssetId', ii."userAssetId"::text,
            'serialNumber', ii."serialNumber"
          )
          ORDER BY ii."serialNumber" ASC NULLS LAST, ii."userAssetId" ASC
        ) AS copies
      FROM "InventoryItem" ii
      INNER JOIN LatestSnapshots ls ON ii."snapshotId" = ls.id
      INNER JOIN "User" u ON ls."userId" = u."robloxUserId"
      WHERE ii."assetId" = ${assetIdBigInt}
      GROUP BY u."robloxUserId", u.username, u."avatarUrl", ls."createdAt"
      HAVING COUNT(ii."userAssetId") >= 2
      ORDER BY count DESC
    `;

    const hoards = rows.map(row => {
      let copies: { userAssetId: string; serialNumber: number | null }[];
      try {
        copies = typeof row.copies === 'string' ? JSON.parse(row.copies) : row.copies;
      } catch {
        console.error(`Failed to parse copies JSON for user ${row.robloxUserId}:`, error);
        copies = [];
      }
      return {
        robloxUserId: row.robloxUserId.toString(),
        username: row.username,
        avatarUrl: row.avatarUrl ?? null,
        count: Number(row.count),
        copies,
        scannedAt: row.scannedAt.toISOString(),
      };
    });

    return NextResponse.json({ hoards });
  } catch (err) {
    console.error('Hoards fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch hoards' }, { status: 500 });
  }
}