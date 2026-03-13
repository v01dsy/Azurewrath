// lib/inventoryTracker.ts
import { scanFullInventory, fetchUserAssetDetails } from './robloxApi';
import prisma from './prisma';

/**
 * Save inventory snapshot with these rules:
 * 1. ONE SNAPSHOT PER DAY - Check if today's snapshot exists
 * 2. SAME DAY = UPDATE existing snapshot (don't create new)
 * 3. NEW DAY = CREATE new snapshot
 * 4. isOnHold comes from bulk scan immediately (Phase 1)
 * 5. uaidCreatedAt + uaidUpdatedAt backfilled in background via owners API (Phase 2)
 * 6. UNCHANGED items = PRESERVE uaidCreatedAt + uaidUpdatedAt, refresh isOnHold from bulk scan
 */

function getTodayBoundsUtc(): { todayStartUTC: Date; todayEndUTC: Date } {
  const now = new Date();
  const todayStartUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const todayEndUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return { todayStartUTC, todayEndUTC };
}

async function calculateSnapshotTotals(allItems: { assetId: bigint | string }[]) {
  const assetIds = allItems.map(i =>
    typeof i.assetId === 'bigint' ? i.assetId : BigInt(i.assetId.toString())
  );

  const priceData = await prisma.priceHistory.findMany({
    where: { itemId: { in: assetIds } },
    orderBy: { timestamp: 'desc' },
    distinct: ['itemId'],
    select: { itemId: true, rap: true },
  });

  const rapMap = new Map(priceData.map(p => [p.itemId.toString(), p.rap || 0]));

  const totalRAP = allItems.reduce((sum, item) => {
    return sum + (rapMap.get(item.assetId.toString()) || 0);
  }, 0);

  const totalItems = allItems.length;
  const uniqueItems = new Set(allItems.map(i => i.assetId.toString())).size;

  return { totalRAP, totalItems, uniqueItems };
}

/**
 * Phase 2 — background backfill of uaidCreatedAt + uaidUpdatedAt for new UAIDs.
 * Runs after the snapshot is already saved so the user sees results immediately.
 */
