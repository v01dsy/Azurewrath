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

export async function saveInventorySnapshot(userId: string, robloxUserId: string) {
  console.log('\n========== INVENTORY SCAN ==========');
  console.log(`userId: ${userId}`);
  console.log(`robloxUserId: ${robloxUserId}`);

  // Get the most recent snapshot FIRST
  console.log('🔍 [DEBUG] Looking for latest snapshot...');
  const latestSnapshot = await prisma.inventorySnapshot.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { items: true }
  });

  if (latestSnapshot) {
    console.log(`🔍 [DEBUG] Found latest snapshot: ID=${latestSnapshot.id}, created=${latestSnapshot.createdAt}, items=${latestSnapshot.items.length}`);
    console.log(`🔍 [DEBUG] Latest snapshot UAIDs:`, latestSnapshot.items.map(i => i.userAssetId).slice(0, 10), '...');
  } else {
    console.log('🔍 [DEBUG] No previous snapshot found');
  }

  // Fetch ONLY the lightweight UAID list from Roblox
  console.log('🔍 [DEBUG] Calling scanInventoryUAIDs...');
  const currentUAIDList = await scanInventoryUAIDs(robloxUserId);
  console.log(`📦 Fetched ${currentUAIDList.length} UAIDs from Roblox`);

  if (!latestSnapshot) {
    // FIRST SCAN EVER - need full details
    console.log('💾 FIRST EVER scan - fetching full inventory...');
    const fullInventory = await scanFullInventory(robloxUserId);
    
    // Ensure asset IDs exist in database
    const uniqueAssetIds = [...new Set(fullInventory.map((item: any) => item.assetId.toString()))];
    const existingItems = await prisma.item.findMany({
      where: { assetId: { in: uniqueAssetIds } },
      select: { assetId: true }
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

    const snapshot = await prisma.inventorySnapshot.create({
      data: {
        userId,
        items: {
          create: fullInventory.map((item: any) => ({
            assetId: item.assetId.toString(),
            userAssetId: item.userAssetId.toString(),
            serialNumber: item.serialNumber ?? null,
            scannedAt: new Date()
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
  const previousUAIDSet = new Set(latestSnapshot.items.map(item => item.userAssetId));
  const currentUAIDSet = new Set(currentUAIDList);
  
  console.log(`🔍 [DEBUG] Previous UAIDs count: ${previousUAIDSet.size}`);
  console.log(`🔍 [DEBUG] Current UAIDs count: ${currentUAIDSet.size}`);
  
  const newUAIDs = [...currentUAIDSet].filter(uaid => !previousUAIDSet.has(uaid));
  const removedUAIDs = [...previousUAIDSet].filter(uaid => !currentUAIDSet.has(uaid));
  
  console.log(`📊 Changes: ${newUAIDs.length} new, ${removedUAIDs.length} removed`);
  console.log(`🔍 [DEBUG] New UAIDs:`, newUAIDs);
  console.log(`🔍 [DEBUG] Removed UAIDs:`, removedUAIDs);

  // Only fetch details for NEW items
  let newItemsDetails = [];
  if (newUAIDs.length > 0) {
    console.log(`🔍 Fetching details for ${newUAIDs.length} NEW items only...`);
    console.log(`🔍 [DEBUG] About to call fetchItemDetailsByUAIDs with:`, newUAIDs);
    newItemsDetails = await fetchItemDetailsByUAIDs(robloxUserId, newUAIDs);
    console.log(`🔍 [DEBUG] Got ${newItemsDetails.length} item details back`);
    console.log(`🔍 [DEBUG] New items:`, newItemsDetails.map(i => ({ assetId: i.assetId, uaid: i.userAssetId })));
    
    // Ensure new assets exist in database
    const newAssetIds = [...new Set(newItemsDetails.map(item => item.assetId.toString()))];
    const existingItems = await prisma.item.findMany({
      where: { assetId: { in: newAssetIds } },
      select: { assetId: true }
    });
    
    const existingAssetIds = new Set(existingItems.map(i => i.assetId));
    const missingAssetIds = newAssetIds.filter(id => !existingAssetIds.has(id));
    
    if (missingAssetIds.length > 0) {
      console.log(`🔍 [DEBUG] Creating ${missingAssetIds.length} new Item records:`, missingAssetIds);
      await prisma.item.createMany({
        data: missingAssetIds.map(assetId => ({
          assetId,
          name: `Unknown Item ${assetId}`,
        })),
        skipDuplicates: true,
      });
    }
  } else {
    console.log(`✅ [DEBUG] No new items to fetch details for`);
  }

  // Check if today's snapshot exists
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  console.log(`🔍 [DEBUG] Checking for today's snapshot (${todayStart} to ${todayEnd})...`);
  let todaysSnapshot = await prisma.inventorySnapshot.findFirst({
    where: {
      userId,
      createdAt: {
        gte: todayStart,
        lte: todayEnd
      }
    },
    include: { items: true }
  });

  if (todaysSnapshot) {
    console.log(`🔍 [DEBUG] Found today's snapshot: ID=${todaysSnapshot.id}, items=${todaysSnapshot.items.length}`);
  } else {
    console.log(`🔍 [DEBUG] No snapshot for today yet`);
  }

  // Build complete item list
  console.log('🔍 [DEBUG] Building complete item list...');
  const allItemsForSnapshot = [];
  
  // Add EXISTING items (unchanged) - reuse data from latestSnapshot
  let unchangedCount = 0;
  for (const item of latestSnapshot.items) {
    if (currentUAIDSet.has(item.userAssetId)) {
      // Item still in inventory, keep original data and timestamp
      allItemsForSnapshot.push({
        assetId: item.assetId,
        userAssetId: item.userAssetId,
        serialNumber: item.serialNumber,
        scannedAt: item.scannedAt // ✅ PRESERVE original timestamp
      });
      unchangedCount++;
    }
  }
  console.log(`🔍 [DEBUG] Added ${unchangedCount} unchanged items (reused from cache)`);
  
  // Add NEW items with fresh timestamp
  for (const item of newItemsDetails) {
    allItemsForSnapshot.push({
      assetId: item.assetId.toString(),
      userAssetId: item.userAssetId.toString(),
      serialNumber: item.serialNumber ?? null,
      scannedAt: new Date() // ✅ FRESH timestamp
    });
  }
  console.log(`🔍 [DEBUG] Added ${newItemsDetails.length} new items with fresh scannedAt`);
  console.log(`🔍 [DEBUG] Total items for snapshot: ${allItemsForSnapshot.length}`);

  if (todaysSnapshot) {
    // UPDATE today's snapshot
    console.log(`🔄 Updating TODAY'S snapshot (ID: ${todaysSnapshot.id})...`);
    
    console.log(`🔍 [DEBUG] Deleting old items from snapshot ${todaysSnapshot.id}...`);
    await prisma.inventoryItem.deleteMany({
      where: { snapshotId: todaysSnapshot.id }
    });
    
    console.log(`🔍 [DEBUG] Creating ${allItemsForSnapshot.length} new inventory items...`);
    await prisma.inventoryItem.createMany({
      data: allItemsForSnapshot.map(item => ({
        ...item,
        snapshotId: todaysSnapshot.id
      }))
    });
    
    const updatedSnapshot = await prisma.inventorySnapshot.findUnique({
      where: { id: todaysSnapshot.id },
      include: { items: true }
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
        userId,
        items: {
          create: allItemsForSnapshot
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

export async function getLatestSnapshot(userId: string) {
  return await prisma.inventorySnapshot.findFirst({
    where: { userId },
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

export async function getInventoryHistory(userId: string, limit: number = 10) {
  return await prisma.inventorySnapshot.findMany({
    where: { userId },
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
    map.set(i.assetId, (map.get(i.assetId) || 0) + 1);
    return map;
  }, new Map<string, number>());

  const newItems = newSnapshot.items.reduce((map, i) => {
    map.set(i.assetId, (map.get(i.assetId) || 0) + 1);
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