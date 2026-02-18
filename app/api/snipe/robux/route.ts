// app/api/snipe/robux/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const sessionToken = req.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ robux: null });

  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken },
    });

    if (!session?.accessToken) return NextResponse.json({ robux: null });

    const res = await fetch('https://api.roblox.com/currency/balance', {
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) return NextResponse.json({ robux: null });

    const data = await res.json();
    return NextResponse.json({ robux: data.robux ?? null });
  } catch (err) {
    console.error('Robux fetch error:', err);
    return NextResponse.json({ robux: null });
  }
}