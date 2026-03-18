// app/api/roblox/user-profile/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }
  try {
    const res = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`);
    if (!res.ok) {
      return NextResponse.json({ error: `Roblox API returned ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch from Roblox' }, { status: 500 });
  }
}
