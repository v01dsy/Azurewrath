// app/item/[...id]/page.tsx
// SERVER COMPONENT — fetches data at request time so Googlebot sees real content

import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import ItemClient from './ItemClient';

interface Props {
  params: Promise<{ id: string[] }>;
}

function bucket30(date: Date): string {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
  return d.toISOString();
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const assetId = id[0];

  const item = await prisma.item.findUnique({
    where: { assetId: BigInt(assetId) },
    select: { name: true, description: true },
  });

  if (!item) return { title: 'Item Not Found' };

  return {
    title: `${item.name}`,
    description:
      item.description ??
      `View price history, RAP, owners, and sales data for ${item.name} on Azurewrath.`,
  };
}

export default async function ItemPage({ params }: Props) {
  const { id } = await params;
  const assetId = id[0];

  if (!assetId || !/^\d+$/.test(assetId)) notFound();

  const item = await prisma.item.findUnique({
    where: { assetId: BigInt(assetId) },
    include: {
      priceHistory: {
        select: {
          id: true,
          itemId: true,
          price: true,
          rap: true,
          salesVolume: true,
          timestamp: true,
        },
        orderBy: { timestamp: 'asc' },
      },
    },
  });

  if (!item) notFound();

  // Bucket price history into 30-min slots (same logic as API route)
  const bucketMap = new Map<string, {
    id: string;
    itemId: string;
    price: number;
    rap: number | null;
    salesVolume: number | null;
    timestamp: string;
  }>();

  for (const ph of item.priceHistory) {
    const key = bucket30(ph.timestamp);
    bucketMap.set(key, {
      id: ph.id,
      itemId: ph.itemId.toString(),
      price: ph.price,
      rap: ph.rap ?? null,
      salesVolume: ph.salesVolume ?? null,
      timestamp: key,
    });
  }

  const priceHistory = Array.from(bucketMap.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const latest = priceHistory[priceHistory.length - 1];

  const itemData = {
    assetId: item.assetId.toString(),
    name: item.name,
    imageUrl: item.imageUrl ?? null,
    description: item.description ?? null,
    manipulated: item.manipulated,
    isLimitedUnique: item.isLimitedUnique ?? null,
    currentPrice: latest?.price ?? null,
    currentRap: latest?.rap ?? null,
    salesVolume: latest?.salesVolume ?? null,
    lastUpdated: latest?.timestamp ?? null,
    priceHistory,
  };

  return <ItemClient item={itemData} />;
}