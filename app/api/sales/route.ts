// app/api/sales/route.ts
// CALCULATES SALE PRICE using Roblox RAP formula: Sale Price = (New RAP - Old RAP) × 10 + Old RAP

import { NextResponse } from 'next/server';
import { Pool } from 'pg';

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

    // Calculate sale price using RAP formula: Sale Price = (New RAP - Old RAP) × 10 + Old RAP
    const query = `
      WITH sales_with_rap AS (
        SELECT 
          s.id,
          s."itemId",
          s."saleDate",
          s."sellerUsername",
          s."buyerUsername",
          s."serialNumber",
          i.name as "itemName",
          i."assetId",
          i."imageUrl" as "thumbnailUrl",
          -- Old RAP: previous sale's salePrice (which stores RAP)
          LAG(s."salePrice") OVER (
            PARTITION BY s."itemId" 
            ORDER BY s."saleDate"
          ) as "oldRap",
          -- New RAP: current sale's salePrice (which stores RAP)
          s."salePrice" as "newRap"
        FROM "Sale" s
        JOIN "Item" i ON s."itemId" = i.id
      )
      SELECT 
        id,
        "itemId",
        "saleDate",
        "sellerUsername",
        "buyerUsername",
        "serialNumber",
        "itemName",
        "assetId",
        "thumbnailUrl",
        "oldRap",
        "newRap",
        -- Calculate sale price: (New RAP - Old RAP) × 10 + Old RAP
        CASE 
          WHEN "oldRap" IS NOT NULL THEN 
            ROUND(("newRap" - "oldRap") * 10 + "oldRap")
          ELSE 
            "newRap"
        END as "salePrice"
      FROM sales_with_rap
      ORDER BY "saleDate" DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);

    // Get total count
    const countQuery = 'SELECT COUNT(*) FROM "Sale"';
    const countResult = await pool.query(countQuery);
    const totalCount = parseInt(countResult.rows[0].count);

    return NextResponse.json({
      sales: result.rows,
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
        s."salePrice",
        s."saleDate",
        s."sellerUsername",
        s."buyerUsername",
        s."serialNumber",
        i.name as "itemName",
        i."assetId",
        i."imageUrl" as "thumbnailUrl"
      FROM "Sale" s
      JOIN "Item" i ON s."itemId" = i.id
      WHERE s."itemId" = $1
      ORDER BY s."saleDate" DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [itemId, Math.min(limit, 100)]);

    return NextResponse.json({
      sales: result.rows
    });

  } catch (error) {
    console.error('Error fetching item sales:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch item sales' },
      { status: 500 }
    );
  }
}