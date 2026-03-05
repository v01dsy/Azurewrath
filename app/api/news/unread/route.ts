// app/api/news/unread/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/news/unread?userId=xxx — returns count of unread published posts
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ unread: 0 });

  try {
    const userIdBig = BigInt(userId);

    // Count published, non-deleted posts this user hasn't read yet
    const unread = await prisma.post.count({
      where: {
        published: true,
        deletedAt: null,
        newsReads: {
          none: { userId: userIdBig },
        },
      },
    });

    return NextResponse.json({ unread });
  } catch {
    return NextResponse.json({ unread: 0 });
  }
}