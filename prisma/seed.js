import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed with sample Roblox Limited items
  const items = [
    {
      assetId: '1365767',
      name: 'Dominus Empyreus',
      imageUrl: 'https://t0.rbxcdn.com/1365767-png',
      description: 'A legendary dominus from the early days of Roblox',
    },
    {
      assetId: '1031341',
      name: 'Dominus Infernus',
      imageUrl: 'https://t0.rbxcdn.com/1031341-png',
      description: 'Fiery dominus with demonic aesthetics',
    },
    {
      assetId: '48474260',
      name: 'Sparkle Time Fedora',
      imageUrl: 'https://t0.rbxcdn.com/48474260-png',
      description: 'Elegant fedora with sparkle effects',
    },
  ];

  for (const item of items) {
    await prisma.item.upsert({
      where: { assetId: item.assetId },
      update: {},
      create: item,
    });
  }

  console.log('✅ Seed data loaded');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
