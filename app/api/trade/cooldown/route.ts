import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const COOLDOWN_MS = 3 * 60 * 1000;

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ secondsLeft: 0 });

  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    select: { userId: true, expires: true },
  });
  if (!session || session.expires < new Date()) return NextResponse.json({ secondsLeft: 0 });

  const lastAd = await prisma.tradeAd.findFirst({
    where: { userId: session.userId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (!lastAd) return NextResponse.json({ secondsLeft: 0 });

  const elapsed = Date.now() - lastAd.createdAt.getTime();
  const secondsLeft = Math.max(0, Math.ceil((COOLDOWN_MS - elapsed) / 1000));
  return NextResponse.json({ secondsLeft });
}