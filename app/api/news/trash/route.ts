// app/api/news/trash/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hasRole } from '@/lib/roles';

async function getSession(req: NextRequest) {
  const sessionToken = req.cookies.get('session')?.value;
  if (!sessionToken) return null;
  return prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  });
}

// GET /api/news/trash — list all soft-deleted posts (owner only)
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.expires < new Date()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasRole(session.user.role, 'owner')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const posts = await prisma.post.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
    include: {
      author: { select: { username: true, avatarUrl: true, role: true } },
    },
  });

  const deleterIds = [...new Set(posts.map(p => p.deletedById).filter(Boolean))] as bigint[];
  const deleters = await prisma.user.findMany({
    where: { robloxUserId: { in: deleterIds } },
    select: { robloxUserId: true, username: true },
  });
  const deleterMap = Object.fromEntries(deleters.map(d => [d.robloxUserId.toString(), d.username]));

  return NextResponse.json(
    posts.map(p => ({
      ...p,
      authorId: p.authorId.toString(),
      deletedById: p.deletedById?.toString() ?? null,
      deletedByUsername: p.deletedById ? (deleterMap[p.deletedById.toString()] ?? 'Unknown') : null,
    }))
  );
}

// PATCH /api/news/trash — restore a post (owner only)
export async function PATCH(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.expires < new Date()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasRole(session.user.role, 'owner')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const post = await prisma.post.findUnique({ where: { id: Number(id) } });
  if (!post || !post.deletedAt) return NextResponse.json({ error: 'Not found in trash' }, { status: 404 });

  await prisma.post.update({
    where: { id: Number(id) },
    data: { deletedAt: null, deletedById: null, deletedReason: null },
  });

  return NextResponse.json({ success: true });
}