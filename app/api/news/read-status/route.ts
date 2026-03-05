// app/api/news/read-status/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/news/read-status?userId=xxx — returns array of post IDs the user has read
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ readPostIds: [] });

  try {
    const reads = await prisma.newsRead.findMany({
      where: { userId: BigInt(userId) },
      select: { postId: true },
    });
    return NextResponse.json({ readPostIds: reads.map(r => r.postId) });
  } catch {
    return NextResponse.json({ readPostIds: [] });
  }
}