// scripts/backfillLimitedUnique.ts
// One-time script to populate isLimitedUnique for all items in the DB
// Run with: npx tsx scripts/backfillLimitedUnique.ts

import axios from 'axios';
import prisma from '../lib/prisma.js';

const DELAY_MS = 1200;        // 1.2s between requests
const RETRY_DELAY_MS = 10000; // 10s wait after a 429
const MAX_RETRIES = 3;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchIsLimitedUnique(assetId: string): Promise<boolean | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await axios.get(
        `https://economy.roblox.com/v2/assets/${assetId}/details`
      );
      if (typeof res.data?.IsLimitedUnique === 'boolean') {
        return res.data.IsLimitedUnique;
      }
      return null;
    } catch (err: any) {
      if (err.response?.status === 429) {
        console.warn(`⏳ Rate limited — waiting ${RETRY_DELAY_MS / 1000}s before retry ${attempt}/${MAX_RETRIES}...`);
        await sleep(RETRY_DELAY_MS);
      } else {
        throw err; // Non-429 error, don't retry
      }
    }
  }
  throw new Error(`Exceeded max retries for asset ${assetId}`);
}

async function backfillLimitedUnique() {
  console.log('🔄 Starting isLimitedUnique backfill...\n');

  const items = await prisma.item.findMany({
    select: { assetId: true, name: true, isLimitedUnique: true },
  });

  // Only process items that haven't been set yet
  const pending = items.filter(i => i.isLimitedUnique === null);
  const alreadyDone = items.length - pending.length;

  console.log(`📦 Total items: ${items.length}`);
  console.log(`⏭️  Already set: ${alreadyDone}`);
  console.log(`🔧 To process: ${pending.length}\n`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    const assetId = item.assetId.toString();
    const progress = `[${i + 1}/${pending.length}]`;

    try {
      const isLimitedUnique = await fetchIsLimitedUnique(assetId);

      await prisma.item.update({
        where: { assetId: item.assetId },
        data: { isLimitedUnique },
      });

      const label = isLimitedUnique === true
        ? '✅ Limited U'
        : isLimitedUnique === false
        ? '🔷 Limited  '
        : '❓ Unknown  ';

      console.log(`${progress} ${label} — ${item.name}`);
      updated++;

    } catch (err: any) {
      console.warn(`${progress} ❌ Failed — ${item.name} (${assetId}): ${err.message}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log('\n========== DONE ==========');
  console.log(`✅ Updated:           ${updated}`);
  console.log(`⏭️  Already set:       ${alreadyDone}`);
  console.log(`❌ Failed:            ${failed}`);

  await prisma.$disconnect();
}

backfillLimitedUnique();