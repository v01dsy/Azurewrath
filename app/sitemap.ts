// app/sitemap.ts

import { MetadataRoute } from 'next';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://azurewrath.lol';

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl,                   lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0  },
    { url: `${baseUrl}/search`,       lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9  },
    { url: `${baseUrl}/players`,      lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.9  },
    { url: `${baseUrl}/trade`,        lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.6  },
    { url: `${baseUrl}/news`,         lastModified: new Date(), changeFrequency: 'daily',   priority: 0.6  },
    { url: `${baseUrl}/verify`,       lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4  },
  ];

  try {
    const pool = getPool();
    const { rows } = await pool.query<{
      assetId: string;
      name: string;
      updatedAt: string;
      sitemap_priority: number;
    }>(`
      WITH sale_counts AS (
        SELECT "itemId", COUNT(id) AS sale_count
        FROM "Sale"
        GROUP BY "itemId"
      ),
      max_pow AS (
        SELECT GREATEST(MAX(sale_count) ^ 0.3, 1) AS max_p
        FROM sale_counts
      )
      SELECT
        i."assetId"::text,
        i.name,
        to_char(i."updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "updatedAt",
        ROUND(
          CAST(
            0.1 + (COALESCE(sc.sale_count, 0) ^ 0.3 / (SELECT max_p FROM max_pow)) * 0.6
          AS numeric), 1
        )::float AS sitemap_priority
      FROM "Item" i
      LEFT JOIN sale_counts sc ON sc."itemId" = i."assetId"
      WHERE i."assetId" != 1
    `);

    const itemPages: MetadataRoute.Sitemap = rows.map(row => ({
      url: `${baseUrl}/item/${row.assetId}/${toSlug(row.name)}`,
      lastModified: new Date(row.updatedAt),
      changeFrequency: 'daily' as const,
      priority: row.sitemap_priority,
    }));

    return [...staticPages, ...itemPages];
  } catch (err) {
    console.error('sitemap: DB query failed, returning static pages only:', err);
    return staticPages;
  }
}