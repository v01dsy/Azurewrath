// app/api/player/[userid]/rank/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userid: string }> }
) {
  try {
    const { userid } = await params;

    // Single query — count users with higher value in each category.
    // COUNT(...) + 1 = rank. All 3 done in one round-trip.
    const result = await pool.query(`
      WITH latest_snaps AS (
        SELECT DISTINCT ON ("userId")
          "userId",
          "totalRAP",
          "totalItems",
          "uniqueItems"
        FROM "InventorySnapshot"
        WHERE "totalRAP" IS NOT NULL
        ORDER BY "userId", "createdAt" DESC
      ),
      target AS (
        SELECT "totalRAP", "totalItems", "uniqueItems"
        FROM latest_snaps
        WHERE "userId" = $1
      )
      SELECT
        (SELECT COUNT(*) FROM latest_snaps, target WHERE latest_snaps."totalRAP"    > target."totalRAP")    + 1 AS rap_rank,
        (SELECT COUNT(*) FROM latest_snaps, target WHERE latest_snaps."totalItems"  > target."totalItems")  + 1 AS items_rank,
        (SELECT COUNT(*) FROM latest_snaps, target WHERE latest_snaps."uniqueItems" > target."uniqueItems") + 1 AS unique_rank,
        (SELECT "totalRAP" FROM target) AS rap
    `, [BigInt(userid)]);

    const row = result.rows[0];
    if (!row || row.rap === null) {
      return NextResponse.json({ rapRank: null, itemsRank: null, uniqueRank: null }, { status: 200 });
    }

    return NextResponse.json({
      rapRank:    Number(row.rap_rank),
      itemsRank:  Number(row.items_rank),
      uniqueRank: Number(row.unique_rank),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' }
    });
  } catch (error) {
    console.error('Rank API error:', error);
    return NextResponse.json({ rapRank: null, itemsRank: null, uniqueRank: null }, { status: 200 });
  }
}