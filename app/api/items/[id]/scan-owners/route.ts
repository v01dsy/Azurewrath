// app/api/items/[id]/scan-owners/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { saveInventorySnapshot } from '@/lib/inventoryTracker';
import { fetchRobloxUserInfo, fetchRobloxHeadshotUrl } from '@/lib/robloxApi';

export const dynamic = "force-dynamic";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── DB helpers ────────────────────────────────────────────────────────────

async function getActiveJob(assetId: string) {
  return prisma.scanJob.findFirst({
    where: { assetId: BigInt(assetId), status: 'running' },
    orderBy: { startedAt: 'desc' },
  });
}

async function isStopRequested(jobId: string) {
  const job = await prisma.scanJob.findUnique({ where: { id: jobId }, select: { status: true } });
  return job?.status === 'stopped';
}

async function updateProgress(jobId: string, data: {
  total?: number;
  processed?: number;
  failed?: number;
  pagesFound?: number;
  currentUser?: string | null;
}) {
  await prisma.scanJob.update({ where: { id: jobId }, data });
}

// ─── Page fetcher (producer) ───────────────────────────────────────────────
async function fetchPagesIntoQueue(
  assetId: string,
  jobId: string,
  queue: Array<any>,
  isDone: { value: boolean }
) {
  const baseUrl = `https://inventory.roblox.com/v2/assets/${assetId}/owners?limit=100&sortOrder=Asc`;
  console.log(`⏳ Cold start delay 3s before first fetch...`);
  await delay(3000);
  let cursor: string | null = null;
  let pageNum = 0;

  do {
    if (await isStopRequested(jobId)) {
      console.log(`🛑 Page fetcher: stop requested — halting`);
      break;
    }

    const url = cursor ? `${baseUrl}&cursor=${cursor}` : baseUrl;

    let res: Response;
    try {
      console.log(`📄 Fetching page ${pageNum + 1} — ${url}`);
      const rawCookie = process.env.ROBLOX_SECURITY_COOKIE ?? '';
      const cleanCookie = rawCookie.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
      const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' };
      if (cleanCookie) {
        headers['Cookie'] = `.ROBLOSECURITY=${cleanCookie}`;
        if (pageNum <= 1) console.log(`   🍪 Cookie present: ${cleanCookie.substring(0, 40)}...`);
      } else {
        if (pageNum <= 1) console.log(`   ⚠️ No ROBLOX_SECURITY_COOKIE found in env!`);
      }
      res = await fetch(url, { headers });
    } catch (err) {
      console.error(`❌ Network error fetching page ${pageNum + 1}:`, err);
      break;
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = Math.max((retryAfter ? parseInt(retryAfter) : 0) * 1000, 30000);
      console.warn(`⏳ 429 on page ${pageNum + 1} — waiting ${waitMs / 1000}s...`);
      await delay(waitMs);
      continue;
    }

    if (res.status === 404) { console.warn(`⚠️ 404 — asset not found`); break; }
    if (!res.ok) { console.error(`❌ API error ${res.status} on page ${pageNum + 1}`); break; }

    const data = await res.json();
    pageNum++;

    const entries: any[] = data.data ?? [];
    const valid = entries.filter((e: any) => e.owner?.id != null);
    const nullCount = entries.length - valid.length;

    console.log(`   ✅ Page ${pageNum}: ${valid.length} valid owners, ${nullCount} null skipped`);

    for (const entry of valid) queue.push(entry);

    // Update total and pages in DB
    const job = await prisma.scanJob.findUnique({ where: { id: jobId }, select: { total: true, pagesFound: true } });
    if (job) {
      await prisma.scanJob.update({
        where: { id: jobId },
        data: { total: job.total + valid.length, pagesFound: pageNum },
      });
    }

    cursor = data.nextPageCursor ?? null;
    if (cursor) await delay(2500);

  } while (cursor);

  isDone.value = true;
  console.log(`📄 Page fetcher finished — ${pageNum} pages fetched`);
}

// ─── Owner processor (consumer) ───────────────────────────────────────────
async function processOwnersFromQueue(
  assetId: string,
  jobId: string,
  queue: Array<any>,
  isDone: { value: boolean }
) {
  let processed = 0;
  let failed = 0;

  while (true) {
    if (queue.length === 0) {
      if (isDone.value) break;
      await delay(500);
      continue;
    }

    if (await isStopRequested(jobId)) {
      console.log(`🛑 Owner processor: stop requested — halting`);
      break;
    }

    const entry = queue.shift()!;
    const robloxUserId = entry.owner?.id?.toString();
    if (!robloxUserId) continue;

    const job = await prisma.scanJob.findUnique({ where: { id: jobId }, select: { total: true } });
    const total = job?.total ?? 0;
    const pct = total > 0 ? Math.round((processed / total) * 100) : '?';
    console.log(`\n👤 [${processed + 1}/${total || '?'}] (${pct}%) — userId: ${robloxUserId}`);

    await updateProgress(jobId, { currentUser: `userId:${robloxUserId}`, processed, failed });

    try {
      let username = `user_${robloxUserId}`;
      let displayName = username;
      let avatarUrl: string | null = null;
      let description: string | null = null;

      try {
        const [robloxInfo, headshot] = await Promise.all([
          fetchRobloxUserInfo(robloxUserId),
          fetchRobloxHeadshotUrl(robloxUserId),
        ]);
        if (robloxInfo) {
          username = robloxInfo.name || robloxInfo.displayName || username;
          displayName = robloxInfo.displayName || username;
          description = robloxInfo.description || null;
        }
        avatarUrl = headshot;
        console.log(`   👤 Resolved: ${username} (${displayName})`);
      } catch {
        console.warn(`   ⚠️ Could not fetch info for ${robloxUserId} — using placeholder`);
      }

      await updateProgress(jobId, { currentUser: username });

      await prisma.user.upsert({
        where: { robloxUserId: BigInt(robloxUserId) },
        update: { username, displayName, avatarUrl, description },
        create: { robloxUserId: BigInt(robloxUserId), username, displayName, avatarUrl, description },
      });

      console.log(`   📦 Scanning inventory for ${username}...`);
      await saveInventorySnapshot(robloxUserId, robloxUserId);

      processed++;
      await updateProgress(jobId, { processed, failed });
      console.log(`   ✅ Done: ${username} | ${processed}/${total || '?'}`);

      await delay(2500);
    } catch (err) {
      failed++;
      await updateProgress(jobId, { failed });
      console.error(`   ❌ Failed userId ${robloxUserId}:`, err);
      await delay(2500);
    }
  }

  return { processed, failed };
}

