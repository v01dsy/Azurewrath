// app/api/items/[id]/manipulated/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { assetId, userId } = body;

    if (!assetId || !userId) {
      return NextResponse.json({ error: 'Missing assetId or userId' }, { status: 400 });
    }

    // Fetch user and check role
    const user = await prisma.user.findUnique({
      where: { robloxUserId: BigInt(userId) },
      select: { role: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!hasPermission(user.role, 'toggle_manipulated')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Toggle manipulated
    const item = await prisma.item.findUnique({
      where: { assetId: BigInt(assetId) },
      select: { manipulated: true },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const updated = await prisma.item.update({
      where: { assetId: BigInt(assetId) },
      data: { manipulated: !item.manipulated },
    });

    return NextResponse.json({ manipulated: updated.manipulated });

  } catch (error) {
    console.error('Error toggling manipulated:', error);
    return NextResponse.json({ error: 'Failed to toggle manipulated' }, { status: 500 });
  }
}