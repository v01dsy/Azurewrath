// app/api/players/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sort = searchParams.get('sort') || 'rap'; // rap | items | unique
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 99999);
    const skip = (page - 1) * limit;

    const users = await prisma.user.findMany({
      include: {
        inventorySnapshots: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            createdAt: true,
            totalRAP: true,
            totalItems: true,
            uniqueItems: true,
          },
        },
      },
    });

    type UserWithSnapshot = (typeof users)[number];

    const scannedUsers = users.filter(
      (u: UserWithSnapshot) => u.inventorySnapshots.length > 0
    );

    scannedUsers.sort((a: UserWithSnapshot, b: UserWithSnapshot) => {
      const aSnap = a.inventorySnapshots[0];
      const bSnap = b.inventorySnapshots[0];
      if (sort === 'rap') return (bSnap?.totalRAP ?? 0) - (aSnap?.totalRAP ?? 0);
      if (sort === 'items') return (bSnap?.totalItems ?? 0) - (aSnap?.totalItems ?? 0);
      if (sort === 'unique') return (bSnap?.uniqueItems ?? 0) - (aSnap?.uniqueItems ?? 0);
      return 0;
    });

    const total = scannedUsers.length;
    const totalPages = Math.ceil(total / limit);
    const paginated = scannedUsers.slice(skip, skip + limit);

    const players = paginated.map((u: UserWithSnapshot, idx: number) => ({
      rank: skip + idx + 1,
      robloxUserId: u.robloxUserId.toString(),
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      totalRAP: u.inventorySnapshots[0]?.totalRAP ?? 0,
      totalItems: u.inventorySnapshots[0]?.totalItems ?? 0,
      uniqueItems: u.inventorySnapshots[0]?.uniqueItems ?? 0,
      lastScanned: u.inventorySnapshots[0]?.createdAt ?? null,
    }));

    return NextResponse.json({ players, total, totalPages, page, limit });
  } catch (error) {
    console.error('Players API error:', error);
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}