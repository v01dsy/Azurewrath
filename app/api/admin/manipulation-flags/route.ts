// app/api/admin/manipulation-flags/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hasRole } from '@/lib/roles';

async function getSession(req: NextRequest, bodyUserId?: string) {
  const token = req.cookies.get('session')?.value;
  if (token) {
    const s = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: { user: true },
    });
    if (s && s.expires > new Date()) return s;
  }
  const userId = req.nextUrl.searchParams.get('userId') ?? bodyUserId;
  if (userId) {
    const user = await prisma.user.findUnique({ where: { robloxUserId: BigInt(userId) } });
    if (user) return { user };
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || !hasRole(session.user.role, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const status  = req.nextUrl.searchParams.get('status') ?? 'pending';
  const type    = req.nextUrl.searchParams.get('type');
  const skip    = parseInt(req.nextUrl.searchParams.get('skip') ?? '0', 10);
  const take    = parseInt(req.nextUrl.searchParams.get('take') ?? '10', 10);
  const sortBy  = req.nextUrl.searchParams.get('sortBy') ?? 'time';
  const sortDir = (req.nextUrl.searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  const where = { status, ...(type ? { flagType: type } : {}) };
  const secondSort = sortBy === 'overpay'
    ? { rapGrowthPct: sortDir }
    : { createdAt: sortDir };
  const orderBy = [
    { flagType: 'asc' as const },
    sortBy === 'overpay' ? { rapGrowthPct: sortDir } : { createdAt: sortDir },

  ] as any;

  const [flags, total] = await Promise.all([
    prisma.manipulationFlag.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        item: {
          select: {
            assetId: true, name: true, imageUrl: true,
            manipulated: true, manipulatedAt: true, manipulatedRap: true,
            priceHistory: {
              orderBy: { timestamp: 'asc' },
              select: { rap: true, price: true, timestamp: true },
            },
          },
        },
        reviewer: { select: { username: true } },
      },
    }),
    prisma.manipulationFlag.count({ where }),
  ]);

  return NextResponse.json({
    total,
    flags: flags.map(f => ({
      id: f.id,
      assetId: f.assetId.toString(),
      flagType: f.flagType,
      detectionMethod: f.detectionMethod ?? null,
      status: f.status,
      reason: f.reason,
      rapAtFlag: f.rapAtFlag,
      rapGrowthPct: f.rapGrowthPct,
      timeWindowHrs: f.timeWindowHrs,
      reviewedBy: f.reviewer?.username ?? null,
      reviewedAt: f.reviewedAt,
      createdAt: f.createdAt,
      item: {
        assetId: f.item.assetId.toString(),
        name: f.item.name,
        imageUrl: f.item.imageUrl,
        manipulated: f.item.manipulated,
        manipulatedAt: f.item.manipulatedAt,
        manipulatedRap: f.item.manipulatedRap,
        priceHistory: f.item.priceHistory
          .filter(ph => new Date(ph.timestamp) >= new Date(Date.now() - 14 * 86400_000))
          .map(ph => ({ rap: ph.rap, price: ph.price, timestamp: ph.timestamp })),
      },
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, action, userId } = body;
  const session = await getSession(req, userId);
  if (!session || !hasRole(session.user.role, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!id || !['accept', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const flag = await prisma.manipulationFlag.findUnique({ where: { id }, include: { item: true } });
  if (!flag) return NextResponse.json({ error: 'Flag not found' }, { status: 404 });

  await prisma.manipulationFlag.update({
    where: { id },
    data: { status: action === 'accept' ? 'accepted' : 'dismissed', reviewedBy: session.user.robloxUserId, reviewedAt: new Date() },
  });

  if (action === 'accept') {
    if (flag.flagType === 'manipulation') {
      await prisma.item.update({ where: { assetId: flag.assetId }, data: { manipulated: true, manipulatedAt: new Date(), manipulatedRap: flag.rapAtFlag } });
    } else if (flag.flagType === 'unmark_suggestion') {
      await prisma.item.update({ where: { assetId: flag.assetId }, data: { manipulated: false, manipulatedAt: null, manipulatedRap: null } });
    }
  }
  return NextResponse.json({ ok: true });
}