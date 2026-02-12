import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';

    let users;
    if (query.length < 1) {
      // No query: return all users (up to 20)
      users = await prisma.user.findMany({
        take: 20,
      });
    } else {
      // Query: search by username
      users = await prisma.user.findMany({
        where: {
          username: {
            contains: query,
            mode: 'insensitive',
          },
        },
        take: 20,
      });
    }

    // Transform to match the frontend format
    const players = users.map(user => ({
      id: user.id,
      assetId: user.robloxUserId, // Using robloxUserId for consistency
      name: user.username,
      displayName: user.displayName,
      imageUrl: user.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${user.robloxUserId}&width=150&height=150&format=png`,
    }));

    console.log(`Player search query: "${query}", found: ${players.length} players`);
    return NextResponse.json(players);
  } catch (error) {
    console.error('Player search error:', error);
    return NextResponse.json(
      { error: 'Player search failed', details: String(error) },
      { status: 500 }
    );
  }
}