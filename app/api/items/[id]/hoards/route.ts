// app/api/items/[id]/hoards/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assetId } = await params;

    // Cast to any to avoid Prisma generated-type mismatches on relation names
    const rows: any[] = await (prisma.inventoryItem as any).findMany({
      where: { assetId },
      orderBy: { scannedAt: 'desc' },
      include: {
        snapshot: {
          include: { user: true },
        },
      },
    });

    // Group by user, keeping only each user's most recent snapshot
    const userLatestSnapshot = new Map<string, string>();
    const userCopies = new Map<string, { userAssetId: string; serialNumber: number | null }[]>();
    const userMeta = new Map<string, { username: string; avatarUrl: string | null; scannedAt: string }>();

    for (const row of rows) {
      const snap = row.snapshot;
      if (!snap?.user) continue;

      const userId: string = snap.user.robloxUserId.toString();
      const snapshotId: string = snap.id;

      if (!userLatestSnapshot.has(userId)) {
        userLatestSnapshot.set(userId, snapshotId);
        userCopies.set(userId, []);
        userMeta.set(userId, {
          username: snap.user.username,
          avatarUrl: snap.user.avatarUrl ?? null,
          scannedAt: new Date(snap.createdAt).toISOString(),
        });
      }

      if (userLatestSnapshot.get(userId) === snapshotId) {
        userCopies.get(userId)!.push({
          userAssetId: row.userAssetId.toString(),
          serialNumber: row.serialNumber ?? null,
        });
      }
    }

    // Only keep users with 2+ copies
    const hoards: {
      robloxUserId: string;
      username: string;
      avatarUrl: string | null;
      count: number;
      copies: { userAssetId: string; serialNumber: number | null }[];
      scannedAt: string;
    }[] = [];

    for (const [userId, copies] of userCopies.entries()) {
      if (copies.length < 2) continue;
      const meta = userMeta.get(userId)!;
      hoards.push({
        robloxUserId: userId,
        username: meta.username,
        avatarUrl: meta.avatarUrl,
        count: copies.length,
        copies,
        scannedAt: meta.scannedAt,
      });
    }

    hoards.sort((a, b) => b.count - a.count);

    return NextResponse.json({ hoards });
  } catch (err) {
    console.error('Hoards fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch hoards' }, { status: 500 });
  }
}