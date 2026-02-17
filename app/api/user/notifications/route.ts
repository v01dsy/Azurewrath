import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - fetch notifications for a user (latest 30, unread first)
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const userIdBigInt = BigInt(userId);

    const notifications = await prisma.notification.findMany({
      where: { userId: userIdBigInt },
      orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
      take: 30,
      include: {
        item: {
          select: { assetId: true, name: true, imageUrl: true },
        },
      },
    });

    const unreadCount = notifications.filter((n) => !n.read).length;

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        oldValue: n.oldValue,
        newValue: n.newValue,
        read: n.read,
        createdAt: n.createdAt,
        item: {
          assetId: n.item.assetId.toString(),
          name: n.item.name,
          imageUrl: n.item.imageUrl,
        },
      })),
      unreadCount,
    });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

// PATCH - mark notifications as read (pass ids[] to mark specific ones, or markAll=true)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, ids, markAll } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const userIdBigInt = BigInt(userId);

    if (markAll) {
      await prisma.notification.updateMany({
        where: { userId: userIdBigInt, read: false },
        data: { read: true },
      });
    } else if (ids && Array.isArray(ids) && ids.length > 0) {
      await prisma.notification.updateMany({
        where: { userId: userIdBigInt, id: { in: ids } },
        data: { read: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}