import prisma from '@/lib/prisma';
import { fetchRobloxUserInfo, fetchRobloxHeadshotUrl, scanFullInventory } from '@/lib/robloxApi';
import { saveInventorySnapshot } from '@/lib/inventoryTracker';
import ClientInventoryGrid from '@/app/player/[userid]/ClientInventoryGrid';
import InventoryGraph from '@/app/player/[userid]/InventoryGraph';
import { Metadata } from 'next';

// Define the inventory item type
interface InventoryItem {
  assetId: string;
  userAssetId: string;
  serialNumber?: number | null;
  name?: string;
  recentAveragePrice?: number;
}

// Define the display item type for the grid
interface DisplayItem {
  assetId: string;
  name: string;
  imageUrl: string;
  rap: number;
  count: number;
  userAssetIds: string[];
  serialNumbers: (number | null)[];
}

// Generate metadata for the page
export async function generateMetadata({ params }: { params: Promise<{ userid: string }> }): Promise<Metadata> {
  const { userid } = await params;
  
  let user = null;
  if (userid) {
    user = await prisma.user.findUnique({ where: { robloxUserId: userid } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { id: userid } });
    }
  }
  
  const username = user?.username || 'User';
  
  return {
    title: `${username} | Roblox Inventory`,
    description: `View ${username}'s Roblox inventory, RAP, and collectibles history.`,
  };
}

// Helper function for "time ago"
function timeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };
  
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
    }
  }
  
  return 'just now';
}

