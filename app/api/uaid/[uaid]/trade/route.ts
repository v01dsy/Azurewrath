import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uaid: string }> }
) {
  const { uaid } = await params;
  const pool = getPool();

  try {
    const uaidBigInt = BigInt(uaid);

    // ── Step 1: Find the most recent owner of this UAID and the trade timestamp ──
    const { rows: ownerRows } = await pool.query(`
      SELECT DISTINCT ON (s."userId")
        ii."uaidUpdatedAt",
        ii."assetId",
        ii."serialNumber",
        s."userId",
        s.id AS "snapshotId",
        s."createdAt"
      FROM "InventoryItem" ii
      JOIN "InventorySnapshot" s ON s.id = ii."snapshotId"
      WHERE ii."userAssetId" = $1
        AND ii."uaidUpdatedAt" IS NOT NULL
      ORDER BY s."userId", s."createdAt" DESC
    `, [uaidBigInt]);

    if (!ownerRows.length || !ownerRows[0].uaidUpdatedAt) {
      return NextResponse.json({ error: 'No trade timestamp found for this UAID' }, { status: 404 });
    }

    const sorted = [...ownerRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const receiverRow = sorted[0];
    const { uaidUpdatedAt: tradeTimestamp, userId: receiverId } = receiverRow;
    const prevOwnerRow = sorted[1] ?? null;
    const senderId = prevOwnerRow?.userId ?? null;

    // ── Step 2: Find receiver's snapshot BEFORE the trade ──
    const { rows: prevSnapRows } = await pool.query(`
      SELECT id, "createdAt"
      FROM "InventorySnapshot"
      WHERE "userId" = $1
        AND "createdAt" < $2
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [receiverId, tradeTimestamp]);

    const prevSnapshotId = prevSnapRows[0]?.id ?? null;

    // ── Step 3: Find receiver's snapshot AT or AFTER the trade ──
    const { rows: afterSnapRows } = await pool.query(`
      SELECT id, "createdAt"
      FROM "InventorySnapshot"
      WHERE "userId" = $1
        AND "createdAt" >= $2
      ORDER BY "createdAt" ASC
      LIMIT 1
    `, [receiverId, tradeTimestamp]);

    const afterSnapshotId = afterSnapRows[0]?.id ?? null;

    // ── Step 4: Items received = in after snapshot but NOT in before snapshot ──
    let receivedItems: any[] = [];
    if (prevSnapshotId && afterSnapshotId) {
      const { rows } = await pool.query(`
        SELECT
          ii."userAssetId",
          ii."assetId",
          ii."serialNumber",
          i.name,
          i."imageUrl",
          COALESCE(ph.rap, 0) as rap
        FROM "InventoryItem" ii
        JOIN "Item" i ON i."assetId" = ii."assetId"
        LEFT JOIN LATERAL (
          SELECT rap FROM "PriceHistory"
          WHERE "itemId" = ii."assetId"
          ORDER BY timestamp DESC LIMIT 1
        ) ph ON true
        WHERE ii."snapshotId" = $1
          AND ii."userAssetId" NOT IN (
            SELECT "userAssetId" FROM "InventoryItem" WHERE "snapshotId" = $2
          )
        ORDER BY ii."serialNumber" ASC NULLS LAST
      `, [afterSnapshotId, prevSnapshotId]);
      receivedItems = rows;
    }

    // ── Step 5: Items sent = sender's items with matching uaidUpdatedAt ──
    let sentItems: any[] = [];
    if (senderId) {
      const { rows } = await pool.query(`
        SELECT DISTINCT ON (ii."userAssetId")
          ii."userAssetId",
          ii."assetId",
          ii."serialNumber",
          i.name,
          i."imageUrl",
          COALESCE(ph.rap, 0) as rap
        FROM "InventoryItem" ii
        JOIN "Item" i ON i."assetId" = ii."assetId"
        LEFT JOIN LATERAL (
          SELECT rap FROM "PriceHistory"
          WHERE "itemId" = ii."assetId"
          ORDER BY timestamp DESC LIMIT 1
        ) ph ON true
        WHERE ii."uaidUpdatedAt" BETWEEN $2::timestamp - INTERVAL '5 minutes'
                                        AND $2::timestamp + INTERVAL '5 minutes'
          AND ii."userAssetId" IN (
            SELECT ii2."userAssetId"
            FROM "InventoryItem" ii2
            JOIN "InventorySnapshot" snap ON snap.id = ii2."snapshotId"
            WHERE snap."userId" = $1
          )
          AND ii."userAssetId" != $3::bigint
        ORDER BY ii."userAssetId"
      `, [senderId, tradeTimestamp, uaid]);
      sentItems = rows;
    }

    // ── Step 6: Fetch the UAID's own item details ──
    const { rows: uaidItemRows } = await pool.query(`
      SELECT i.name, i."imageUrl", COALESCE(ph.rap, 0) as rap
      FROM "Item" i
      LEFT JOIN LATERAL (
        SELECT rap FROM "PriceHistory"
        WHERE "itemId" = i."assetId"
        ORDER BY timestamp DESC LIMIT 1
      ) ph ON true
      WHERE i."assetId" = $1
    `, [receiverRow.assetId]);

    const uaidItem = uaidItemRows[0] ?? null;

    // ── Step 7: Fetch receiver + sender user info ──
    const { rows: receiverUserRows } = await pool.query(`
      SELECT username, "displayName", "avatarUrl", "robloxUserId"
      FROM "User" WHERE "robloxUserId" = $1
    `, [receiverId]);

    const { rows: senderUserRows } = senderId ? await pool.query(`
      SELECT username, "displayName", "avatarUrl", "robloxUserId"
      FROM "User" WHERE "robloxUserId" = $1
    `, [senderId]) : { rows: [] };

    const receiver = receiverUserRows[0] ?? null;
    const sender = senderUserRows[0] ?? null;

    const uaidAlreadyInReceived = receivedItems.some(
      r => r.userAssetId.toString() === uaid
    );
    const receivedFinal = [
      ...(uaidAlreadyInReceived ? [] : [{
        userAssetId: uaid,
        assetId: receiverRow.assetId.toString(),
        serialNumber: receiverRow.serialNumber ?? null,
        name: uaidItem?.name ?? null,
        imageUrl: uaidItem?.imageUrl ?? null,
        rap: uaidItem?.rap ? Number(uaidItem.rap) : null,
      }]),
      ...receivedItems.map(r => ({
        userAssetId: r.userAssetId.toString(),
        assetId: r.assetId.toString(),
        serialNumber: r.serialNumber ?? null,
        name: r.name,
        imageUrl: r.imageUrl,
        rap: r.rap ? Number(r.rap) : null,
      })),
    ];

    return NextResponse.json({
      tradeTimestamp,
      receiver: receiver ? {
        robloxUserId: receiver.robloxUserId.toString(),
        username: receiver.username,
        displayName: receiver.displayName,
        avatarUrl: receiver.avatarUrl,
      } : null,
      sender: sender ? {
        robloxUserId: sender.robloxUserId.toString(),
        username: sender.username,
        displayName: sender.displayName,
        avatarUrl: sender.avatarUrl,
      } : null,
      received: receivedFinal,
      sent: sentItems.map(s => ({
        userAssetId: s.userAssetId.toString(),
        assetId: s.assetId.toString(),
        serialNumber: s.serialNumber ?? null,
        name: s.name,
        imageUrl: s.imageUrl,
        rap: s.rap ? Number(s.rap) : null,
      })),
    });
  } catch (err) {
    console.error('Inferred trade error:', err);
    return NextResponse.json({ error: 'Failed to infer trade' }, { status: 500 });
  }
}