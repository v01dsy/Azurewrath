// app/api/sales/route.ts
// Sale price is calculated from oldRap and newRap: Sale Price = oldRap + ((newRap - oldRap) × 10)

import { NextResponse } from 'next/server';
import { Pool, types } from 'pg';

// Tell pg to treat all timestamps as UTC (don't apply local timezone conversion)
types.setTypeParser(1114, (str: string) => str + 'Z'); // TIMESTAMP WITHOUT TIME ZONE
types.setTypeParser(1184, (str: string) => str + 'Z'); // TIMESTAMP WITH TIME ZONE

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false }
    : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const query = `
      SELECT 
        s.id,
        s."itemId",
        s."saleDate",
        s."oldRap",
        s."newRap",
        i.name as "itemName",
        i."assetId",
        i."imageUrl" as "thumbnailUrl",
        i."manipulated",
        GREATEST(0, ROUND((s."newRap" * 10) - (s."oldRap" * 9))) as "salePrice",
        (s."newRap" - s."oldRap") as "rapDifference"
      FROM "Sale" s
      JOIN "Item" i ON s."itemId" = i."assetId"
      ORDER BY s."saleDate" DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);

    const countQuery = 'SELECT COUNT(*) FROM "Sale"';
    const countResult = await pool.query(countQuery);
    const totalCount = parseInt(countResult.rows[0].count);

    const sales = result.rows.map(row => ({
      ...row,
      itemId: row.itemId.toString(),
      assetId: row.assetId.toString(),
      saleDate: row.saleDate instanceof Date ? row.saleDate.toISOString() : row.saleDate
    }));

    return NextResponse.json({
      sales: sales,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount
      }
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10'
      }
    });

  } catch (error) {
    console.error('Error fetching sales:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch sales',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { itemId, limit = 20 } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: 'itemId is required' },
        { status: 400 }
      );
    }

    const query = `
      SELECT 
        s.id,
        s."itemId",
        s."oldRap",
        s."newRap",
        s."saleDate",
        i.name as "itemName",
        i."assetId",
        i."imageUrl" as "thumbnailUrl",
        i."manipulated",
        ROUND(s."oldRap" + ((s."newRap" - s."oldRap") * 10)) as "salePrice",
        (s."newRap" - s."oldRap") as "rapDifference"
      FROM "Sale" s
      JOIN "Item" i ON s."itemId" = i."assetId"
      WHERE s."itemId" = $1
      ORDER BY s."saleDate" DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [itemId, Math.min(limit, 100)]);

    const sales = result.rows.map(row => ({
      ...row,
      itemId: row.itemId.toString(),
      assetId: row.assetId.toString(),
      saleDate: row.saleDate instanceof Date ? row.saleDate.toISOString() : row.saleDate
    }));

    return NextResponse.json({
      sales: sales
    });

  } catch (error) {
    console.error('Error fetching item sales:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch item sales' },
      { status: 500 }
    );
  }
}