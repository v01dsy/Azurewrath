import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import '@/lib/bigint-patch';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  try {
    const [rapRank, itemsRank, uniqueRank] = await Promise.all([
      prisma.$queryRaw<[{ rank: bigint }]>`
        SELECT COUNT(*) + 1 AS rank
        FROM (
          SELECT DISTINCT ON ("userId") "totalRAP"
          FROM "InventorySnapshot"
          ORDER BY "userId", "createdAt" DESC
        ) latest
        WHERE "totalRAP" > (
          SELECT "totalRAP" FROM "InventorySnapshot"
          WHERE "userId" = ${BigInt(userId)}
          ORDER BY "createdAt" DESC LIMIT 1
        )
      `,
      prisma.$queryRaw<[{ rank: bigint }]>`
        SELECT COUNT(*) + 1 AS rank
        FROM (
          SELECT DISTINCT ON ("userId") "totalItems"
          FROM "InventorySnapshot"
          ORDER BY "userId", "createdAt" DESC
        ) latest
        WHERE "totalItems" > (
          SELECT "totalItems" FROM "InventorySnapshot"
          WHERE "userId" = ${BigInt(userId)}
          ORDER BY "createdAt" DESC LIMIT 1
        )
      `,
      prisma.$queryRaw<[{ rank: bigint }]>`
        SELECT COUNT(*) + 1 AS rank
        FROM (
          SELECT DISTINCT ON ("userId") "uniqueItems"
          FROM "InventorySnapshot"
          ORDER BY "userId", "createdAt" DESC
        ) latest
        WHERE "uniqueItems" > (
          SELECT "uniqueItems" FROM "InventorySnapshot"
          WHERE "userId" = ${BigInt(userId)}
          ORDER BY "createdAt" DESC LIMIT 1
        )
      `,
    ]);

    return NextResponse.json({
        rapRank:    rapRank[0]?.rank != null ? Number(rapRank[0].rank) : null,
        itemsRank:  itemsRank[0]?.rank != null ? Number(itemsRank[0].rank) : null,
        uniqueRank: uniqueRank[0]?.rank != null ? Number(uniqueRank[0].rank) : null,
    });
  } catch (error) {
    console.error('Rank API error:', error);
    return NextResponse.json({ error: 'Failed to fetch ranks' }, { status: 500 });
  }
}