// app/api/user/stats/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  // TODO: Replace with real user stats data
  return NextResponse.json({
    totalTrades: 0,
    successRate: 0,
    memberSince: "Unknown"
  });
}