async function backfillTimestamps(
  snapshotId: string,
  robloxUserIdString: string,
  uaidsToBackfill: { userAssetId: string; assetId: string }[]
) {
  console.log(`\n🕐 [Phase 2] Starting background timestamp backfill for ${uaidsToBackfill.length} UAIDs...`);

  for (const { userAssetId, assetId } of uaidsToBackfill) {
    try {
      const details = await fetchUserAssetDetails(robloxUserIdString, userAssetId, assetId);
      if (!details?.created && !details?.updated) {
        console.log(`[Phase 2 UAID ${userAssetId}] No timestamps found`);
        continue;
      }

      await prisma.inventoryItem.updateMany({
        where: {
          snapshotId,
          userAssetId: BigInt(userAssetId),
        },
        data: {
          uaidCreatedAt: details.created ? new Date(details.created) : undefined,
          uaidUpdatedAt: details.updated ? new Date(details.updated) : undefined,
        },
      });

      console.log(`[Phase 2 UAID ${userAssetId}] created=${details.created ?? 'NULL'} updated=${details.updated ?? 'NULL'}`);
    } catch (err: any) {
      console.warn(`[Phase 2 UAID ${userAssetId}] Failed: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`✅ [Phase 2] Background timestamp backfill complete`);
}

export async function saveInventorySnapshot(userId: string | bigint, robloxUserId: string | bigint) {
  const userIdBigInt = typeof userId === 'string' ? BigInt(userId) : userId;
  const robloxUserIdString = typeof robloxUserId === 'bigint' ? robloxUserId.toString() : robloxUserId;

  console.log('\n========== INVENTORY SCAN ==========');
  console.log(`userId: ${userIdBigInt}`);
  console.log(`robloxUserId: ${robloxUserIdString}`);

  console.log('Looking for latest snapshot...');
  const latestSnapshot = await prisma.inventorySnapshot.findFirst({
    where: { userId: userIdBigInt },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });

  if (latestSnapshot) {
    console.log(`Found latest snapshot: ID=${latestSnapshot.id}, created=${latestSnapshot.createdAt}, items=${latestSnapshot.items.length}`);
  } else {
    console.log('No previous snapshot found');
  }

  console.log('Fetching inventory from Roblox...');
  const fullInventory = await scanFullInventory(robloxUserIdString);
  const currentUAIDList = fullInventory.map((item: any) => item.userAssetId.toString());
  console.log(`Fetched ${currentUAIDList.length} UAIDs from Roblox`);

  const robloxItemMap = new Map<string, any>(
    fullInventory.map((item: any) => [item.userAssetId.toString(), item])
  );

  async function ensureItemsExist(items: any[]) {
    const uniqueAssetIds = [...new Set(items.map((item: any) => BigInt(item.assetId.toString())))];
    const existingItems = await prisma.item.findMany({
      where: { assetId: { in: uniqueAssetIds } },
      select: { assetId: true },
    });
    const existingAssetIds = new Set(existingItems.map(i => i.assetId));
    const missingAssetIds = uniqueAssetIds.filter(id => !existingAssetIds.has(id));
    if (missingAssetIds.length > 0) {
      await prisma.item.createMany({
        data: missingAssetIds.map(assetId => ({
          assetId,
          name: `Unknown Item ${assetId}`,
        })),
        skipDuplicates: true,
      });
    }
  }

  // ── FIRST SCAN EVER ──────────────────────────────────────────────────────
  if (!latestSnapshot) {
    console.log('FIRST EVER scan — Phase 1: saving snapshot with isOnHold from bulk...');

    await ensureItemsExist(fullInventory);

    const { totalRAP, totalItems, uniqueItems } = await calculateSnapshotTotals(
      fullInventory.map((item: any) => ({ assetId: item.assetId.toString() }))
    );

    // Phase 1 — save immediately, isOnHold from bulk, timestamps null
    const itemRows: any[] = fullInventory.map((item: any) => ({
      assetId: BigInt(item.assetId.toString()),
      userAssetId: BigInt(item.userAssetId.toString()),
      serialNumber: item.serialNumber ?? null,
      scannedAt: new Date(),
      uaidCreatedAt: null,
      uaidUpdatedAt: null,
      isOnHold: item.isOnHold === true,
    }));

    let snapshot: any;
    try {
      snapshot = await prisma.inventorySnapshot.create({
        data: {
          userId: userIdBigInt,
          totalRAP,
          totalItems,
          uniqueItems,
          items: { create: itemRows },
        },
        include: { items: true },
      });
      console.log(`✅ [Phase 1] FIRST snapshot created (ID: ${snapshot.id}, ${snapshot.items.length} items)`);
    } catch (err: any) {
      if (err.code === 'P2002') {
        const { todayStartUTC, todayEndUTC } = getTodayBoundsUtc();
        const existing = await prisma.inventorySnapshot.findFirst({
          where: { userId: userIdBigInt, createdAt: { gte: todayStartUTC, lte: todayEndUTC } },
        });
        if (!existing) throw err;

        await prisma.inventoryItem.deleteMany({ where: { snapshotId: existing.id } });
        await prisma.inventoryItem.createMany({
          data: itemRows.map(item => ({ snapshotId: existing.id, ...item })),
        });
        await prisma.inventorySnapshot.update({
          where: { id: existing.id },
          data: { totalRAP, totalItems, uniqueItems },
        });
        snapshot = await prisma.inventorySnapshot.findUnique({
          where: { id: existing.id },
          include: { items: true },
        });
        console.log(`✅ [Phase 1] FIRST snapshot recovered via update (ID: ${snapshot!.id}, ${snapshot!.items.length} items)`);
      } else {
        throw err;
      }
    }

    // Phase 2 — fire and forget
    const uaidsToBackfill = fullInventory.map((item: any) => ({
      userAssetId: item.userAssetId.toString(),
      assetId: item.assetId.toString(),
    }));
    backfillTimestamps(snapshot.id, robloxUserIdString, uaidsToBackfill).catch(err =>
      console.error('❌ [Phase 2] Background backfill failed:', err)
    );

    console.log('====================================\n');
    return snapshot;
  }

  // ── SUBSEQUENT SCAN ───────────────────────────────────────────────────────
  console.log('Comparing UAIDs...');
  const previousUAIDSet = new Set<string>(latestSnapshot.items.map(item => item.userAssetId.toString()));
  const currentUAIDSet = new Set<string>(currentUAIDList);

  const newUAIDs = [...currentUAIDSet].filter(uaid => !previousUAIDSet.has(uaid));
  const removedUAIDs = [...previousUAIDSet].filter(uaid => !currentUAIDSet.has(uaid));

  console.log(`Changes: ${newUAIDs.length} new, ${removedUAIDs.length} removed`);

  if (newUAIDs.length > 0) {
    const newItems = newUAIDs.map(uaid => robloxItemMap.get(uaid)).filter(Boolean);
    await ensureItemsExist(newItems);
  }

  const allItemsForSnapshot: {
    assetId: bigint;
    userAssetId: bigint;
    serialNumber: number | null;
    scannedAt: Date;
    uaidCreatedAt: Date | null;
    uaidUpdatedAt: Date | null;
    isOnHold: boolean;
  }[] = [];

  let unchangedCount = 0;

  // Unchanged items — preserve uaidCreatedAt + uaidUpdatedAt, refresh isOnHold from bulk
  for (const item of latestSnapshot.items) {
    if (currentUAIDSet.has(item.userAssetId.toString())) {
      const fresh = robloxItemMap.get(item.userAssetId.toString());
      allItemsForSnapshot.push({
        assetId: item.assetId,
        userAssetId: item.userAssetId,
        serialNumber: item.serialNumber,
        scannedAt: item.scannedAt,
        uaidCreatedAt: (item as any).uaidCreatedAt ?? null,  // preserve — never overwrite
        uaidUpdatedAt: (item as any).uaidUpdatedAt ?? null,  // preserve — updated by owner scan
        isOnHold: fresh?.isOnHold === true,                  // refresh from bulk
      });
      unchangedCount++;
    }
  }

  // New items — Phase 1: save with isOnHold from bulk, timestamps null for now
  for (const uaid of newUAIDs) {
    const item = robloxItemMap.get(uaid);
    if (!item) continue;
    allItemsForSnapshot.push({
      assetId: BigInt(item.assetId.toString()),
      userAssetId: BigInt(item.userAssetId.toString()),
      serialNumber: item.serialNumber ?? null,
      scannedAt: new Date(),
      uaidCreatedAt: null,
      uaidUpdatedAt: null,
      isOnHold: item.isOnHold === true,
    });
  }

  console.log(`Total items for snapshot: ${allItemsForSnapshot.length}`);

  const { totalRAP, totalItems, uniqueItems } = await calculateSnapshotTotals(allItemsForSnapshot);
  const { todayStartUTC, todayEndUTC } = getTodayBoundsUtc();

  const todaysSnapshot = await prisma.inventorySnapshot.findFirst({
    where: {
      userId: userIdBigInt,
      createdAt: { gte: todayStartUTC, lte: todayEndUTC },
    },
  });

  let savedSnapshot: any;

  if (todaysSnapshot) {
    // ── SAME DAY — update in place ────────────────────────────────────────
    console.log(`[Phase 1] Updating TODAY'S snapshot (ID: ${todaysSnapshot.id})...`);

    if (removedUAIDs.length > 0) {
      await prisma.inventoryItem.deleteMany({
        where: {
          snapshotId: todaysSnapshot.id,
          userAssetId: { in: removedUAIDs.map(id => BigInt(id)) },
        },
      });
    }

    if (newUAIDs.length > 0) {
      const newItemRows = allItemsForSnapshot
        .filter(i => newUAIDs.includes(i.userAssetId.toString()))
        .map(item => ({
          snapshotId: todaysSnapshot.id,
          userAssetId: item.userAssetId,
          assetId: item.assetId,
          scannedAt: item.scannedAt,
          uaidCreatedAt: null,
          uaidUpdatedAt: null,
          isOnHold: item.isOnHold,
          serialNumber: item.serialNumber ?? null,
        }));
      await prisma.inventoryItem.createMany({ data: newItemRows });
    }

    // Refresh isOnHold for unchanged items
    for (const item of allItemsForSnapshot) {
      if (!newUAIDs.includes(item.userAssetId.toString())) {
        await prisma.inventoryItem.update({
          where: { snapshotId_userAssetId: { snapshotId: todaysSnapshot.id, userAssetId: item.userAssetId } },
          data: { isOnHold: item.isOnHold },
        });
      }
    }

    await prisma.inventorySnapshot.update({
      where: { id: todaysSnapshot.id },
      data: { totalRAP, totalItems, uniqueItems },
    });

    savedSnapshot = await prisma.inventorySnapshot.findUnique({
      where: { id: todaysSnapshot.id },
      include: { items: true },
    });

    console.log(`✅ [Phase 1] UPDATED today's snapshot (${savedSnapshot!.items.length} items total)`);
    console.log(`   - ${newUAIDs.length} new items added`);
    console.log(`   - ${unchangedCount} items unchanged (isOnHold refreshed)`);
    console.log(`   - ${removedUAIDs.length} items removed`);

  } else {
    // ── NEW DAY — create fresh snapshot ──────────────────────────────────
    console.log('[Phase 1] Creating NEW snapshot for new day...');

    savedSnapshot = await prisma.inventorySnapshot.create({
      data: {
        userId: userIdBigInt,
        totalRAP,
        totalItems,
        uniqueItems,
        items: {
          create: allItemsForSnapshot.map(item => ({
            userAssetId: item.userAssetId,
            assetId: item.assetId,
            serialNumber: item.serialNumber ?? null,
            scannedAt: item.scannedAt,
            uaidCreatedAt: item.uaidCreatedAt ?? null,
            uaidUpdatedAt: item.uaidUpdatedAt ?? null,
            isOnHold: item.isOnHold,
          })),
        },
      },
      include: { items: true },
    });

    console.log(`✅ [Phase 1] NEW snapshot created (ID: ${savedSnapshot.id}, ${savedSnapshot.items.length} items)`);
    console.log(`   - ${newUAIDs.length} new items added`);
    console.log(`   - ${unchangedCount} items carried over`);
    console.log(`   - ${removedUAIDs.length} items removed`);
  }

  // Phase 2 — backfill timestamps for new UAIDs only, fire and forget
  if (newUAIDs.length > 0) {
    const uaidsToBackfill = newUAIDs
      .map(uaid => ({
        userAssetId: uaid,
        assetId: robloxItemMap.get(uaid)?.assetId?.toString() ?? '',
      }))
      .filter(u => u.assetId);

    backfillTimestamps(savedSnapshot.id, robloxUserIdString, uaidsToBackfill).catch(err =>
      console.error('❌ [Phase 2] Background backfill failed:', err)
    );
  }

  console.log('====================================\n');
  return savedSnapshot;
}

export async function getLatestSnapshot(userId: string | bigint) {
  const userIdBigInt = typeof userId === 'string' ? BigInt(userId) : userId;
  return await prisma.inventorySnapshot.findFirst({
    where: { userId: userIdBigInt },
    orderBy: { createdAt: 'desc' },
    include: {
      items: {
        include: { item: true },
      },
    },
  });
}

export async function getInventoryHistory(userId: string | bigint, limit: number = 10) {
  const userIdBigInt = typeof userId === 'string' ? BigInt(userId) : userId;
  return await prisma.inventorySnapshot.findMany({
    where: { userId: userIdBigInt },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      items: {
        include: { item: true },
      },
    },
  });
}

export async function compareSnapshots(oldSnapshotId: string, newSnapshotId: string) {
  const [oldSnapshot, newSnapshot] = await Promise.all([
    prisma.inventorySnapshot.findUnique({
      where: { id: oldSnapshotId },
      include: { items: true },
    }),
    prisma.inventorySnapshot.findUnique({
      where: { id: newSnapshotId },
      include: { items: true },
    }),
  ]);

  if (!oldSnapshot || !newSnapshot) return null;

  const oldItems = oldSnapshot.items.reduce((map, i) => {
    const assetIdString = i.assetId.toString();
    map.set(assetIdString, (map.get(assetIdString) || 0) + 1);
    return map;
  }, new Map<string, number>());

  const newItems = newSnapshot.items.reduce((map, i) => {
    const assetIdString = i.assetId.toString();
    map.set(assetIdString, (map.get(assetIdString) || 0) + 1);
    return map;
  }, new Map<string, number>());

  const added: string[] = [];
  const removed: string[] = [];
  const quantityChanged: { assetId: string; from: number; to: number }[] = [];

  newItems.forEach((qty, assetId) => {
    const oldQty = oldItems.get(assetId) || 0;
    if (oldQty === 0) {
      added.push(assetId);
    } else if (oldQty !== qty) {
      quantityChanged.push({ assetId, from: oldQty, to: qty });
    }
  });

  oldItems.forEach((qty, assetId) => {
    if (!newItems.has(assetId)) {
      removed.push(assetId);
    }
  });

  return { added, removed, quantityChanged };
}