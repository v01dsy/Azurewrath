// app/api/items/search/route.ts
import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

const PAGE_SIZE = 24;

type ItemRow = {
  assetId: bigint;
  name: string;
  imageUrl: string | null;
  manipulated: boolean;
  isLimitedUnique: boolean | null;
  rap: number | null;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') ?? '';
    const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const skip  = (page - 1) * PAGE_SIZE;

    const trimmed   = query.trim();
    const isNumeric = /^\d+$/.test(trimmed);

    let items: ItemRow[];
    let total: number;

    if (trimmed.length === 0) {
      [items, total] = await Promise.all([
        prisma.$queryRaw<ItemRow[]>`
          SELECT i."assetId", i.name, i."imageUrl", i.manipulated, i."isLimitedUnique", ph.rap
          FROM "Item" i
          LEFT JOIN LATERAL (
            SELECT rap FROM "PriceHistory"
            WHERE "itemId" = i."assetId"
            ORDER BY timestamp DESC LIMIT 1
          ) ph ON true
          WHERE i."assetId" != 1
          ORDER BY COALESCE(ph.rap, 0) DESC
          LIMIT ${PAGE_SIZE} OFFSET ${skip}
        `,
        prisma.item.count({ where: { assetId: { not: 1n } } }),
      ]);
    } else if (isNumeric) {
      const assetId = BigInt(trimmed);
      [items, total] = await Promise.all([
        prisma.$queryRaw<ItemRow[]>`
          SELECT i."assetId", i.name, i."imageUrl", i.manipulated, i."isLimitedUnique", ph.rap
          FROM "Item" i
          LEFT JOIN LATERAL (
            SELECT rap FROM "PriceHistory"
            WHERE "itemId" = i."assetId"
            ORDER BY timestamp DESC LIMIT 1
          ) ph ON true
          WHERE i."assetId" = ${assetId} AND i."assetId" != 1
          ORDER BY COALESCE(ph.rap, 0) DESC
          LIMIT ${PAGE_SIZE} OFFSET ${skip}
        `,
        prisma.item.count({ where: { assetId } }),
      ]);
    } else {
      const pattern = `%${trimmed}%`;
      [items, total] = await Promise.all([
        prisma.$queryRaw<ItemRow[]>`
          SELECT i."assetId", i.name, i."imageUrl", i.manipulated, i."isLimitedUnique", ph.rap
          FROM "Item" i
          LEFT JOIN LATERAL (
            SELECT rap FROM "PriceHistory"
            WHERE "itemId" = i."assetId"
            ORDER BY timestamp DESC LIMIT 1
          ) ph ON true
          WHERE i.name ILIKE ${pattern} AND i."assetId" != 1
          ORDER BY COALESCE(ph.rap, 0) DESC
          LIMIT ${PAGE_SIZE} OFFSET ${skip}
        `,
        prisma.item.count({ where: { name: { contains: trimmed, mode: 'insensitive' }, assetId: { not: 1n } } }),
      ]);
    }

    const serializedItems = items.map(item => ({
      assetId: item.assetId.toString(),
      name: item.name,
      imageUrl: item.imageUrl,
      manipulated: item.manipulated,
      isLimitedUnique: item.isLimitedUnique,
      priceHistory: item.rap != null ? [{ rap: Number(item.rap) }] : [],
    }));

    return NextResponse.json({
      items: serializedItems,
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(Number(total) / PAGE_SIZE),
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed', details: String(error) },
      { status: 500 }
    );
  }
}