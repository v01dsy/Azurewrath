// app/api/user/role/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  try {
    const user = await prisma.user.findUnique({
      where: { robloxUserId: BigInt(userId) },
      select: { role: true },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    return NextResponse.json({ role: user.role });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch role' }, { status: 500 });
  }
}