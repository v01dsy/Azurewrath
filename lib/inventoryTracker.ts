// lib/inventoryTracker.ts
import { scanFullInventory } from './robloxApi';
import prisma from './prisma';

/**
 * Save inventory snapshot with these rules:
 * 1. ONE SNAPSHOT PER DAY - Check if today's snapshot exists
 * 2. SAME DAY = UPDATE existing snapshot (don't create new)
 * 3. NEW DAY = CREATE new snapshot
 * 4. NEW items = Fresh scannedAt timestamp
 * 5. UNCHANGED items = PRESERVE original scannedAt timestamp
 * 6. ONLY FETCH DETAILS FOR NEW ITEMS - reuse cached data for unchanged items
 */

// Lightweight - just get UAIDs (fast!)
async function scanInventoryUAIDs(robloxUserId: string): Promise<string[]> {
  console.log('🔍 [DEBUG] Fetching UAID list from Roblox...');
  const inventory = await scanFullInventory(robloxUserId);
  const uaids = inventory.map((item: any) => item.userAssetId.toString());
  console.log(`🔍 [DEBUG] Got ${uaids.length} UAIDs:`, uaids.slice(0, 5), '...');
  return uaids;
}

// Heavy - fetch details only for specific UAIDs
async function fetchItemDetailsByUAIDs(robloxUserId: string, uaids: string[]): Promise<any[]> {
  console.log(`🔍 [DEBUG] Fetching full details for ${uaids.length} specific UAIDs:`, uaids);
  const fullInventory = await scanFullInventory(robloxUserId);
  const filtered = fullInventory.filter((item: any) => uaids.includes(item.userAssetId.toString()));
  console.log(`🔍 [DEBUG] Filtered to ${filtered.length} items`);
  return filtered;
}

// Calculate today's start/end in EST, returned as UTC for DB queries
function getEstDayBoundsAsUtc(): { todayStartUTC: Date; todayEndUTC: Date } {
  const now = new Date();
  const estOffsetMs = -5 * 60 * 60 * 1000; // EST = UTC-5
  const estNow = new Date(now.getTime() + estOffsetMs);

  const todayStart = new Date(estNow);
  todayStart.setUTCHours(0, 0, 0, 0);

  const todayEnd = new Date(estNow);
  todayEnd.setUTCHours(23, 59, 59, 999);

  // Convert back to UTC for Prisma queries
  const todayStartUTC = new Date(todayStart.getTime() - estOffsetMs);
  const todayEndUTC = new Date(todayEnd.getTime() - estOffsetMs);

  return { todayStartUTC, todayEndUTC };
}

