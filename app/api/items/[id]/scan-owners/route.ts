// app/api/items/[id]/scan-owners/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { saveInventorySnapshot } from '@/lib/inventoryTracker';
import { fetchRobloxUserInfo, fetchRobloxHeadshotUrl } from '@/lib/robloxApi';

export const dynamic = "force-dynamic";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const ongoingItemScans = new Set<string>();
const stopRequested = new Set<string>();

const scanProgress = new Map<string, {
  total: number;
  processed: number;
  failed: number;
  currentUser: string | null;
  startedAt: number;
  pagesFound: number;
}>();

// ─── Page fetcher (producer) ───────────────────────────────────────────────
// Continuously fetches pages and pushes valid owner entries into the queue.
// Signals done by pushing null.
async function fetchPagesIntoQueue(
  assetId: string,
  queue: Array<any>,
  onNewOwners: (count: number) => void,
  isDone: { value: boolean }
) {
  const baseUrl = `https://inventory.roblox.com/v2/assets/${assetId}/owners?limit=100&sortOrder=Asc`;
  console.log(`⏳ Cold start delay 3s before first fetch...`);
  await delay(3000);
  let cursor: string | null = null;
  let pageNum = 0;

  do {
    if (stopRequested.has(assetId)) {
      console.log(`🛑 Page fetcher: stop requested — halting`);
      break;
    }

    const url = cursor ? `${baseUrl}&cursor=${cursor}` : baseUrl;

    let res: Response;
    try {
      console.log(`📄 Fetching page ${pageNum + 1} — ${url}`);
      const rawCookie = process.env.ROBLOX_SECURITY_COOKIE ?? '';
      // Strip any surrounding quotes that .env parsers might leave in
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
      continue; // retry same cursor
    }

    if (res.status === 404) {
      console.warn(`⚠️ 404 — asset not found`);
      break;
    }

    if (!res.ok) {
      console.error(`❌ API error ${res.status} on page ${pageNum + 1}`);
      break;
    }

    const data = await res.json();
    pageNum++;

    if (pageNum === 1) console.log(`   🔍 FULL PAGE 1 SAMPLE (first 3):`, JSON.stringify(data.data?.slice(0,3), null, 2));
    const entries: any[] = data.data ?? [];
    const withOwner = entries.filter((e: any) => e.owner !== null && e.owner !== undefined);
    const withOwnerId = entries.filter((e: any) => e.owner?.id != null);
    console.log(`   🔍 total=${entries.length} | non-null owner=${withOwner.length} | has owner.id=${withOwnerId.length}`);
    if (entries[1]) console.log(`   🔍 entry[1].owner=${JSON.stringify(entries[1].owner)}`);
    const valid = withOwnerId;
    const nullCount = entries.length - valid.length;

    console.log(`   ✅ Page ${pageNum}: ${valid.length} valid owners, ${nullCount} null skipped`);
    if (valid.length > 0) console.log(`   🔑 First valid owner.id on this page: ${valid[0].owner.id}`);

    // Push valid entries into the queue
    for (const entry of valid) {
      queue.push(entry);
    }
    onNewOwners(valid.length);

    const progress = scanProgress.get(assetId);
    if (progress) progress.pagesFound = pageNum;

    cursor = data.nextPageCursor ?? null;
    if (cursor) await delay(2500); // rate limit between pages

  } while (cursor);

  isDone.value = true;
  console.log(`📄 Page fetcher finished — ${pageNum} pages fetched`);
}

// ─── Owner processor (consumer) ───────────────────────────────────────────
// Continuously pulls from the queue and processes each owner.
async function processOwnersFromQueue(
  assetId: string,
  queue: Array<any>,
  isDone: { value: boolean }
) {
  let processed = 0;
  let failed = 0;

  while (true) {
    // If queue is empty, either wait for more or exit if fetcher is done
    if (queue.length === 0) {
      if (isDone.value) break;
      await delay(500); // wait for fetcher to push more
      continue;
    }

    if (stopRequested.has(assetId)) {
      console.log(`🛑 Owner processor: stop requested — halting`);
      break;
    }

    const entry = queue.shift()!;
    const robloxUserId = entry.owner?.id?.toString();
    const uaid = entry.id?.toString();

    if (!robloxUserId) continue;

    const progress = scanProgress.get(assetId)!;
    progress.processed = processed;
    progress.failed = failed;
    progress.currentUser = `userId:${robloxUserId}`;

    const pct = progress.total > 0 ? Math.round((processed / progress.total) * 100) : '?';
    console.log(`\n👤 [${processed + 1}/${progress.total || '?'}] (${pct}%)`);
    console.log(`   🆔 userId: ${robloxUserId} | UAID: ${uaid}`);
    console.log(`   🔍 Fetching Roblox user info...`);

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

      progress.currentUser = username;

      console.log(`   💾 Upserting to DB...`);
      await prisma.user.upsert({
        where: { robloxUserId: BigInt(robloxUserId) },
        update: { username, displayName, avatarUrl, description },
        create: { robloxUserId: BigInt(robloxUserId), username, displayName, avatarUrl, description },
      });

      console.log(`   📦 Scanning inventory for ${username}...`);
      await saveInventorySnapshot(robloxUserId, robloxUserId);

      processed++;
      progress.processed = processed;

      const elapsed = Math.round((Date.now() - scanProgress.get(assetId)!.startedAt) / 1000);
      const rate = processed / Math.max(elapsed, 1);
      const remaining = progress.total > 0
        ? Math.round((progress.total - processed) / Math.max(rate, 0.01))
        : null;
      console.log(`   ✅ Done: ${username} | ${processed}/${progress.total || '?'} | ${remaining != null ? `~${remaining}s remaining` : 'calculating...'}`);

      await delay(2500);
    } catch (err) {
      failed++;
      progress.failed = failed;
      console.error(`   ❌ Failed userId ${robloxUserId}:`, err);
      await delay(2500);
    }
  }

  return { processed, failed };
}

