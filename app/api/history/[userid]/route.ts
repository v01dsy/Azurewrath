// app/api/history/[userid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const revalidate = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userid: string }> }
) {
  try {
    const { userid } = await params;

    const user = await prisma.user.findUnique({
      where: { robloxUserId: BigInt(userid) },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch avatar
    let avatarUrl: string | null = null;
    try {
      const avatarResponse = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.robloxUserId}&size=420x420&format=Webp&isCircular=false`
      );
      if (avatarResponse.ok) {
        const avatarData = await avatarResponse.json();
        avatarUrl = avatarData.data?.[0]?.imageUrl || null;
      }
    } catch {}

    // All snapshots with their stored totalRAP (RAP at time of snapshot)
    const snapshots = await prisma.inventorySnapshot.findMany({
      where: { userId: user.robloxUserId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true, totalRAP: true, totalItems: true, uniqueItems: true },
    });

    // Deduplicate to one per calendar day (latest wins)
    const byDay = new Map<string, typeof snapshots[0]>();
    for (const snap of snapshots) {
      const day = new Date(snap.createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', timeZone: 'America/New_York',
      });
      byDay.set(day, snap);
    }

    const dedupedSnaps = Array.from(byDay.values());
    const snapshotIds = dedupedSnaps.map(s => s.id);

    // For each snapshot, calculate RAP using CURRENT prices
    // This gives us the cyan "now value" line per snapshot
    const currentRapPerSnapshot = await prisma.$queryRaw<Array<{
      snapshotId: string;
      currentRap: number;
    }>>`
      SELECT
        ii."snapshotId",
        COALESCE(SUM(ph.rap), 0) as "currentRap"
      FROM "InventoryItem" ii
      LEFT JOIN LATERAL (
        SELECT rap
        FROM "PriceHistory"
        WHERE "itemId" = ii."assetId"
        ORDER BY timestamp DESC
        LIMIT 1
      ) ph ON true
      WHERE ii."snapshotId" = ANY(${snapshotIds})
      GROUP BY ii."snapshotId"
    `;

    const currentRapMap = new Map(
      currentRapPerSnapshot.map(r => [r.snapshotId, Number(r.currentRap)])
    );

    const graphData = Array.from(byDay.entries()).map(([date, snap]) => ({
      snapshotId: snap.id,
      date,
      timestamp: new Date(snap.createdAt).getTime(),
      rapThen: Number(snap.totalRAP ?? 0),          // purple — RAP at snapshot time
      rap: currentRapMap.get(snap.id) ?? Number(snap.totalRAP ?? 0), // cyan — current prices applied to that inventory
      itemCount: Number(snap.totalItems ?? 0),
      uniqueCount: Number(snap.uniqueItems ?? 0),
    }));

    return NextResponse.json({
      user: {
        robloxUserId: user.robloxUserId.toString(),
        username: user.username,
        displayName: user.displayName,
        avatarUrl: avatarUrl || user.avatarUrl,
        description: user.description,
        role: user.role ?? 'user',
      },
      graphData,
      totalSnapshots: byDay.size,
    });

  } catch (error) {
    console.error('History route error:', error);
    return NextResponse.json({ error: 'Failed to fetch history', details: String(error) }, { status: 500 });
  }
}