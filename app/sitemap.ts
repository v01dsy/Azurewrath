// app/sitemap.ts
import { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';

const baseUrl = 'https://azurewrath.lol';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [items, users] = await Promise.all([
    prisma.item.findMany({ select: { assetId: true, updatedAt: true } }),
    prisma.user.findMany({ select: { robloxUserId: true, updatedAt: true } }),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl,               lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${baseUrl}/search`,   lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${baseUrl}/sales`,    lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.8 },
    { url: `${baseUrl}/deals`,    lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.8 },
    { url: `${baseUrl}/players`,  lastModified: new Date(), changeFrequency: 'daily',   priority: 0.7 },
    { url: `${baseUrl}/trade`,    lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.7 },
    { url: `${baseUrl}/news`,     lastModified: new Date(), changeFrequency: 'daily',   priority: 0.6 },
    { url: `${baseUrl}/verify`,   lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ];

  const itemPages: MetadataRoute.Sitemap = items.map(item => ({
    url: `${baseUrl}/item/${item.assetId.toString()}`,
    lastModified: item.updatedAt,
    changeFrequency: 'hourly',
    priority: 0.8,
  }));

  const playerPages: MetadataRoute.Sitemap = users.map(user => ({
    url: `${baseUrl}/player/${user.robloxUserId.toString()}`,
    lastModified: user.updatedAt,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  return [...staticPages, ...itemPages, ...playerPages];
}