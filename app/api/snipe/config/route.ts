// app/api/snipe/config/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// ── helpers ────────────────────────────────────────────────────────────────

function getUserId(req: NextRequest): bigint | null {
  const raw = req.nextUrl.searchParams.get('userId');
  try { return raw ? BigInt(raw) : null; } catch { return null; }
}

// ── GET  /api/snipe/config?userId=xxx ──────────────────────────────────────
export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const configs = await prisma.snipeConfig.findMany({
    where: { userId },
    include: { item: { select: { name: true, imageUrl: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(
    configs.map(c => ({
      id: c.id,
      assetId: c.assetId?.toString() ?? null,
      itemName: c.item?.name ?? null,
      itemImage: c.item?.imageUrl ?? null,
      minDeal: c.minDeal,
      minPrice: c.minPrice,
      maxPrice: c.maxPrice,
      enabled: c.enabled,
      createdAt: c.createdAt,
    }))
  );
}

// ── POST  /api/snipe/config  { userId, assetId?, minDeal, minPrice?, maxPrice? } ──
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId: rawId, assetId: rawAsset, minDeal = 10, minPrice, maxPrice } = body;

  if (!rawId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const userId = BigInt(rawId);
  const assetId = rawAsset ? BigInt(rawAsset) : null;

  // Cap at 10 configs per user to keep things sane
  const existing = await prisma.snipeConfig.count({ where: { userId } });
  if (existing >= 10) {
    return NextResponse.json({ error: 'Max 10 snipe configs per user' }, { status: 400 });
  }

  const config = await prisma.snipeConfig.create({
    data: {
      userId,
      assetId,
      minDeal: Number(minDeal),
      minPrice: minPrice != null ? Number(minPrice) : null,
      maxPrice: maxPrice != null ? Number(maxPrice) : null,
    },
  });

  return NextResponse.json({ id: config.id });
}

// ── PATCH  /api/snipe/config  { id, ...fields } ───────────────────────────
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, minDeal, minPrice, maxPrice, enabled } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const updated = await prisma.snipeConfig.update({
    where: { id },
    data: {
      ...(minDeal != null && { minDeal: Number(minDeal) }),
      ...(minPrice !== undefined && { minPrice: minPrice != null ? Number(minPrice) : null }),
      ...(maxPrice !== undefined && { maxPrice: maxPrice != null ? Number(maxPrice) : null }),
      ...(enabled != null && { enabled: Boolean(enabled) }),
    },
  });

  return NextResponse.json({ id: updated.id });
}

// ── DELETE  /api/snipe/config  { id } ─────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await prisma.snipeConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}