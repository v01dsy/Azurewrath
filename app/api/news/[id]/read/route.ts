// app/api/news/[id]/read/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/news/[id]/read — marks a post as read for the session user
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sessionToken = req.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ ok: false });

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    select: { userId: true, expires: true },
  });
  if (!session || session.expires < new Date()) return NextResponse.json({ ok: false });

  await prisma.newsRead.upsert({
    where: { userId_postId: { userId: session.userId, postId: Number(id) } },
    update: {},
    create: { userId: session.userId, postId: Number(id) },
  });

  return NextResponse.json({ ok: true });
}