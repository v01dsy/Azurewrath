// app/api/auth/roblox/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';

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
        redirect_uri: process.env.ROBLOX_REDIRECT_URI!,
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
    
    // Get user info
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
    
    // Return user info so the client can store it in localStorage
    return NextResponse.json({ 
      success: true,
      user: {
        robloxUserId: userInfo.sub,
        username: userInfo.preferred_username,
        displayName: userInfo.preferred_username, // Roblox doesn't give display name in OAuth, so we use username
        avatarUrl: userInfo.picture,
      }
    });
    
  } catch (error) {
    console.error('OAuth error:', error);
    return NextResponse.json(
      { error: 'OAuth process failed' },
      { status: 500 }
    );
  }
}