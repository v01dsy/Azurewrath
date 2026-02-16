// app/api/auth/roblox/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper function to generate a secure session token
function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, code_verifier } = body;
    
    if (!code || !code_verifier) {
      return NextResponse.json(
        { error: 'Missing code or code_verifier' },
        { status: 400 }
      );
    }
    
    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://apis.roblox.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: process.env.ROBLOX_CLIENT_ID!,
        client_secret: process.env.ROBLOX_CLIENT_SECRET!,
        redirect_uri: process.env.NEXT_PUBLIC_APP_URL + '/verify',
        code_verifier: code_verifier,
      }),
    });
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Token exchange failed:', error);
      return NextResponse.json(
        { error: 'Token exchange failed', details: error },
        { status: 400 }
      );
    }
    
    const tokens = await tokenResponse.json();
    
    // Get user info from Roblox
    const userInfoResponse = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });
    
    if (!userInfoResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to get user info' },
        { status: 400 }
      );
    }
    
    const userInfo = await userInfoResponse.json();
    
    console.log('Roblox User Info:', userInfo);
    
    // Upsert user in database
    const user = await prisma.user.upsert({
      where: {
        robloxUserId: userInfo.sub,
      },
      update: {
        username: userInfo.preferred_username,
        displayName: userInfo.preferred_username,
        avatarUrl: userInfo.picture || null,
        updatedAt: new Date(),
      },
      create: {
        robloxUserId: userInfo.sub,
        username: userInfo.preferred_username,
        displayName: userInfo.preferred_username,
        avatarUrl: userInfo.picture || null,
        description: null,
      },
    });
    
    // Generate session token
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    // Delete any existing sessions for this user - using executeRaw
    await prisma.$executeRaw`DELETE FROM "Session" WHERE "userId" = ${user.id}`;
    
    // Create new session in database - using executeRaw
    const sessionId = crypto.randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO "Session" ("id", "sessionToken", "userId", "expires", "createdAt", "updatedAt")
      VALUES (${sessionId}, ${sessionToken}, ${user.id}, ${expiresAt}, ${now}, ${now})
    `;
    
    // Create response with user data
    const response = NextResponse.json({ 
      success: true,
      user: {
        robloxUserId: user.robloxUserId,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      }
    });
    
    // Set HTTP-only secure cookie
    response.cookies.set({
      name: 'session',
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days in seconds
      path: '/',
    });
    
    console.log('Session created successfully for user:', user.robloxUserId);
    
    return response;
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.json(
      { error: 'OAuth process failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}