// ─── Main scan orchestrator ────────────────────────────────────────────────
async function scanOwnersStreaming(assetId: string) {
  console.log(`\n🚀 ========== OWNER SCAN START ==========`);
  console.log(`📦 Asset: ${assetId} — fetching pages & processing in parallel`);
  console.log(`=========================================`);

  scanProgress.set(assetId, {
    total: 0,
    processed: 0,
    failed: 0,
    currentUser: null,
    startedAt: Date.now(),
    pagesFound: 0,
  });

  const queue: any[] = [];
  const isDone = { value: false };

  // Callback to update total as pages come in
  const onNewOwners = (count: number) => {
    const progress = scanProgress.get(assetId);
    if (progress) progress.total += count;
  };

  // Run fetcher and processor concurrently
  const [, { processed, failed }] = await Promise.all([
    fetchPagesIntoQueue(assetId, queue, onNewOwners, isDone),
    processOwnersFromQueue(assetId, queue, isDone),
  ]);

  const wasStopped = stopRequested.has(assetId);
  const elapsed = Math.round((Date.now() - scanProgress.get(assetId)!.startedAt) / 1000);

  console.log(`\n${wasStopped ? '🛑 SCAN STOPPED' : '🎉 SCAN COMPLETE'} — Asset: ${assetId}`);
  console.log(`   ✅ Processed: ${processed} | ❌ Failed: ${failed} | ⏱️ Time: ${elapsed}s`);
  console.log(`=========================================\n`);

  const progress = scanProgress.get(assetId)!;
  progress.processed = processed;
  progress.failed = failed;
  progress.currentUser = null;

  ongoingItemScans.delete(assetId);
  stopRequested.delete(assetId);
  setTimeout(() => scanProgress.delete(assetId), 60_000);
}

// ─── POST: Start scan ──────────────────────────────────────────────────────
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

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    if (action === 'stop') {
      if (ongoingItemScans.has(itemIdString)) {
        stopRequested.add(itemIdString);
        console.log(`🛑 Stop requested for asset ${itemIdString}`);
        return NextResponse.json({ success: true, message: 'Stop requested — will halt after current user.' });
      }
      return NextResponse.json({ success: false, message: 'No scan is running for this item.' });
    }

    // Lock immediately before anything else
    if (ongoingItemScans.has(itemIdString)) {
      return NextResponse.json({ success: false, message: 'A scan is already running for this item.' }, { status: 409 });
    }
    ongoingItemScans.add(itemIdString);

    const item = await prisma.item.findUnique({
      where: { assetId: BigInt(itemIdString) },
      select: { assetId: true, name: true },
    });

    if (!item) {
      ongoingItemScans.delete(itemIdString);
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Start streaming scan in background — responds immediately
    scanOwnersStreaming(itemIdString).catch(err => {
      console.error('Streaming scan crashed:', err);
      ongoingItemScans.delete(itemIdString);
      stopRequested.delete(itemIdString);
      scanProgress.delete(itemIdString);
    });

    return NextResponse.json({
      success: true,
      message: `Scan started — pages are fetched and owners processed simultaneously.`,
    });

  } catch (error) {
    console.error('Scan owners error:', error);
    return NextResponse.json({ error: 'Scan failed', details: String(error) }, { status: 500 });
  }
}

// ─── GET: Poll status ──────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: itemIdString } = await params;
  const progress = scanProgress.get(itemIdString);

  return NextResponse.json({
    scanning: ongoingItemScans.has(itemIdString),
    stopRequested: stopRequested.has(itemIdString),
    progress: progress ?? null,
  });
}