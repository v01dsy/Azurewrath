import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hasRole } from '@/lib/roles';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const post = await prisma.post.findUnique({
    where: { slug: params.slug },
    include: { author: { select: { username: true, avatarUrl: true } } },
  });
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(post);
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const sessionToken = req.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  });
  if (!session || session.expires < new Date()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasRole(session.user.role, 'moderator')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.post.delete({ where: { slug: params.slug } });
  return NextResponse.json({ success: true });
}