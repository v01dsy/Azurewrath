import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userid: string }> }
) {
  const { userid } = await params;
  const job = await prisma.scanJob.findFirst({
    where: {
      userId: BigInt(userid),
      status: { in: ['pending', 'running'] },
    },
    select: { id: true, status: true, currentUser: true },
  });

  return NextResponse.json({ scanning: job !== null, job: job ?? null });
}