// app/api/snapshot/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const revalidate = 600;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: snapshotId } = await params;

  const snapshotData = await prisma.$queryRaw<Array<{
    assetId: bigint; // 👈 change from string to bigint
    name: string;
    imageUrl: string | null;
    rapThen: number | null;
    rapNow: number | null;
    itemCount: number;
  }>>`
      WITH SnapshotItems AS (
        SELECT 
          ii."assetId",
          i.name,
          i."imageUrl",
          COUNT(*) as item_count
        FROM "InventoryItem" ii
        LEFT JOIN "Item" i ON ii."assetId" = i."assetId"
        WHERE ii."snapshotId" = ${snapshotId}
        GROUP BY ii."assetId", i.name, i."imageUrl"
      ),
      ItemPrices AS (
        SELECT DISTINCT ON (si."assetId")
          si."assetId",
          si.name,
          si."imageUrl",
          si.item_count,
          ph_then.rap as rap_then,
          ph_now.rap as rap_now
        FROM SnapshotItems si
        LEFT JOIN LATERAL (
          SELECT rap
          FROM "PriceHistory"
          WHERE "itemId" = si."assetId"
            AND timestamp <= (SELECT "createdAt" FROM "InventorySnapshot" WHERE id = ${snapshotId})
          ORDER BY timestamp DESC
          LIMIT 1
        ) ph_then ON true
        LEFT JOIN LATERAL (
          SELECT rap
          FROM "PriceHistory"
          WHERE "itemId" = si."assetId"
          ORDER BY timestamp DESC
          LIMIT 1
        ) ph_now ON true
      )
      SELECT 
        "assetId",
        COALESCE(name, 'Unknown Item') as name,
        "imageUrl",
        COALESCE(rap_then, 0) as "rapThen",
        COALESCE(rap_now, 0) as "rapNow",
        item_count::int as "itemCount"
      FROM ItemPrices
      ORDER BY rap_now DESC NULLS LAST
    `;

    const totalRapThen = snapshotData.reduce((sum, item) => sum + ((item.rapThen || 0) * item.itemCount), 0);
    const totalRapNow = snapshotData.reduce((sum, item) => sum + ((item.rapNow || 0) * item.itemCount), 0);

    return NextResponse.json({
      items: snapshotData.map(item => ({
        assetId: item.assetId.toString(), // 👈 convert BigInt to string
        name: item.name,
        imageUrl: item.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=150&height=150&format=png`,
        rapThen: item.rapThen || 0,
        rapNow: item.rapNow || 0,
        count: item.itemCount
      })),
    totalRapThen,
    totalRapNow
  });

  } catch (error) {
    console.error('Snapshot fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snapshot', details: String(error) },
      { status: 500 }
    );
  }
}