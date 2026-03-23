// app/api/trade/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import '@/lib/bigint-patch';

const COOLDOWN_MS = 3 * 60 * 1000;

// ─── GET /api/trade ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const skip = Number(searchParams.get('skip') ?? 0);
  const take = Number(searchParams.get('take') ?? 10);
  const assetId = searchParams.get('assetId');

  const where: Record<string, unknown> = { active: true, deletedAt: null, id: { gt: 0 } };
  if (assetId) {
    where.items = { some: { side: 'request', assetId: BigInt(assetId) } };
  }

  try {
    const [ads, total] = await prisma.$transaction([
      prisma.tradeAd.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: {
            select: { username: true, displayName: true, avatarUrl: true, robloxUserId: true },
          },
          items: {
            include: {
              item: {
                select: {
                  name: true,
                  imageUrl: true,
                  assetId: true,
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
      }),
      prisma.tradeAd.count({ where }),
    ]);

    const mapItem = (ti: typeof ads[0]['items'][0]) => ({
      id: ti.id,
      assetId: ti.item.assetId.toString(),
      name: ti.item.name,
      imageUrl: ti.item.imageUrl,
      manipulated: ti.item.manipulated,
      rap: ti.item.priceHistory[0]?.rap ?? null,
      userAssetId: ti.userAssetId?.toString() ?? null,
      serialNumber: ti.serialNumber ?? null,
    });

    const serialize = (ad: typeof ads[0]) => ({
      id: ad.id,
      note: ad.note,
      active: ad.active,
      offerRobux: ad.offerRobux,
      requestRobux: ad.requestRobux,
      createdAt: ad.createdAt.toISOString(),
      user: {
        robloxUserId: ad.user.robloxUserId.toString(),
        username: ad.user.username,
        displayName: ad.user.displayName,
        avatarUrl: ad.user.avatarUrl,
      },
      offerItems:   ad.items.filter(i => i.side === 'offer').map(mapItem),
      requestItems: ad.items.filter(i => i.side === 'request').map(mapItem),
    });

    return NextResponse.json({ ads: ads.map(serialize), total });
  } catch (err) {
    console.error('GET /api/trade error:', err);
    return NextResponse.json({ error: 'Failed to fetch trade ads' }, { status: 500 });
  }
}

// ─── POST /api/trade ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const sessionToken = req.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    select: { userId: true, expires: true },
  });
  if (!session || session.expires < new Date())
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });

  const body = await req.json();
  const { note, offerRobux = 0, requestRobux = 0, offerItems = [], requestItems = [] } = body;

  const offerRobuxInt   = Math.max(0, Math.floor(Number(offerRobux)   || 0));
  const requestRobuxInt = Math.max(0, Math.floor(Number(requestRobux) || 0));

  if (offerRobuxInt > 999_999_999 || requestRobuxInt > 999_999_999)
    return NextResponse.json({ error: 'Robux value too large' }, { status: 400 });

  if (offerItems.length === 0 && requestItems.length === 0 && offerRobuxInt === 0 && requestRobuxInt === 0)
    return NextResponse.json({ error: 'Trade ad must have at least one item or Robux' }, { status: 400 });

  // Cooldown check
  const lastAd = await prisma.tradeAd.findFirst({
    where: { userId: session.userId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (lastAd) {
    const elapsed = Date.now() - lastAd.createdAt.getTime();
    if (elapsed < COOLDOWN_MS) {
      const secondsLeft = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json({ error: 'Cooldown', secondsLeft }, { status: 429 });
    }
  }

  try {
    const poster = await prisma.user.findUnique({
      where: { robloxUserId: session.userId },
      select: { username: true },
    });

    const ad = await prisma.tradeAd.create({
      data: {
        userId:       session.userId,
        note:         note?.trim() || null,
        offerRobux:   offerRobuxInt,
        requestRobux: requestRobuxInt,
        items: {
          create: [
            ...offerItems.map((item: { assetId: string; userAssetId?: string; serialNumber?: number }) => ({
              side:         'offer',
              assetId:      BigInt(item.assetId),
              userAssetId:  item.userAssetId ? BigInt(item.userAssetId) : null,
              serialNumber: item.serialNumber ?? null,
            })),
            ...requestItems.map((item: { assetId: string }) => ({
              side:         'request',
              assetId:      BigInt(item.assetId),
              userAssetId:  null,
              serialNumber: null,
            })),
          ],
        },
      },
      include: {
        items: { include: { item: { select: { name: true, imageUrl: true } } } },
      },
    });

    // Notify watchlist users
    const allAssetIds = ad.items.map(i => i.assetId);
    const watchers = await prisma.watchlist.findMany({
      where: {
        itemId: { in: allAssetIds },
        tradeAlerts: true,
        userId: { not: session.userId },
      },
      select: { userId: true, itemId: true, tradeAlertType: true },
    });

    const seen = new Set<string>();
    const notifications = watchers.flatMap(w => {
      const adItem = ad.items.find(i => i.assetId === w.itemId);
      if (!adItem) return [];
      if (w.tradeAlertType === 'requesting' && adItem.side !== 'request') return [];
      if (w.tradeAlertType === 'offering'   && adItem.side !== 'offer')   return [];
      const key = `${w.userId}-${w.itemId}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        userId:   w.userId,
        itemId:   w.itemId,
        type:     'trade_ad',
        message:  `${poster?.username ?? 'Someone'} posted a trade ad ${adItem.side === 'request' ? 'requesting' : 'offering'} ${adItem.item.name}`,
        oldValue: ad.id,
        read:     false,
      }];
    });

    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
    }

    return NextResponse.json({ id: ad.id });
  } catch (err) {
    console.error('POST /api/trade error:', err);
    return NextResponse.json({ error: 'Failed to create trade ad' }, { status: 500 });
  }
}