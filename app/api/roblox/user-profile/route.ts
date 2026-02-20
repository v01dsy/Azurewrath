// app/api/roblox/user-profile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }
  try {
    const robloxRes = await axios.get(`https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`);
    return NextResponse.json(robloxRes.data);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch from Roblox' }, { status: 500 });
  }
}
