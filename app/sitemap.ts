// app/sitemap.ts

import { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://azurewrath.lol';

  const [items, saleCounts] = await Promise.all([
    prisma.item.findMany({
      where: { assetId: { not: 1n } },
      select: { assetId: true, name: true, updatedAt: true },
    }),
    prisma.sale.groupBy({
      by: ['itemId'],
      _count: { id: true },
    }),
  ]);

  // Build a Map keyed by BigInt string so === comparisons are reliable
  const saleCountMap = new Map<string, number>(
    saleCounts.map(s => [s.itemId.toString(), s._count.id])
  );

  // maxSales must reflect the actual maximum across items that HAVE sales.
  // Fall back to 1 so we never divide by zero.
  const maxSales = saleCountMap.size > 0
    ? Math.max(...saleCountMap.values())
    : 1;

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/players`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sales`,
      lastModified: new Date(),
      changeFrequency: 'always',
      priority: 0.75,
    },
    {
      url: `${baseUrl}/deals`,
      lastModified: new Date(),
      changeFrequency: 'always',
      priority: 0.75,
    },
    {
      url: `${baseUrl}/trade`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/news`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/snipe`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/verify`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];

  const itemPages: MetadataRoute.Sitemap = items.map(item => {
    const sales = saleCountMap.get(item.assetId.toString()) ?? 0;
    // priority range: 0.1 (no sales) → 0.7 (most sold item)
    const rawPriority = 0.1 + (sales / maxSales) * 0.6;
    const priority = Math.round(rawPriority * 10) / 10;
    return {
      url: `${baseUrl}/item/${item.assetId.toString()}/${toSlug(item.name)}`,
      lastModified: item.updatedAt,
      changeFrequency: 'daily' as const,
      priority,
    };
  });

  return [...staticPages, ...itemPages];
}