import { NextRequest, NextResponse } from 'next/server';

import prisma from '../../../../lib/prisma';
import { fetchRobloxUserInfo, fetchRobloxHeadshotUrl } from '../../../../lib/robloxApi';

export async function POST(req: NextRequest) {
  const body = await req.json();
  let { robloxUserId, username, displayName, avatarUrl, description } = body;
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
    const user = await prisma.user.upsert({
      where: { robloxUserId },
      update: { username, displayName, avatarUrl, description },
      create: { robloxUserId, username, displayName, avatarUrl, description },
    });
    return NextResponse.json(user);
  } catch (error) {
    let message = 'Failed to upsert user';
    if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
      message = (error as any).message;
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