export default async function PlayerPage({ params }: { params: Promise<{ userid: string }> }) {
  const { userid } = await params;
  
  let user = null;
  if (userid) {
    user = await prisma.user.findUnique({ where: { robloxUserId: userid } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { id: userid } });
    }
  }

  // If user not found, show prompt instead of auto-creating
  if (!user && userid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 text-center max-w-md">
          <h2 className="text-white text-2xl mb-4">User Not in Database</h2>
          <p className="text-slate-400 mb-6">
            This user isn't in the database yet. Would you like to add them?
          </p>
          <form action={`/api/load-user/${userid}`} method="POST">
            <button 
              type="submit"
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              Add User to Database
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white text-2xl">User not found.</div>
      </div>
    );
  }

  // Fetch avatar image
  const avatarResponse = await fetch(
    `https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.robloxUserId}&size=420x420&format=Png&isCircular=false`
  );
  const avatarData = await avatarResponse.json();
  const avatarImageUrl = avatarData.data?.[0]?.imageUrl;

  // Fetch latest snapshot first to check if we need to rescan
  const latestSnapshot = await prisma.inventorySnapshot.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      items: {
        include: {
          item: {
            include: {
              priceHistory: {
                orderBy: { timestamp: 'desc' },
                take: 1
              }
            }
          }
        }
      }
    }
  });

  // Check if we need to scan based on snapshot age and inventory changes
  let inventory: InventoryItem[] = [];
  let needsNewSnapshot = false;

  if (latestSnapshot) {
    const hoursSinceSnapshot = (Date.now() - new Date(latestSnapshot.createdAt).getTime()) / (1000 * 60 * 60);
    console.log(`Hours since last snapshot: ${hoursSinceSnapshot.toFixed(2)}`);
    
    // ALWAYS fetch current inventory to check for new/removed items
    console.log('Fetching current inventory to check for changes...');
    const currentInventory = await scanFullInventory(user.robloxUserId);
    
    if (currentInventory.length === 0) {
      return (
        <div className="min-h-screen bg-slate-900 p-4">
          <div className="max-w-6xl mx-auto">
            <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 text-center">
              <p className="text-white text-xl mb-2">Unable to load inventory</p>
              <p className="text-slate-400">Roblox API timed out. Please try again in a moment.</p>
            </div>
          </div>
        </div>
      );
    }
    
    // Compare UAIDs to detect changes
    const currentUAIDs = new Set(currentInventory.map((item: any) => item.userAssetId.toString()));
    const oldUAIDs = new Set(latestSnapshot.items.map(item => item.userAssetId));
    
    // Find new and removed items
    const newUAIDs = [...currentUAIDs].filter(uaid => !oldUAIDs.has(uaid));
    const removedUAIDs = [...oldUAIDs].filter(uaid => !currentUAIDs.has(uaid));
    
    if (newUAIDs.length > 0 || removedUAIDs.length > 0) {
      console.log(`📊 Inventory changes detected:`);
      console.log(`  ➕ New items: ${newUAIDs.length}`);
      console.log(`  ➖ Removed items: ${removedUAIDs.length}`);
      needsNewSnapshot = true;
    } else if (hoursSinceSnapshot >= 24) {
      console.log('No changes detected, but snapshot is 24+ hours old. Creating new snapshot.');
      needsNewSnapshot = true;
    } else {
      console.log('No changes detected, using existing snapshot.');
      needsNewSnapshot = false;
    }
    
    inventory = currentInventory;
  } else {
    // No snapshot exists, need to scan
    console.log('No previous snapshot, scanning...');
    inventory = await scanFullInventory(user.robloxUserId);
    
    if (inventory.length === 0) {
      return (
        <div className="min-h-screen bg-slate-900 p-4">
          <div className="max-w-6xl mx-auto">
            <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 text-center">
              <p className="text-white text-xl mb-2">Unable to load inventory</p>
              <p className="text-slate-400">Roblox API timed out. Please try again in a moment.</p>
            </div>
          </div>
        </div>
      );
    }
    needsNewSnapshot = true;
  }

  // Save new snapshot if changes detected or no snapshot exists
  if (needsNewSnapshot) {
    await saveInventorySnapshot(user.id, user.robloxUserId);
    console.log('✅ Created new snapshot');
  }

  // Fetch historical snapshots for graph
  const snapshots = await prisma.inventorySnapshot.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    include: {
      items: {
        include: {
          item: {
            include: {
              priceHistory: {
                orderBy: { timestamp: 'desc' },
                take: 1
              }
            }
          }
        }
      }
    },
    take: 30 // Last 30 snapshots
  });

  // Process snapshots into graph data
  const graphData = snapshots.map(snapshot => {
    const totalRAP = snapshot.items.reduce((sum, item) => {
      const rap = item.item?.priceHistory[0]?.rap || 0;
      return sum + rap;
    }, 0);

    const uniqueItems = new Set(snapshot.items.map(item => item.assetId)).size;

    return {
      date: new Date(snapshot.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      rap: totalRAP,
      itemCount: snapshot.items.length,
      uniqueCount: uniqueItems
    };
  });
  
  // Get unique assetIds from inventory
  const assetIds = [...new Set(inventory.map((item: InventoryItem) => item.assetId.toString()))];
  
  // Fetch item data from database
  const dbItems = await prisma.item.findMany({
    where: {
      assetId: {
        in: assetIds
      }
    },
    include: {
      priceHistory: {
        orderBy: {
          timestamp: 'desc'
        },
        take: 1
      }
    }
  });
  
  // Create a map for quick lookup
  const itemMap = new Map(dbItems.map(item => [item.assetId, item]));
  
  // Group items by assetId and count, enriching with database data
  const itemCounts: Record<string, DisplayItem> = inventory.reduce((acc: Record<string, DisplayItem>, item: InventoryItem) => {
    const id = item.assetId.toString();
    if (!acc[id]) {
      const dbItem = itemMap.get(id);
      const latestPrice = dbItem?.priceHistory[0];
      acc[id] = {
        assetId: id,
        name: dbItem?.name || item.name || 'Unknown Item',
        imageUrl: dbItem?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
        rap: latestPrice?.rap || item.recentAveragePrice || 0,
        count: 0,
        userAssetIds: [],
        serialNumbers: []
      };
    }
    acc[id].count++;
    acc[id].userAssetIds.push(item.userAssetId);
    acc[id].serialNumbers.push(item.serialNumber ?? null);
    return acc;
  }, {});

  const uniqueItems: DisplayItem[] = Object.values(itemCounts);
  
  // Calculate total RAP
  const totalRAP = uniqueItems.reduce((sum: number, item: DisplayItem) => {
    return sum + (item.rap * item.count);
  }, 0);

  const scannedTime = latestSnapshot ? timeAgo(latestSnapshot.createdAt) : null;

  return (
    <div className="min-h-screen bg-slate-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Top Row - Sidebar + Graph */}
        <div className="flex items-stretch gap-6 mb-8">
          {/* Left Sidebar - Avatar & Profile Info */}
          <div className="w-80 flex-shrink-0">
            <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-6 h-full">
              {avatarImageUrl ? (
                <img
                  src={avatarImageUrl}
                  alt={`${user.displayName || user.username}'s avatar`}
                  className="w-full h-auto rounded-lg mb-6"
                />
              ) : (
                <div className="w-full aspect-square bg-slate-700/50 rounded-lg flex items-center justify-center mb-6">
                  <span className="text-slate-400">Loading...</span>
                </div>
              )}

              {/* Profile Info */}
              <div className="space-y-3">
                <div>
                  <h1 className="text-2xl font-bold text-white">{user.displayName || user.username}</h1>
                  <p className="text-purple-300">@{user.username}</p>
                </div>
                {user.description && (
                  <p className="text-slate-300 text-sm">{user.description}</p>
                )}
                <div className="text-slate-400 text-xs">
                  Roblox ID: {user.robloxUserId}
                </div>
                {/* Stats */}
                <div className="space-y-2 pt-4 border-t border-slate-700">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Total Items</span>
                    <span className="text-blue-400 font-semibold">{inventory.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Unique Items</span>
                    <span className="text-purple-400 font-semibold">{uniqueItems.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Total RAP</span>
                    <span className="text-green-400 font-semibold">{totalRAP.toLocaleString()} R$</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Graph */}
          <div className="flex-1 min-h-[400px]">
            <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 h-full">
              <InventoryGraph data={graphData} />
            </div>
          </div>
        </div>

        {/* Inventory Grid - Full Width Below */}
        <div>
          <ClientInventoryGrid items={uniqueItems as any} scannedTime={scannedTime} />
        </div>
      </div>
    </div>
  );
}