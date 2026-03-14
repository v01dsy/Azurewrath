// app/api/trade/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hasRole } from '@/lib/roles';
import '@/lib/bigint-patch';

async function getSession(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({
    where: { sessionToken: token },
    include: { user: true },
  });
  if (!s || s.expires < new Date()) return null;
  return s;
}

function mapItem(i: any) {
  return {
    id: i.id,
    assetId: i.item.assetId.toString(),
    name: i.item.name,
    imageUrl: i.item.imageUrl,
    manipulated: i.item.manipulated,
    rap: i.item.priceHistory[0]?.rap ?? null,
    userAssetId: i.userAssetId?.toString() ?? null,
    serialNumber: i.serialNumber ?? null,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const ad = await prisma.tradeAd.findUnique({
    where: { id: Number(id) },
    include: {
      user: {
        select: {
          robloxUserId: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      items: {
        include: {
          item: {
            select: {
              assetId: true,
              name: true,
              imageUrl: true,
              manipulated: true,
              priceHistory: {
                select: { rap: true },
                orderBy: { timestamp: 'desc' },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!ad) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Deleted ads — only admins can view
  if (ad.deletedAt) {
    const session = await getSession(req);
    if (!session || !hasRole(session.user.role, 'admin')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  return NextResponse.json({
    id: ad.id,
    note: ad.note,
    active: ad.active,
    offerRobux: ad.offerRobux,
    requestRobux: ad.requestRobux,
    deletedAt: ad.deletedAt,
    createdAt: ad.createdAt,
    user: {
      robloxUserId: ad.user.robloxUserId.toString(),
      username: ad.user.username,
      displayName: ad.user.displayName,
      avatarUrl: ad.user.avatarUrl,
    },
    offerItems:   ad.items.filter(i => i.side === 'offer').map(mapItem),
    requestItems: ad.items.filter(i => i.side === 'request').map(mapItem),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ad = await prisma.tradeAd.findUnique({
    where: { id: Number(id) },
    select: { userId: true, deletedAt: true },
  });
  if (!ad) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (ad.deletedAt) return NextResponse.json({ error: 'Already deleted' }, { status: 410 });
  if (ad.userId !== session.user.robloxUserId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.tradeAd.update({
    where: { id: Number(id) },
    data: { active: false, deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}