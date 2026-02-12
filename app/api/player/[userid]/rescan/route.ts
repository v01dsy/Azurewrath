import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { saveInventorySnapshot } from '@/lib/inventoryTracker';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userid: string }> }
) {
  try {
    const { userid } = await params;

    // Find user
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { robloxUserId: userid },
          { id: userid }
        ]
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Trigger inventory scan and snapshot creation
    console.log(`🔄 Starting inventory rescan for user ${user.username} (${user.robloxUserId})`);
    
    const snapshot = await saveInventorySnapshot(user.id, user.robloxUserId);

    console.log(`✅ Rescan complete! Snapshot ID: ${snapshot.id}`);

    return NextResponse.json({ 
      success: true,
      snapshotId: snapshot.id,
      itemCount: snapshot.items.length,
      message: 'Inventory rescanned successfully'
    });

  } catch (error) {
    console.error('Rescan error:', error);
    return NextResponse.json(
      { error: 'Failed to rescan inventory', details: String(error) },
      { status: 500 }
    );
  }
}