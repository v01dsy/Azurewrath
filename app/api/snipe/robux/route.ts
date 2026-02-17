// app/api/snipe/robux/route.ts
// Proxies the Roblox economy API to return the user's Robux balance.
// The userId comes from the client session (localStorage) — we just
// proxy through so the Roblox API doesn't get hit with CORS errors.
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  try {
    const res = await fetch(`https://economy.roblox.com/v1/users/${userId}/currency`, {
      headers: {
        // This endpoint is public for any user — no auth cookie needed
        'Accept': 'application/json',
      },
      next: { revalidate: 30 }, // cache for 30s
    });

    if (!res.ok) {
      // Roblox may 401 for private accounts — return gracefully
      return NextResponse.json({ robux: null, error: 'Could not fetch balance' });
    }

    const data = await res.json();
    return NextResponse.json({ robux: data.robux ?? null });
  } catch (err) {
    console.error('Robux fetch error:', err);
    return NextResponse.json({ robux: null, error: 'Failed to fetch' });
  }
}