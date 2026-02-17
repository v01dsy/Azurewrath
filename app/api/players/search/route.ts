// app/api/players/search/route.ts
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
        select: {
          robloxUserId: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
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
        select: {
          robloxUserId: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      });
    }

    // Transform to match the frontend format
    // Convert ALL BigInt fields to strings for JSON serialization
    const players = users.map(user => ({
      id: String(user.robloxUserId),
      assetId: String(user.robloxUserId),
      name: user.username,
      displayName: user.displayName || user.username,
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