// ─── Main scan orchestrator ────────────────────────────────────────────────
async function scanOwnersStreaming(assetId: string, jobId: string) {
  console.log(`\n🚀 ========== OWNER SCAN START ==========`);
  console.log(`📦 Asset: ${assetId} | Job: ${jobId}`);
  console.log(`=========================================`);

  const queue: any[] = [];
  const isDone = { value: false };

  const [, { processed, failed }] = await Promise.all([
    fetchPagesIntoQueue(assetId, jobId, queue, isDone),
    processOwnersFromQueue(assetId, jobId, queue, isDone),
  ]);

  const finalJob = await prisma.scanJob.findUnique({ where: { id: jobId }, select: { status: true } });
  const wasStopped = finalJob?.status === 'stopped';

  console.log(`\n${wasStopped ? '🛑 SCAN STOPPED' : '🎉 SCAN COMPLETE'} — Asset: ${assetId}`);
  console.log(`   ✅ Processed: ${processed} | ❌ Failed: ${failed}`);
  console.log(`=========================================\n`);

  await prisma.scanJob.update({
    where: { id: jobId },
    data: { status: wasStopped ? 'stopped' : 'done', processed, failed, currentUser: null },
  });

  // Clean up old completed jobs after 60s
  setTimeout(async () => {
    await prisma.scanJob.deleteMany({
      where: { assetId: BigInt(assetId), status: { in: ['done', 'stopped'] } },
    });
  }, 60_000);
}

// ─── POST: Start or stop scan ──────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('🔴 POST hit');
  try {
    const { id: itemIdString } = await params;
    console.log('🔴 itemIdString:', itemIdString);
    const body = await request.json();
    console.log('🔴 body:', body);
    const { userId, action } = body;
    console.log('🔴 userId:', userId, 'action:', action);

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { robloxUserId: BigInt(userId) },
      select: { role: true },
    });
    console.log('🔴 user role:', user?.role);

    if (!user || !['admin', 'owner'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    if (action === 'stop') {
      const activeJob = await getActiveJob(itemIdString);
      if (activeJob) {
        await prisma.scanJob.update({ where: { id: activeJob.id }, data: { status: 'stopped' } });
        console.log(`🛑 Stop requested for asset ${itemIdString}`);
        return NextResponse.json({ success: true, message: 'Stop requested — will halt after current user.' });
      }
      return NextResponse.json({ success: false, message: 'No scan is running for this item.' });
    }

    // Check no active scan already running
    const existing = await getActiveJob(itemIdString);
    console.log('🔴 existing job:', existing?.id ?? 'none');
    if (existing) {
      return NextResponse.json({ success: false, message: 'A scan is already running for this item.' }, { status: 409 });
    }

    const item = await prisma.item.findUnique({
      where: { assetId: BigInt(itemIdString) },
      select: { assetId: true, name: true },
    });
    console.log('🔴 item:', item?.name ?? 'not found');

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Create job in DB immediately — visible to all instances
    const job = await prisma.scanJob.create({
      data: { assetId: BigInt(itemIdString), status: 'running' },
    });
    console.log('🔴 job created:', job.id);

    // Start scan in background
    scanOwnersStreaming(itemIdString, job.id).catch(async (err) => {
      console.error('🔴 SCAN CRASHED:', err);
      console.error('🔴 Stack:', err?.stack);
      await prisma.scanJob.update({
        where: { id: job.id },
        data: { status: 'done', currentUser: null },
      }).catch(() => {});
    });

    console.log('🔴 returning success');
    return NextResponse.json({
      success: true,
      message: `Scan started — pages are fetched and owners processed simultaneously.`,
    });

  } catch (error) {
    console.error('🔴 POST outer catch:', error);
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
    where: { assetId: BigInt(itemIdString), status: 'running' },
    orderBy: { startedAt: 'desc' },
  });

  // Also check for a recently stopped/done job within the last 60s for UI feedback
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
    stopRequested: false, // stop is now instant — sets status to 'stopped' directly
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