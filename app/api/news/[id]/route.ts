// app/api/news/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { canDeletePost } from '@/lib/roles';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const post = await prisma.post.findUnique({
    where: { id: Number(id) },
    include: { author: { select: { username: true, avatarUrl: true, role: true } } },
  });

  if (!post || post.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ...post, authorId: post.authorId.toString() });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sessionToken = req.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  });
  if (!session || session.expires < new Date()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const post = await prisma.post.findUnique({
    where: { id: Number(id) },
    include: { author: { select: { role: true } } },
  });
  if (!post || post.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isSelfDelete = session.user.robloxUserId === post.authorId;

  if (!isSelfDelete && !canDeletePost(session.user.role, post.author.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { reason } = await req.json().catch(() => ({ reason: undefined }));

  await prisma.post.update({
    where: { id: Number(id) },
    data: {
      deletedAt: new Date(),
      deletedById: session.user.robloxUserId,
      deletedReason: reason ?? null,
    },
  });

  return NextResponse.json({ success: true });
}