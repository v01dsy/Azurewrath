import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const revalidate = 300; // Cache for 5 minutes

export async function GET() {
  try {
    // Optimized query - only deals above 10%
    const items = await prisma.$queryRaw<Array<{
      assetId: string;
      name: string;
      imageUrl: string | null;
      price: number;
      rap: number;
      lowestResale: number | null;
    }>>`
      SELECT 
        i."assetId",
        i.name,
        i."imageUrl",
        ph.price,
        ph.rap,
        ph."lowestResale"
      FROM "Item" i
      INNER JOIN LATERAL (
        SELECT price, rap, "lowestResale"
        FROM "PriceHistory"
        WHERE "itemId" = i."assetId"
        ORDER BY timestamp DESC
        LIMIT 1
      ) ph ON true
      WHERE ph.rap > 0
        AND (ph."lowestResale" IS NOT NULL OR ph.price IS NOT NULL)
        AND COALESCE(ph."lowestResale", ph.price) < ph.rap
        AND ((ph.rap - COALESCE(ph."lowestResale", ph.price)) / ph.rap * 100) > 10
      ORDER BY ((ph.rap - COALESCE(ph."lowestResale", ph.price)) / ph.rap * 100) DESC
    `;

    // Quick calculation on already filtered data
    const deals = items.map(item => {
      const rap = item.rap;
      const bestPrice = item.lowestResale ?? item.price;
      const percent = Math.round(((rap - bestPrice) / rap) * 100);
      
      return {
        assetId: item.assetId,
        name: item.name,
        imageUrl: item.imageUrl,
        percent,
        rap,
        bestPrice
      };
    });

    return NextResponse.json(deals);
  } catch (error) {
    console.error("Error fetching deals:", error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}