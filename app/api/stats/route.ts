import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const [userCount, itemCount, uaidCount] = await Promise.all([
    prisma.user.count(),
    prisma.item.count(),
    prisma.inventoryItem.count(), // No filter needed - just count all rows
  ]);

  return NextResponse.json({
    users: userCount,
    itemsTracked: itemCount,
    uaidsTracked: uaidCount,
  });
}