// app/api/auth/bio/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: NextRequest) {
  try {
    const { robloxUserId, username, displayName, avatarUrl, description } = await request.json();

    if (!robloxUserId || !username) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const userIdBigInt = BigInt(robloxUserId);

    // Upsert user, set authMethod to "bio"
    const user = await prisma.user.upsert({
      where: { robloxUserId: userIdBigInt },
      update: {
        username,
        displayName,
        avatarUrl,
        description,
        authMethod: 'bio',
        updatedAt: new Date(),
      },
      create: {
        robloxUserId: userIdBigInt,
        username,
        displayName,
        avatarUrl,
        description,
        authMethod: 'bio',
      },
    });

    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Delete any existing sessions for this user
    await prisma.session.deleteMany({ where: { userId: userIdBigInt } });

    // Create new session
    await prisma.session.create({
      data: {
        sessionToken,
        userId: userIdBigInt,
        expires: expiresAt,
        authMethod: 'bio',
      },
    });

    const response = NextResponse.json({
      success: true,
      user: {
        robloxUserId: user.robloxUserId.toString(),
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        authMethod: 'bio',
      },
    });

    // Set HTTP-only secure cookie (same as OAuth)
    response.cookies.set({
      name: 'session',
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Bio auth error:', error);
    return NextResponse.json(
      { error: 'Bio auth failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}