// Look up RAP totals for a list of asset IDs
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
  // Convert to BigInt if string
  const userIdBigInt = typeof userId === 'string' ? BigInt(userId) : userId;
  const robloxUserIdString = typeof robloxUserId === 'bigint' ? robloxUserId.toString() : robloxUserId;

  console.log('\n========== INVENTORY SCAN ==========');
  console.log(`userId: ${userIdBigInt}`);
  console.log(`robloxUserId: ${robloxUserIdString}`);

  // Get the most recent snapshot FIRST
  console.log('🔍 [DEBUG] Looking for latest snapshot...');
  const latestSnapshot = await prisma.inventorySnapshot.findFirst({
    where: { userId: userIdBigInt },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });

  if (latestSnapshot) {
    console.log(`🔍 [DEBUG] Found latest snapshot: ID=${latestSnapshot.id}, created=${latestSnapshot.createdAt}, items=${latestSnapshot.items.length}`);
  } else {
    console.log('🔍 [DEBUG] No previous snapshot found');
  }

  // Scan once and reuse for both UAID comparison and first-scan details
  console.log('🔍 [DEBUG] Fetching inventory from Roblox...');
  const fullInventory = await scanFullInventory(robloxUserIdString);
  const currentUAIDList = fullInventory.map((item: any) => item.userAssetId.toString());
  console.log(`📦 Fetched ${currentUAIDList.length} UAIDs from Roblox`);

  if (!latestSnapshot) {
    // FIRST SCAN EVER - reuse already fetched inventory
    console.log('💾 FIRST EVER scan - using already fetched inventory...');

    // Ensure asset IDs exist in database
    const uniqueAssetIds = [...new Set(fullInventory.map((item: any) => BigInt(item.assetId.toString())))];
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

    // Calculate totals
    const { totalRAP, totalItems, uniqueItems } = await calculateSnapshotTotals(
      fullInventory.map((item: any) => ({ assetId: item.assetId.toString() }))
    );

    const snapshot = await prisma.inventorySnapshot.create({
      data: {
        userId: userIdBigInt,
        totalRAP,
        totalItems,
        uniqueItems,
        items: {
          create: fullInventory.map((item: any) => ({
            assetId: BigInt(item.assetId.toString()),
            userAssetId: BigInt(item.userAssetId.toString()),
            serialNumber: item.serialNumber ?? null,
            scannedAt: new Date(),
          })),
        },
      },
      include: { items: true },
    });

    console.log(`✅ FIRST snapshot created (ID: ${snapshot.id}, ${snapshot.items.length} items)`);
    console.log('====================================\n');
    return snapshot;
  }

  // Compare UAIDs to find what's NEW
  console.log('🔍 [DEBUG] Comparing UAIDs...');
  const previousUAIDSet = new Set(latestSnapshot.items.map(item => item.userAssetId.toString()));
  const currentUAIDSet = new Set(currentUAIDList);

  const newUAIDs = [...currentUAIDSet].filter(uaid => !previousUAIDSet.has(uaid));
  const removedUAIDs = [...previousUAIDSet].filter(uaid => !currentUAIDSet.has(uaid));

  console.log(`📊 Changes: ${newUAIDs.length} new, ${removedUAIDs.length} removed`);

  // Only fetch details for NEW items
  let newItemsDetails: any[] = [];
  if (newUAIDs.length > 0) {
    console.log(`🔍 Fetching details for ${newUAIDs.length} NEW items only...`);
    newItemsDetails = await fetchItemDetailsByUAIDs(robloxUserIdString, newUAIDs);

    // Ensure new assets exist in database
    const newAssetIds = [...new Set(newItemsDetails.map(item => BigInt(item.assetId.toString())))];
    const existingItems = await prisma.item.findMany({
      where: { assetId: { in: newAssetIds } },
      select: { assetId: true },
    });

    const existingAssetIds = new Set(existingItems.map(i => i.assetId));
    const missingAssetIds = newAssetIds.filter(id => !existingAssetIds.has(id));

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

  // Build complete item list
  const allItemsForSnapshot: {
    assetId: bigint;
    userAssetId: bigint;
    serialNumber: number | null;
    scannedAt: Date;
  }[] = [];

  let unchangedCount = 0;
  for (const item of latestSnapshot.items) {
    if (currentUAIDSet.has(item.userAssetId.toString())) {
      allItemsForSnapshot.push({
        assetId: item.assetId,
        userAssetId: item.userAssetId,
        serialNumber: item.serialNumber,
        scannedAt: item.scannedAt, // ✅ PRESERVE original timestamp
      });
      unchangedCount++;
    }
  }

  for (const item of newItemsDetails) {
    allItemsForSnapshot.push({
      assetId: BigInt(item.assetId.toString()),
      userAssetId: BigInt(item.userAssetId.toString()),
      serialNumber: item.serialNumber ?? null,
      scannedAt: new Date(), // ✅ FRESH timestamp
    });
  }

  console.log(`🔍 [DEBUG] Total items for snapshot: ${allItemsForSnapshot.length}`);

  // Calculate totals from RAP data
  const { totalRAP, totalItems, uniqueItems } = await calculateSnapshotTotals(allItemsForSnapshot);

  // Get today's bounds in EST → UTC
  const { todayStartUTC, todayEndUTC } = getEstDayBoundsAsUtc();

  console.log(`🔍 [DEBUG] Checking for today's snapshot (${todayStartUTC} to ${todayEndUTC})...`);
  const todaysSnapshot = await prisma.inventorySnapshot.findFirst({
    where: {
      userId: userIdBigInt,
      createdAt: {
        gte: todayStartUTC,
        lte: todayEndUTC,
      },
    },
    include: { items: true },
  });

  if (todaysSnapshot) {
    // UPDATE today's snapshot
    console.log(`🔄 Updating TODAY'S snapshot (ID: ${todaysSnapshot.id})...`);

    await prisma.inventoryItem.deleteMany({
      where: { snapshotId: todaysSnapshot.id },
    });

    await prisma.inventoryItem.createMany({
      data: allItemsForSnapshot.map(item => ({
        snapshotId: todaysSnapshot.id,
        userAssetId: item.userAssetId,
        assetId: item.assetId,
        scannedAt: item.scannedAt,
        serialNumber: item.serialNumber ?? null,
      })),
    });

    // Update totals on the snapshot row
    await prisma.inventorySnapshot.update({
      where: { id: todaysSnapshot.id },
      data: { totalRAP, totalItems, uniqueItems },
    });

    const updatedSnapshot = await prisma.inventorySnapshot.findUnique({
      where: { id: todaysSnapshot.id },
      include: { items: true },
    });

    console.log(`✅ UPDATED today's snapshot (${updatedSnapshot!.items.length} items total)`);
    console.log(`   - ${newUAIDs.length} NEW items fetched and added`);
    console.log(`   - ${unchangedCount} items reused from cache`);
    console.log(`   - ${removedUAIDs.length} items were removed`);
    console.log('====================================\n');
    return updatedSnapshot!;
  } else {
    // CREATE new snapshot for new day
    console.log(`📸 Creating NEW snapshot for new day...`);

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
          })),
        },
      },
      include: { items: true },
    });

    console.log(`✅ NEW snapshot created (ID: ${newSnapshot.id}, ${newSnapshot.items.length} items)`);
    console.log(`   - ${newUAIDs.length} NEW items fetched and added`);
    console.log(`   - ${unchangedCount} items reused from cache`);
    console.log(`   - ${removedUAIDs.length} items were removed`);
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
        include: {
          item: true,
        },
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
        include: {
          item: true,
        },
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