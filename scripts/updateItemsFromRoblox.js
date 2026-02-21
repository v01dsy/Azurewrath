// scripts/updateItemsFromRoblox.js
import prisma from '../lib/prisma.js';  // Note: relative path, not @/lib/prisma
import { fetchRobloxItemData, fetchPriceData } from '../lib/robloxApi.js';

/**
 * Update item data from Roblox API
 * Run with: node scripts/updateItemsFromRoblox.js
 */
async function updateItemsFromRoblox() {
  console.log('🔄 Fetching Roblox data for all items...');

  try {
    const items = await prisma.item.findMany();

    for (const item of items) {
      console.log(`📥 Fetching data for ${item.name} (${item.assetId})...`);

      // Fetch from Roblox API
      await prisma.item.update({
        where: { assetId: item.assetId },
        data: {
          name: robloxData.name || item.name,
          description: robloxData.description || item.description,
          imageUrl: robloxData.imageUrl || item.imageUrl,
          // Only write if we got a real value back — don't overwrite with undefined
          ...(robloxData.isLimitedUnique !== undefined && {
            isLimitedUnique: robloxData.isLimitedUnique,
          }),
        },
      });
      console.log(`✅ Updated ${robloxData.name} (isLimitedUnique: ${robloxData.isLimitedUnique ?? 'unknown'})`);

      // Fetch price data
      const priceData = await fetchPriceData(item.assetId);
      if (priceData) {
        await prisma.priceHistory.create({
          data: {
            itemId: item.assetId,
            price: priceData.price || 0,
            rap: priceData.rap,
            lowestResale: priceData.lowestResale,
            salesVolume: 0,
          },
        });
        console.log(`💰 Price data: ${priceData.price} Robux`);
      }

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('✅ All items updated!');
  } catch (error) {
    console.error('Update failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateItemsFromRoblox();