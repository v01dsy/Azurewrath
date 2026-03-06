// app/api/admin/manipulation-flags/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hasRole } from '@/lib/roles';

async function getSession(req: NextRequest, bodyUserId?: string) {
  // Try cookie first
  const token = req.cookies.get('session')?.value;
  if (token) {
    const s = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: { user: true },
    });
    if (s && s.expires > new Date()) return s;
  }

  // Fall back to userId from query param OR body (PATCH sends it in body)
  const userId = req.nextUrl.searchParams.get('userId') ?? bodyUserId;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { robloxUserId: BigInt(userId) },
    });
    if (user) return { user };
  }

  return null;
}

// GET /api/admin/manipulation-flags?status=pending&type=all
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || !hasRole(session.user.role, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get('status') ?? 'pending';
  const type   = req.nextUrl.searchParams.get('type');

  const flags = await prisma.manipulationFlag.findMany({
    where: {
      status,
      ...(type ? { flagType: type } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      item: {
        select: {
          assetId: true,
          name: true,
          imageUrl: true,
          manipulated: true,
          manipulatedAt: true,
          manipulatedRap: true,
          priceHistory: {
            orderBy: { timestamp: 'asc' },
            select: { rap: true, price: true, timestamp: true },
          },
        },
      },
      reviewer: { select: { username: true } },
    },
    take: 100,
  });

  return NextResponse.json(flags.map(f => ({
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
        .filter(p => new Date(p.timestamp) >= new Date(Date.now() - 14 * 86400_000))
        .map(p => ({ rap: p.rap, price: p.price, timestamp: p.timestamp })),
    },
  })));
}

// PATCH /api/admin/manipulation-flags
// body: { id, action: 'accept' | 'dismiss', userId }
export async function PATCH(req: NextRequest) {
  // Must clone body — we need userId for auth AND id/action for the update
  const body = await req.json();
  const { id, action, userId } = body;

  // Pass userId from body into getSession so auth works without a cookie
  const session = await getSession(req, userId);
  if (!session || !hasRole(session.user.role, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!id || !['accept', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const flag = await prisma.manipulationFlag.findUnique({
    where: { id },
    include: { item: true },
  });
  if (!flag) return NextResponse.json({ error: 'Flag not found' }, { status: 404 });

  await prisma.manipulationFlag.update({
    where: { id },
    data: {
      status: action === 'accept' ? 'accepted' : 'dismissed',
      reviewedBy: session.user.robloxUserId,
      reviewedAt: new Date(),
    },
  });

  if (action === 'accept') {
    if (flag.flagType === 'manipulation') {
      await prisma.item.update({
        where: { assetId: flag.assetId },
        data: {
          manipulated: true,
          manipulatedAt: new Date(),
          manipulatedRap: flag.rapAtFlag,
        },
      });
    } else if (flag.flagType === 'unmark_suggestion') {
      await prisma.item.update({
        where: { assetId: flag.assetId },
        data: {
          manipulated: false,
          manipulatedAt: null,
          manipulatedRap: null,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}