// app/api/dev/impersonate/route.ts
// ⚠️ DEVELOPMENT ONLY — never runs in production
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  // Hard block in production — belt AND suspenders
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { robloxUserId } = await request.json();

  if (!robloxUserId) {
    return NextResponse.json({ error: 'Missing robloxUserId' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { robloxUserId: BigInt(robloxUserId) },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found in DB — have they been scanned?' }, { status: 404 });
  }

  // Create a session for this user
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.session.deleteMany({ where: { userId: user.robloxUserId } });
  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.robloxUserId,
      expires: expiresAt,
      authMethod: 'dev',
    },
  });

  const response = NextResponse.json({
    success: true,
    user: {
      robloxUserId: user.robloxUserId.toString(),
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      authMethod: 'dev',
    },
  });

  response.cookies.set({
    name: 'session',
    value: sessionToken,
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return response;
}