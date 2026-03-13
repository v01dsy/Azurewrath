// lib/inventoryTracker.ts
import { scanFullInventory, fetchUserAssetDetails } from './robloxApi';
import prisma from './prisma';

/**
 * Save inventory snapshot with these rules:
 * 1. ONE SNAPSHOT PER DAY - Check if today's snapshot exists
 * 2. SAME DAY = UPDATE existing snapshot (don't create new)
 * 3. NEW DAY = CREATE new snapshot
 * 4. NEW items = Fresh scannedAt, uaidCreatedAt + uaidUpdatedAt + isOnHold fetched per-UAID
 * 5. UNCHANGED items = PRESERVE uaidCreatedAt + uaidUpdatedAt, refresh isOnHold from bulk scan
 * 6. ONLY FETCH INVENTORY ONCE per scan -- reuse for both UAID comparison and item details
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
    console.log('FIRST EVER scan...');

    await ensureItemsExist(fullInventory);

    const { totalRAP, totalItems, uniqueItems } = await calculateSnapshotTotals(
      fullInventory.map((item: any) => ({ assetId: item.assetId.toString() }))
    );

    // Fetch per-UAID details -- bulk endpoint does not return created/updated/isOnHold
    const itemRows: any[] = [];
    for (const item of fullInventory) {
      const details = await fetchUserAssetDetails(robloxUserIdString, item.userAssetId.toString());
      console.log(`[FIRST SCAN UAID ${item.userAssetId}] created=${details?.created ?? 'NULL'} updated=${details?.updated ?? 'NULL'} isOnHold=${details?.isOnHold ?? 'NULL'}`);
      itemRows.push({
        assetId: BigInt(item.assetId.toString()),
        userAssetId: BigInt(item.userAssetId.toString()),
        serialNumber: item.serialNumber ?? null,
        scannedAt: new Date(),
        uaidCreatedAt: details?.created ? new Date(details.created) : null,
        uaidUpdatedAt: details?.updated ? new Date(details.updated) : null,
        isOnHold: details?.isOnHold === true,
      });
      await new Promise(r => setTimeout(r, 300)); // avoid 429s
    }

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
      console.log(`FIRST snapshot created (ID: ${snapshot.id}, ${snapshot.items.length} items)`);
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
        console.log(`FIRST snapshot recovered via update (ID: ${snapshot!.id}, ${snapshot!.items.length} items)`);
      } else {
        throw err;
      }
    }

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

  // Unchanged items -- preserve uaidCreatedAt + uaidUpdatedAt (set by owner scan), refresh isOnHold from bulk
  for (const item of latestSnapshot.items) {
    if (currentUAIDSet.has(item.userAssetId.toString())) {
      const fresh = robloxItemMap.get(item.userAssetId.toString());
      allItemsForSnapshot.push({
        assetId: item.assetId,
        userAssetId: item.userAssetId,
        serialNumber: item.serialNumber,
        scannedAt: item.scannedAt,
        uaidCreatedAt: (item as any).uaidCreatedAt ?? null,  // preserve -- never overwrite
        uaidUpdatedAt: (item as any).uaidUpdatedAt ?? null,  // preserve -- updated by owner scan
        isOnHold: fresh?.isOnHold === true,                  // refresh from bulk inventory response
      });
      unchangedCount++;
    }
  }

  // New items -- fetch per-UAID details since bulk endpoint doesn't return created/updated/isOnHold
  for (const uaid of newUAIDs) {
    const item = robloxItemMap.get(uaid);
    if (!item) continue;
    const details = await fetchUserAssetDetails(robloxUserIdString, uaid);
    console.log(`[NEW UAID ${uaid}] created=${details?.created ?? 'NULL'} updated=${details?.updated ?? 'NULL'} isOnHold=${details?.isOnHold ?? 'NULL'}`);
    allItemsForSnapshot.push({
      assetId: BigInt(item.assetId.toString()),
      userAssetId: BigInt(item.userAssetId.toString()),
      serialNumber: item.serialNumber ?? null,
      scannedAt: new Date(),
      uaidCreatedAt: details?.created ? new Date(details.created) : null,
      uaidUpdatedAt: details?.updated ? new Date(details.updated) : null,
      isOnHold: details?.isOnHold === true,
    });
    await new Promise(r => setTimeout(r, 300)); // avoid 429s
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

  if (todaysSnapshot) {
    // ── SAME DAY -- update in place ───────────────────────────────────────
    console.log(`Updating TODAY'S snapshot (ID: ${todaysSnapshot.id})...`);

    if (removedUAIDs.length > 0) {
      await prisma.inventoryItem.deleteMany({
        where: {
          snapshotId: todaysSnapshot.id,
          userAssetId: { in: removedUAIDs.map(id => BigInt(id)) },
        },
      });
    }

    if (newUAIDs.length > 0) {
      // Reuse already-fetched data from allItemsForSnapshot -- no double API calls
      const newItemRows = allItemsForSnapshot
        .filter(i => newUAIDs.includes(i.userAssetId.toString()))
        .map(item => ({
          snapshotId: todaysSnapshot.id,
          userAssetId: item.userAssetId,
          assetId: item.assetId,
          scannedAt: item.scannedAt,
          uaidCreatedAt: item.uaidCreatedAt,
          uaidUpdatedAt: item.uaidUpdatedAt,
          isOnHold: item.isOnHold,
          serialNumber: item.serialNumber ?? null,
        }));
      await prisma.inventoryItem.createMany({ data: newItemRows });
    }

    // Refresh isOnHold for unchanged items (uaidCreatedAt + uaidUpdatedAt are preserved)
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

    const updatedSnapshot = await prisma.inventorySnapshot.findUnique({
      where: { id: todaysSnapshot.id },
      include: { items: true },
    });

    console.log(`UPDATED today's snapshot (${updatedSnapshot!.items.length} items total)`);
    console.log(`   - ${newUAIDs.length} new items added`);
    console.log(`   - ${unchangedCount} items unchanged (isOnHold refreshed)`);
    console.log(`   - ${removedUAIDs.length} items removed`);
    console.log('====================================\n');
    return updatedSnapshot!;

  } else {
    // ── NEW DAY -- create fresh snapshot ─────────────────────────────────
    console.log('Creating NEW snapshot for new day...');

    const newSnapshot = await prisma.inventorySnapshot.create({
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

    console.log(`NEW snapshot created (ID: ${newSnapshot.id}, ${newSnapshot.items.length} items)`);
    console.log(`   - ${newUAIDs.length} new items added`);
    console.log(`   - ${unchangedCount} items carried over`);
    console.log(`   - ${removedUAIDs.length} items removed`);
    console.log('====================================\n');
    return newSnapshot;
  }
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