import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hasRole } from '@/lib/roles';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const post = await prisma.post.findUnique({
    where: { id: Number(id) },
    include: { author: { select: { username: true, avatarUrl: true } } },
  });
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
  if (!hasRole(session.user.role, 'moderator')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.post.delete({ where: { id: Number(id) } });
  return NextResponse.json({ success: true });
}