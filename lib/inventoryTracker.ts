import { PrismaClient } from '@prisma/client';
import { scanFullInventory } from './robloxApi';

const prisma = new PrismaClient();

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
  
  // Check if there's a snapshot from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todaySnapshot = await prisma.inventorySnapshot.findFirst({
    where: {
      userId,
      createdAt: { gte: today }
    },
    include: {
      items: true
    }
  });
  
  // If snapshot exists from today, delete it (we'll replace it)
  if (todaySnapshot) {
    console.log(`🗑️ Deleting existing snapshot from today...`);
    await prisma.inventorySnapshot.delete({
      where: { id: todaySnapshot.id }
    });
  }
  
  // Get the previous snapshot (not from today) to preserve scannedAt times
  const previousSnapshot = await prisma.inventorySnapshot.findFirst({
    where: {
      userId,
      createdAt: { lt: today }
    },
    orderBy: { createdAt: 'desc' },
    include: {
      items: true
    }
  });
  
  // Create a map of userAssetId -> scannedAt from previous snapshot
  const previousScannedTimes = new Map<string, Date>();
  if (previousSnapshot) {
    previousSnapshot.items.forEach(item => {
      previousScannedTimes.set(item.userAssetId, item.scannedAt);
    });
  }
  
  // Create snapshot with preserved scannedAt times for existing items
  console.log(`💾 Creating snapshot with ${inventory.length} items...`);
  const snapshot = await prisma.inventorySnapshot.create({
    data: {
      userId,
      items: {
        create: inventory.map((item: any) => {
          const userAssetId = item.userAssetId.toString();
          const existingScannedAt = previousScannedTimes.get(userAssetId);
          
          return {
            assetId: item.assetId.toString(),
            userAssetId: userAssetId,
            scannedAt: existingScannedAt || new Date()
          };
        }),
      },
    },
    include: {
      items: true,
    },
  });
  
  console.log(`✅ Snapshot created with ID: ${snapshot.id}`);
  return snapshot;
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