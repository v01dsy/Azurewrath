import { NextResponse } from 'next/server';
import { fetchRobloxUserInfo } from '../../../../lib/robloxApi';


// For demonstration, use a hardcoded userId. Replace with session/cookie logic for real auth.
const DEMO_USER_ID = "1";

export async function GET() {
  // In production, get userId from session/cookie/auth
  const userId = DEMO_USER_ID;
  const userInfo = await fetchRobloxUserInfo(userId);
  if (!userInfo) {
    return NextResponse.json({
      username: "guest",
      avatar: `https://www.roblox.com/headshot-thumbnail/image?userId=1&width=150&height=150&format=png`,
      level: 1,
      totalRap: 0,
      totalItems: 0
    });
  }
  return NextResponse.json({
    username: userInfo.name,
    displayName: userInfo.displayName,
    description: userInfo.description,
    created: userInfo.created,
    id: userInfo.id,
    avatar: `https://www.roblox.com/headshot-thumbnail/image?userId=${userInfo.id}&width=150&height=150&format=png`,
    // Add more fields as needed
  });
}
