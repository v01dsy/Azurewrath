// app/api/load-user/[userid]/route.ts
import prisma from '@/lib/prisma';
import { fetchRobloxUserInfo, fetchRobloxHeadshotUrl } from '@/lib/robloxApi';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userid: string }> }
) {
  const { userid } = await params;
  
  try {
    const robloxInfo = await fetchRobloxUserInfo(userid);
    const avatarUrl = await fetchRobloxHeadshotUrl(robloxInfo.id.toString());
    
    await prisma.user.create({
      data: {
        robloxUserId: robloxInfo.id.toString(),
        username: robloxInfo.name,
        displayName: robloxInfo.displayName,
        avatarUrl: avatarUrl || '',
        description: robloxInfo.description,
      },
    });
    
    // Redirect back to the player page
    return NextResponse.redirect(new URL(`/player/${userid}`, request.url));
  } catch (error) {
    console.error('Failed to load user:', error);
    return new Response('Failed to load user from Roblox', { status: 500 });
  }
}