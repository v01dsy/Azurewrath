import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hasRole } from '@/lib/roles';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const post = await prisma.post.findUnique({
    where: { id: Number(id) },
    include: { author: { select: { username: true, avatarUrl: true, role: true } } },
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

  const post = await prisma.post.findUnique({
    where: { id: Number(id) },
    include: { author: { select: { role: true } } },
  });
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deleterRole = session.user.role;
  const authorRole = post.author.role;

  const roleRank: Record<string, number> = { owner: 3, admin: 2, moderator: 1, user: 0 };

  const deleterRank = roleRank[deleterRole] ?? 0;
  const authorRank = roleRank[authorRole] ?? 0;

  const isSelfDelete = session.user.robloxUserId === post.authorId;

  if (deleterRank < 1 || (!isSelfDelete && deleterRank <= authorRank)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.post.delete({ where: { id: Number(id) } });
  return NextResponse.json({ success: true });
}