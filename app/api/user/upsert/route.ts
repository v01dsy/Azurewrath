import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  const body = await req.json();
  let { robloxUserId, username, displayName, avatarUrl, description } = body;
  // Ensure robloxUserId is a string
  robloxUserId = robloxUserId.toString();
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
    return NextResponse.json({ error: error?.message || 'Failed to upsert user' }, { status: 500 });
  }
}
