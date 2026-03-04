// app/api/news/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hasRole } from '@/lib/roles';

export async function GET() {
  const posts = await prisma.post.findMany({
    where: { published: true, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { username: true, avatarUrl: true, role: true } } },
  });
  return NextResponse.json(posts.map(p => ({ ...p, authorId: p.authorId.toString() })));
}

export async function POST(req: NextRequest) {
  const sessionToken = req.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  });
  if (!session || session.expires < new Date()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasRole(session.user.role, 'moderator')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { title, content, excerpt, published } = await req.json();
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();

  const post = await prisma.post.create({
    data: { title, slug, content, excerpt, published: published ?? false, authorId: session.user.robloxUserId },
  });

  return NextResponse.json({ id: post.id }, { status: 201 });
}