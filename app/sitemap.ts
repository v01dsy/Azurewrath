// app/sitemap.ts

import { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://azurewrath.lol';

  const [items, players, posts, tradeAds] = await Promise.all([
    prisma.item.findMany({
      where: { assetId: { not: 1n } },
      select: { assetId: true, updatedAt: true },
    }),
    prisma.user.findMany({
      select: { robloxUserId: true, updatedAt: true },
    }),
    prisma.post.findMany({
      where: { published: true, deletedAt: null },
      select: { slug: true, updatedAt: true },
    }),
    prisma.tradeAd.findMany({
      where: { active: true, deletedAt: null },
      select: { id: true, updatedAt: true },
    }),
  ]);

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

  const itemPages: MetadataRoute.Sitemap = items.map(item => ({
    url: `${baseUrl}/item/${item.assetId.toString()}`,
    lastModified: item.updatedAt,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }));

  const playerPages: MetadataRoute.Sitemap = players.map(player => ({
    url: `${baseUrl}/player/${player.robloxUserId.toString()}`,
    lastModified: player.updatedAt,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  const newsPages: MetadataRoute.Sitemap = posts.map(post => ({
    url: `${baseUrl}/news/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }));

  const tradePages: MetadataRoute.Sitemap = tradeAds.map(ad => ({
    url: `${baseUrl}/trade/${ad.id}`,
    lastModified: ad.updatedAt,
    changeFrequency: 'daily' as const,
    priority: 0.5,
  }));

  return [...staticPages, ...playerPages, ...itemPages, ...newsPages, ...tradePages];
}