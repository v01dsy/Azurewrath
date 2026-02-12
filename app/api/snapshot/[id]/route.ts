import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const revalidate = 600; // Cache for 10 minutes (snapshots are historical and don't change)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: snapshotid } = await params;

    // Optimized query - get snapshot with all items and their RAP values in one query
    const snapshotData = await prisma.$queryRaw<Array<{
      assetId: string;
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
        WHERE ii."snapshotId" = ${snapshotid}
        GROUP BY ii."assetId", i.name, i."imageUrl"
      ),
      ItemPrices AS (
        SELECT DISTINCT ON (si."assetId")
          si."assetId",
          si.name,
          si."imageUrl",
          si.item_count,
          -- RAP at snapshot time (closest before or at snapshot)
          ph_then.rap as rap_then,
          -- Current RAP (latest)
          ph_now.rap as rap_now
        FROM SnapshotItems si
        LEFT JOIN "Item" i ON si."assetId" = i."assetId"
        LEFT JOIN LATERAL (
          SELECT rap
          FROM "PriceHistory"
          WHERE "itemId" = i.id
            AND timestamp <= (SELECT "createdAt" FROM "InventorySnapshot" WHERE id = ${snapshotid})
          ORDER BY timestamp DESC
          LIMIT 1
        ) ph_then ON true
        LEFT JOIN LATERAL (
          SELECT rap
          FROM "PriceHistory"
          WHERE "itemId" = i.id
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

    // Calculate totals from fetched data (no extra queries!)
    const totalRapThen = snapshotData.reduce((sum, item) => sum + ((item.rapThen || 0) * item.itemCount), 0);
    const totalRapNow = snapshotData.reduce((sum, item) => sum + ((item.rapNow || 0) * item.itemCount), 0);

    return NextResponse.json({
      items: snapshotData.map(item => ({
        assetId: item.assetId,
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