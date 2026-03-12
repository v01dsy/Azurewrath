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

  const maxSales = Math.max(...saleCounts.map(s => s._count.id), 1);

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
    const sales = saleCounts.find(s => s.itemId === item.assetId)?._count.id ?? 0;
    const priority = Math.round((0.1 + (sales / maxSales) * 0.6) * 10) / 10;
    return {
      url: `${baseUrl}/item/${item.assetId.toString()}/${toSlug(item.name)}`,
      lastModified: item.updatedAt,
      changeFrequency: 'daily' as const,
      priority,
    };
  });

  return [...staticPages, ...itemPages];
}