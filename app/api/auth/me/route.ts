// app/api/auth/me/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    
    if (!sessionCookie) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    
    const session = JSON.parse(sessionCookie.value);
    
    return NextResponse.json({ 
      user: {
        userId: session.userId,
        username: session.username,
        avatar: session.avatar,
      }
    });
  } catch (error) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
}