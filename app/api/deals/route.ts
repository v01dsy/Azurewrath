// app/api/deals/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const revalidate = 0;

export async function GET() {
  try {
    const items = await prisma.$queryRaw<Array<{
      assetId: bigint;
      name: string;
      imageUrl: string | null;
      price: number;
      rap: number;
      timestamp: Date;
      manipulated: boolean;
    }>>`
      SELECT 
        i."assetId",
        i.name,
        i."imageUrl",
        i.manipulated,
        ph.price,
        ph.rap,
        ph.timestamp
      FROM "Item" i
      INNER JOIN LATERAL (
        SELECT price, rap, timestamp
        FROM "PriceHistory"
        WHERE "itemId" = i."assetId"
        ORDER BY timestamp DESC
        LIMIT 1
      ) ph ON true
      WHERE ph.rap > 0
        AND ph.price IS NOT NULL
        AND ph.price > 0
        AND ph.price < ph.rap
        AND ((ph.rap - ph.price) / ph.rap * 100) > 0
      ORDER BY ((ph.rap - ph.price) / ph.rap * 100) DESC
    `;

    const deals = items.map(item => {
      const rap = item.rap;
      const bestPrice = item.price;
      const percent = Math.round(((rap - bestPrice) / rap) * 100);

      return {
        assetId: item.assetId.toString(),
        name: item.name,
        imageUrl: item.imageUrl,
        manipulated: item.manipulated,
        percent,
        rap,
        bestPrice,
        timestamp: item.timestamp?.toISOString() ?? null,
      };
    });

    return NextResponse.json(deals);
  } catch (error) {
    console.error("Error fetching deals:", error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}