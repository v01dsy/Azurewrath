// app/api/auth/session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('session')?.value;

    if (!sessionToken) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    // Look up session in DB
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });

    // No session found or expired
    if (!session || session.expires < new Date()) {
      // Clear the stale cookie
      const response = NextResponse.json({ user: null }, { status: 200 });
      response.cookies.set('session', '', { maxAge: 0, path: '/' });
      return response;
    }

    // Valid session — return user
    return NextResponse.json({
      user: {
        robloxUserId: session.user.robloxUserId.toString(),
        username: session.user.username,
        displayName: session.user.displayName,
        avatarUrl: session.user.avatarUrl,
        authMethod: session.authMethod,
      },
    });

  } catch (error) {
    console.error('Session check error:', error);
    return NextResponse.json({ user: null }, { status: 200 });
  }
}