import { scanFullInventory } from './robloxApi';
import prisma from './prisma';

export async function saveInventorySnapshot(userId: string, robloxUserId: string) {
  // Fetch current inventory from Roblox
  const inventory = await scanFullInventory(robloxUserId);
  
  console.log(`📦 Fetched ${inventory.length} total items from Roblox`);
  
  // Get unique assetIds
  const uniqueAssetIds = [...new Set(inventory.map((item: any) => item.assetId.toString()))];
  
  console.log(`🔍 Found ${uniqueAssetIds.length} unique asset types`);
  
  // Find which items don't exist in database yet
  const existingItems = await prisma.item.findMany({
    where: { assetId: { in: uniqueAssetIds } },
    select: { assetId: true }
  });
  
  const existingAssetIds = new Set(existingItems.map(i => i.assetId));
  const missingAssetIds = uniqueAssetIds.filter(id => !existingAssetIds.has(id));
  
  // Create missing items as placeholders
  if (missingAssetIds.length > 0) {
    console.log(`➕ Creating ${missingAssetIds.length} missing items in database...`);
    await prisma.item.createMany({
      data: missingAssetIds.map(assetId => ({
        assetId,
        name: `Unknown Item ${assetId}`,
      })),
      skipDuplicates: true,
    });
    console.log(`✅ Created placeholder items`);
  }
  
  // Get the latest snapshot
  const latestSnapshot = await prisma.inventorySnapshot.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      items: true
    }
  });
  
  if (!latestSnapshot) {
    // No snapshot exists - create the first one
    console.log(`💾 Creating first snapshot with ${inventory.length} items...`);
    const snapshot = await prisma.inventorySnapshot.create({
      data: {
        userId,
        items: {
          create: inventory.map((item: any) => ({
            assetId: item.assetId.toString(),
            userAssetId: item.userAssetId.toString(),
            serialNumber: item.serialNumber ?? null,
            scannedAt: new Date()
          })),
        },
      },
      include: {
        items: true,
      },
    });
    
    console.log(`✅ First snapshot created with ID: ${snapshot.id}`);
    return snapshot;
  }
  
  // Compare current inventory with latest snapshot
  const currentUAIDs = new Set(inventory.map((item: any) => item.userAssetId.toString()));
  const oldUAIDs = new Set(latestSnapshot.items.map(item => item.userAssetId));
  
  // Find new and removed items
  const newUAIDs = [...currentUAIDs].filter(uaid => !oldUAIDs.has(uaid));
  const removedUAIDs = [...oldUAIDs].filter(uaid => !currentUAIDs.has(uaid));
  
  console.log(`📊 Inventory comparison:`);
  console.log(`  Total current: ${currentUAIDs.size}`);
  console.log(`  Total old: ${oldUAIDs.size}`);
  console.log(`  ➕ New items: ${newUAIDs.length}`);
  console.log(`  ➖ Removed items: ${removedUAIDs.length}`);
  
  if (newUAIDs.length === 0 && removedUAIDs.length === 0) {
    console.log(`✅ No changes detected - using existing snapshot`);
    return latestSnapshot;
  }
  
  // INCREMENTAL UPDATE: Only add new items and remove old ones
  console.log(`🔄 Updating snapshot incrementally...`);
  
  // Remove items that are no longer in inventory
  if (removedUAIDs.length > 0) {
    await prisma.inventoryItem.deleteMany({
      where: {
        snapshotId: latestSnapshot.id,
        userAssetId: {
          in: removedUAIDs
        }
      }
    });
    console.log(`  ➖ Removed ${removedUAIDs.length} items from snapshot`);
  }
  
  // Add new items to the snapshot
  if (newUAIDs.length > 0) {
    const newItems = inventory.filter((item: any) => 
      newUAIDs.includes(item.userAssetId.toString())
    );
    
    await prisma.inventoryItem.createMany({
      data: newItems.map((item: any) => ({
        snapshotId: latestSnapshot.id,
        assetId: item.assetId.toString(),
        userAssetId: item.userAssetId.toString(),
        serialNumber: item.serialNumber ?? null,
        scannedAt: new Date()
      }))
    });
    console.log(`  ➕ Added ${newUAIDs.length} new items to snapshot`);
  }
  
  // Fetch the updated snapshot
  const updatedSnapshot = await prisma.inventorySnapshot.findUnique({
    where: { id: latestSnapshot.id },
    include: {
      items: true
    }
  });
  
  console.log(`✅ Snapshot updated successfully (ID: ${latestSnapshot.id})`);
  return updatedSnapshot!;
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
  
  // Check for new/changed items
  newItems.forEach((qty, assetId) => {
    const oldQty = oldItems.get(assetId) || 0;
    if (oldQty === 0) {
      added.push(assetId);
    } else if (oldQty !== qty) {
      quantityChanged.push({ assetId, from: oldQty, to: qty });
    }
  });
  
  // Check for removed items
  oldItems.forEach((qty, assetId) => {
    if (!newItems.has(assetId)) {
      removed.push(assetId);
    }
  });
  
  return { added, removed, quantityChanged };
}