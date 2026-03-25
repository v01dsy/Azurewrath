// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20; // 20 uaid requests per minute for unauthenticated users

// In-memory store — resets on redeploy, good enough for edge rate limiting
const ipMap = new Map<string, { count: number; resetAt: number }>();

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only rate limit /uaid/ routes
  if (!pathname.startsWith('/uaid/')) {
    return NextResponse.next();
  }

  // If they have a session cookie, let them through
  if (req.cookies.get('session')?.value) {
    return NextResponse.next();
  }

  // Get IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';

  const now = Date.now();
  const entry = ipMap.get(ip);

  if (!entry || now > entry.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return NextResponse.next();
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)),
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/uaid/:path*',
};