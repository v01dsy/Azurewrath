// prisma/seed.js
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import path from 'path';

dotenv.config();

const prisma = new PrismaClient();

async function loadAssetIds() {
  const filePath = path.join(process.cwd(), 'asset-ids.json');
  const raw = await readFile(filePath, 'utf8');
  const data = JSON.parse(raw);
  const ids = Array.isArray(data) ? data : data.assetIds;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('asset-ids.json must contain a non-empty array of asset IDs');
  }

  return ids.map(String).map(id => id.trim()).filter(Boolean);
}

async function fetchRolimonsData() {
  console.log('📡 Fetching ALL item data from Rolimons deals page...');
  
  try {
    const response = await axios.get('https://www.rolimons.com/deals', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });

    const html = response.data;
    const pattern = /var item_details = ({.+?});/s;
    const match = html.match(pattern);

    if (!match) {
      throw new Error('Could not find item_details in Rolimons page');
    }

    const itemsData = JSON.parse(match[1]);
    console.log(`✅ Successfully parsed ${Object.keys(itemsData).length} items from Rolimons`);
    
    return itemsData;
  } catch (error) {
    console.error('❌ Failed to fetch from Rolimons:', error.message);
    throw error;
  }
}

async function fetchThumbnail(assetId) {
  try {
    const response = await axios.get(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=420x420&format=Webp&isCircular=false`,
      { timeout: 5000 }
    );
    return response.data?.data?.[0]?.imageUrl || null;
  } catch (error) {
    return null;
  }
}

async function main() {
  console.log('🚀 Starting Rolimons-based seed...\n');

  try {
    // Load asset IDs
    const assetIds = await loadAssetIds();
    console.log(`📋 Found ${assetIds.length} asset IDs to seed\n`);

    // Fetch ALL data from Rolimons in one request
    const rolimonsData = await fetchRolimonsData();

    let seeded = 0;
    let skipped = 0;
    let errors = 0;

    for (const assetId of assetIds) {
      try {
        // Check if already exists
        const existing = await prisma.item.findUnique({
          where: { assetId },
          select: { assetId: true }
        });

        if (existing) {
          console.log(`⏭️  Skipping ${assetId} (already exists)`);
          skipped++;
          continue;
        }

        // Get data from Rolimons
        const itemData = rolimonsData[assetId];
        
        if (!itemData || !Array.isArray(itemData)) {
          console.log(`⚠️  No Rolimons data for ${assetId}`);
          errors++;
          continue;
        }

        // Rolimons data structure: [name, bestPrice, RAP, ...]
        const name = itemData[0] || `Item ${assetId}`;
        const bestPrice = itemData[1] || null;
        const rap = itemData[2] || null;

        // Fetch thumbnail (can be slow but non-blocking)
        const imageUrl = await fetchThumbnail(assetId) 
          || `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=420&height=420&format=Webp`;

        // Create item
        const item = await prisma.item.create({
          data: {
            assetId,
            name,
            imageUrl,
            description: `${name} - Asset ID: ${assetId}`
          }
        });

        // Create price history
        if (bestPrice !== null || rap !== null) {
          await prisma.priceHistory.create({
            data: {
              itemId: item.assetId,
              price: bestPrice ?? rap,
              rap: rap,
              lowestResale: bestPrice
            }
          });
        }

        console.log(`✅ Seeded: ${name} (${assetId})`);
        seeded++;

      } catch (error) {
        console.error(`❌ Error seeding ${assetId}:`, error.message);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Seed Summary:');
    console.log(`   ✅ Seeded: ${seeded}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n❌ Seed failed:', error.message);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });