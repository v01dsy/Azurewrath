import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Add item to watchlist
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    const userIdBigInt = BigInt(userId);
    const itemIdBigInt = BigInt(itemId);

    // Create watchlist entry
    await prisma.watchlist.create({
      data: {
        userId: userIdBigInt,
        itemId: itemIdBigInt
      }
    });

    return NextResponse.json({ success: true, message: 'Added to watchlist' });
  } catch (error: any) {
    // Handle duplicate entry
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Item already in watchlist' },
        { status: 400 }
      );
    }
    console.error('Add to watchlist error:', error);
    return NextResponse.json(
      { error: 'Failed to add to watchlist' },
      { status: 500 }
    );
  }
}

// Remove item from watchlist
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    const userIdBigInt = BigInt(userId);
    const itemIdBigInt = BigInt(itemId);

    await prisma.watchlist.delete({
      where: {
        userId_itemId: {
          userId: userIdBigInt,
          itemId: itemIdBigInt
        }
      }
    });

    return NextResponse.json({ success: true, message: 'Removed from watchlist' });
  } catch (error) {
    console.error('Remove from watchlist error:', error);
    return NextResponse.json(
      { error: 'Failed to remove from watchlist' },
      { status: 500 }
    );
  }
}

// Check if item is in watchlist
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    const userIdBigInt = BigInt(userId);
    const itemIdBigInt = BigInt(itemId);

    const watchlistEntry = await prisma.watchlist.findUnique({
      where: {
        userId_itemId: {
          userId: userIdBigInt,
          itemId: itemIdBigInt
        }
      }
    });

    return NextResponse.json({ isWatchlisted: !!watchlistEntry });
  } catch (error) {
    console.error('Check watchlist error:', error);
    return NextResponse.json(
      { error: 'Failed to check watchlist' },
      { status: 500 }
    );
  }
}