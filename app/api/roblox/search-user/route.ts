// app/api/roblox/search-user/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  if (!username) {
    return NextResponse.json({ error: 'Missing username' }, { status: 400 });
  }
  try {
    const robloxRes = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}`);
    return NextResponse.json(robloxRes.data);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch from Roblox' }, { status: 500 });
  }
}
