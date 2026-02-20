// app/api/user/upsert/route.ts
import { NextRequest, NextResponse } from 'next/server';

import prisma from '../../../../lib/prisma';
import { fetchRobloxUserInfo, fetchRobloxHeadshotUrl } from '../../../../lib/robloxApi';

export async function POST(req: NextRequest) {
  const body = await req.json();
  let { robloxUserId, username, displayName, avatarUrl, description } = body;
  
  // Convert robloxUserId to string first (in case it's a number from API)
  robloxUserId = robloxUserId?.toString();
  
  // If only robloxUserId is provided, fetch Roblox info and headshot
  if (robloxUserId && (!username || !avatarUrl)) {
    const robloxInfo = await fetchRobloxUserInfo(robloxUserId);
    if (!robloxInfo) {
      return NextResponse.json({ error: 'Roblox user not found' }, { status: 404 });
    }
    username = robloxInfo.name;
    displayName = robloxInfo.displayName;
    description = robloxInfo.description;
    avatarUrl = await fetchRobloxHeadshotUrl(robloxUserId);
  }
  
  if (!robloxUserId || !username) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  
  try {
    // IMPORTANT: Convert string to BigInt for Prisma
    const robloxUserIdBigInt = BigInt(robloxUserId);
    
    const user = await prisma.user.upsert({
      where: { 
        robloxUserId: robloxUserIdBigInt 
      },
      update: { 
        username, 
        displayName, 
        avatarUrl, 
        description 
      },
      create: { 
        robloxUserId: robloxUserIdBigInt, 
        username, 
        displayName, 
        avatarUrl, 
        description 
      },
    });
    
    // Convert BigInt back to string for JSON response
    return NextResponse.json({
      ...user,
      robloxUserId: user.robloxUserId.toString()
    });
  } catch (error) {
    console.error('User upsert error:', error);
    let message = 'Failed to upsert user';
    if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
      message = (error as any).message;
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}