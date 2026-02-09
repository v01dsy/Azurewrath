import { NextResponse } from 'next/server';
import { fetchRobloxUserInfo } from '../../../../lib/robloxApi';
import prisma from '../../../../lib/prisma';



// For demonstration, use a hardcoded userId. Replace with session/cookie logic for real auth.
const DEMO_USER_ID = "1";

export async function GET(request: Request) {
  // In production, get userId from session/cookie/auth or query param
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || DEMO_USER_ID;

  // Check if user exists in our database
  const dbUser = await prisma.user.findUnique({ where: { robloxUserId: userId } });
  if (!dbUser) {
    return NextResponse.json({
      error: 'User not found in database',
      message: 'This user is not in our database. Would you like to add them?'
    }, { status: 404 });
  }

  // If user exists, return their profile from the database
  return NextResponse.json({
    username: dbUser.username,
    displayName: dbUser.displayName,
    description: dbUser.description,
    id: dbUser.robloxUserId,
    avatar: dbUser.avatarUrl,
    created: dbUser.createdAt,
    // Add more fields as needed
  });
}
