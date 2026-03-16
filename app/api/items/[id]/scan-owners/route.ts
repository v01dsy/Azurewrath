// app/api/items/[id]/scan-owners/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = "force-dynamic";

async function getActiveJob(assetId: string) {
  return prisma.scanJob.findFirst({
    where: { assetId: BigInt(assetId), status: { in: ['pending', 'running'] } },
    orderBy: { startedAt: 'desc' },
  });
}

// ─── POST: Start or stop scan ──────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemIdString } = await params;
    const body = await request.json();
    const { userId, action } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { robloxUserId: BigInt(userId) },
      select: { role: true },
    });

    if (!user || !['admin', 'owner'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    if (action === 'stop') {
      const activeJob = await getActiveJob(itemIdString);
      if (activeJob) {
        await prisma.scanJob.update({ where: { id: activeJob.id }, data: { status: 'stopped' } });
        return NextResponse.json({ success: true, message: 'Stop requested — will halt after current user.' });
      }
      return NextResponse.json({ success: false, message: 'No scan is running for this item.' });
    }

    const existing = await getActiveJob(itemIdString);
    if (existing) {
      return NextResponse.json({ success: false, message: 'A scan is already running for this item.' }, { status: 409 });
    }

    const item = await prisma.item.findUnique({
      where: { assetId: BigInt(itemIdString) },
      select: { assetId: true },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    await prisma.scanJob.create({
      data: { assetId: BigInt(itemIdString), type: 'owners', status: 'pending' },
    });

    return NextResponse.json({
      success: true,
      message: 'Scan queued — the worker will pick it up shortly.',
    });

  } catch (error) {
    return NextResponse.json({ error: 'Scan failed', details: String(error) }, { status: 500 });
  }
}

// ─── GET: Poll status ──────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: itemIdString } = await params;

  const job = await prisma.scanJob.findFirst({
    where: { assetId: BigInt(itemIdString), status: { in: ['pending', 'running'] } },
    orderBy: { startedAt: 'desc' },
  });

  const recentJob = job ?? await prisma.scanJob.findFirst({
    where: {
      assetId: BigInt(itemIdString),
      status: { in: ['stopped', 'done'] },
      startedAt: { gte: new Date(Date.now() - 60_000) },
    },
    orderBy: { startedAt: 'desc' },
  });

  return NextResponse.json({
    scanning: job !== null,
    stopRequested: false,
    progress: recentJob ? {
      total: recentJob.total,
      processed: recentJob.processed,
      failed: recentJob.failed,
      currentUser: recentJob.currentUser,
      startedAt: recentJob.startedAt.getTime(),
      pagesFound: recentJob.pagesFound,
    } : null,
  });
}