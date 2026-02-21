// lib/robloxApi.ts
import axios from 'axios';
import prisma from "./prisma";

/**
 * Fetch the last owner of a UAID (user asset instance ID) from the database.
 * Returns the username of the last owner, or null if not found.
 */
export async function getLastOwnerByUAID(userAssetId: string): Promise<string | null> {
  // Query Roblox API for the current owner of the user asset ID
  try {
    const response = await axios.get(
      `https://inventory.roblox.com/v1/assets/${userAssetId}/owners?limit=1&sortOrder=Desc`
    );
    const data = response.data;
    if (data && data.data && data.data.length > 0) {
      // The API returns an array of owners, the first is the current owner
      const owner = data.data[0];
      // owner.user is an object with username and userId
      if (owner && owner.user && owner.user.username) {
        return owner.user.username;
      }
    }
    return null;
  } catch (error) {
    console.error(`Failed to fetch current owner for userAssetId ${userAssetId}:`, error);
    return null;
  }
}

/**
 * Fetches the Roblox user's headshot thumbnail URL using the recommended API.
 */
export async function fetchRobloxHeadshotUrl(userId: string, size: string = '150x150'): Promise<string | null> {
  try {
    const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=${size}&format=Png`;
    const response = await axios.get(url);
    const data = response.data;
    
    console.log('Headshot API response:', JSON.stringify(data, null, 2));
    
    if (data && data.data && data.data.length > 0 && data.data[0].imageUrl) {
      console.log('Returning imageUrl:', data.data[0].imageUrl);
      return data.data[0].imageUrl;
    }
    console.log('No imageUrl found in response');
    return null;
  } catch (error) {
    console.error(`Failed to fetch Roblox headshot for userId ${userId}:`, error);
    return null;
  }
}

/**
 * Scans a user's full collectibles inventory from Roblox.
 * 
 * FIXED: Now properly handles the Roblox API response structure:
 * - Response contains `data` array with collectible items
 * - Each item has: assetId, userAssetId, serialNumber, name, etc.
 * - Handles pagination with nextPageCursor
 * - Implements retry logic for rate limiting (429 errors)
 */
export async function scanFullInventory(userId: string, maxRetries = 3) {
  const fullInventory: any[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  console.log(`🔍 Starting inventory scan for userId: ${userId}`);

  do {
    const url: string = cursor
      ? `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100&cursor=${cursor}`
      : `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100`;

    console.log(`📄 Fetching page ${++pageCount}, current total: ${fullInventory.length}`);

    // Retry logic for THIS specific page only
    let response;
    let success = false;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await axios.get(url, { 
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        success = true;
        break; // Success, exit retry loop
      } catch (err: any) {
        if (err.response?.status === 429) {
          if (attempt < maxRetries) {
            const waitMs = 5000 * Math.pow(2, attempt - 1); // 5s, 10s, 20s
            console.warn(`⚠️ Rate limited (429). Waiting ${waitMs}ms before retry ${attempt}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
            continue; // Try again
          } else {
            // All retries exhausted for this page
            console.error(`❌ All retries exhausted for page ${pageCount}`);
            console.warn(`⚠️ Returning ${fullInventory.length} items collected so far.`);
            return fullInventory;
          }
        } else if (err.response?.status === 400) {
          console.error(`❌ Bad Request (400) - Invalid userId or private inventory: ${userId}`);
          throw new Error(`Cannot access inventory for userId ${userId}. User may not exist or inventory is private.`);
        } else if (err.response?.status === 404) {
          console.error(`❌ Not Found (404) - User does not exist: ${userId}`);
          throw new Error(`User ${userId} not found`);
        } else {
          // Non-429 error, fail immediately
          console.error(`❌ Error fetching page ${pageCount}:`, err.message);
          if (err.response?.data) {
            console.error(`Response data:`, err.response.data);
          }
          throw err;
        }
      }
    }

    if (!success || !response) {
      console.warn(`⚠️ Failed to fetch page ${pageCount}. Returning ${fullInventory.length} items.`);
      return fullInventory;
    }

    const data = response.data;
    
    // DEBUG: Log the response structure on first page
    if (pageCount === 1) {
      console.log(`🔍 DEBUG - First page response structure:`, JSON.stringify(data, null, 2).substring(0, 500));
    }

    // CRITICAL FIX: Check if data.data exists and is an array
    if (!data || !data.data || !Array.isArray(data.data)) {
      console.error(`❌ Unexpected response structure on page ${pageCount}:`, data);
      console.warn(`Expected response.data.data to be an array, got:`, typeof data?.data);
      return fullInventory;
    }

    // Process items from this page
    const items = data.data;
    
    if (items.length === 0 && pageCount === 1) {
      console.log(`✅ User has an empty collectibles inventory`);
      return fullInventory;
    }

    // Map and validate each item
    const processedItems = items.map((item: any, index: number) => {
      // Validate required fields
      if (!item.assetId || !item.userAssetId) {
        console.warn(`⚠️ Item ${index} on page ${pageCount} missing required fields:`, item);
        return null;
      }

      return {
        assetId: item.assetId,
        userAssetId: item.userAssetId,
        serialNumber: item.serialNumber ?? null,
        name: item.name || `Unknown Item ${item.assetId}`,
        assetType: item.assetType || null,
        created: item.created || null
      };
    }).filter(Boolean); // Remove null entries

    fullInventory.push(...processedItems);
    console.log(`✅ Page ${pageCount} added ${processedItems.length} items. Total now: ${fullInventory.length}`);

    cursor = data.nextPageCursor || null;
    console.log(`🔗 Next cursor: ${cursor ? 'exists' : 'null (done)'}`);

    if (cursor) {
      // Add delay between pages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay
    }
  } while (cursor);

  console.log(`✅ Successfully fetched ${fullInventory.length} total items in ${pageCount} pages`);
  return fullInventory;
}

/**
 * Fetch Roblox user info by userId
 */
export async function fetchRobloxUserInfo(userId: string) {
  try {
    const res = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
    return res.data;
  } catch (error) {
    console.error(`Failed to fetch Roblox user info for userId ${userId}:`, error);
    return null;
  }
}

/**
 * Fetch Roblox userId from username
 * 
 * Uses the official Roblox API: https://api.roblox.com/users/get-by-username
 */
export async function fetchRobloxUserIdByUsername(username: string): Promise<string | null> {
  try {
    const res = await axios.get(
      `https://www.roblox.com/users/profile?username=${encodeURIComponent(username)}`,
    );
    const html = res.data as string;
    const match = html.match(/\/users\/(\d+)\/profile/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  } catch (error) {
    console.error(`Failed to fetch userId for username ${username}:`, error);
    return null;
  }
}

const ROBLOX_API_BASE = 'https://catalog.roblox.com/v1';
const ROBLOX_THUMBS = 'https://thumbnails.roblox.com/v1/assets';

export interface RobloxItemData {
  name: string;
  description: string;
  imageUrl: string;
  price?: number;
  isLimitedUnique?: boolean; // true = Limited U, false = Limited
}

/**
 * Fetch item details from Roblox API
 */
export async function fetchRobloxItemData(assetId: string): Promise<RobloxItemData | null> {
  try {
    const catalogRes = await axios.get(
      `${ROBLOX_API_BASE}/catalog/items/${assetId}/details`,
    );

    const catalogData = catalogRes.data;

    // Fetch IsLimitedUnique from economy API (same endpoint used by fetchPriceData)
    let isLimitedUnique: boolean | undefined = undefined;
    try {
      const economyRes = await axios.get(
        `https://economy.roblox.com/v2/assets/${assetId}/details`
      );
      if (typeof economyRes.data?.IsLimitedUnique === 'boolean') {
        isLimitedUnique = economyRes.data.IsLimitedUnique;
      }
    } catch (err) {
      console.warn(`Economy details fetch failed for asset ${assetId}:`, err);
    }

    let imageUrl = '';
    try {
      const thumbRes = await axios.get(
        `${ROBLOX_THUMBS}?assetIds=${assetId}&size=150x150&format=Png&isCircular=false`,
      );
      if (thumbRes.data.data && thumbRes.data.data.length > 0) {
        imageUrl = thumbRes.data.data[0].imageUrl;
      }
    } catch (err) {
      console.warn(`Thumbnail fetch failed for asset ${assetId}:`, err);
    }

    return {
      name: catalogData.Name || '',
      description: catalogData.Description || '',
      imageUrl: imageUrl || `https://www.roblox.com/asset/?id=${assetId}`,
      price: catalogData.PriceInRobux || undefined,
      isLimitedUnique,
    };
  } catch (error) {
    console.error(`Failed to fetch Roblox data for asset ${assetId}:`, error);
    return null;
  }
}

/**
 * Fetch price data from Roblox's official economy API
 * 
 * UPDATED: Now uses Roblox's native APIs instead of Rolimons
 * Following your instructions to use only Roblox APIs
 */
export async function fetchPriceData(assetId: string) {
  try {
    // Step 1: Get CollectibleItemId from asset details
    const detailsRes = await axios.get(
      `https://economy.roblox.com/v2/assets/${assetId}/details`
    );
    
    if (!detailsRes.data || !detailsRes.data.CollectibleItemId) {
      console.warn(`Asset ${assetId} is not a collectible item (no CollectibleItemId)`);
      return null;
    }
    
    const collectibleItemId = detailsRes.data.CollectibleItemId;
    console.log(`📊 Asset ${assetId} -> CollectibleItemId: ${collectibleItemId}`);
    
    // Step 2: Get resale data using CollectibleItemId
    const resaleRes = await axios.get(
      `https://apis.roblox.com/marketplace-sales/v1/item/${collectibleItemId}/resale-data`
    );
    
    const resaleData = resaleRes.data;
    
    return {
      price: resaleData.recentAveragePrice || null,
      rap: resaleData.recentAveragePrice || null,
      lowestResale: resaleData.lowestPrice || null,
      volume: resaleData.volumeRemaining || null,
      assetStock: resaleData.assetStock || null,
      salesUnavailableReason: resaleData.salesUnavailableReason || null
    };
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.warn(`No resale data available for asset ${assetId} (404)`);
    } else {
      console.warn(`Price fetch failed for asset ${assetId}:`, error.message);
    }
    return null;
  }
}

/**
 * DEPRECATED - Use fetchPriceData instead
 * This is kept only for backwards compatibility
 */
export async function fetchPriceDataRolimons(assetId: string) {
  console.warn('⚠️ fetchPriceDataRolimons is deprecated. Use fetchPriceData instead for Roblox native APIs.');
  try {
    const response = await axios.get(
      `https://api.rolimons.com/itemapi/itemdetails?assetids=${assetId}`,
      { timeout: 5000 },
    );

    if (response.data && response.data.data && response.data.data[assetId]) {
      const itemData = response.data.data[assetId];
      return {
        price: itemData.recent_average_price || itemData.value,
        rap: itemData.recent_average_price,
        lowestResale: itemData.value_details?.min || undefined,
      };
    }
  } catch (error) {
    console.warn(`Price fetch failed for asset ${assetId}:`, error);
  }

  return null;
}

export async function canViewInventory(robloxUserId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://inventory.roblox.com/v1/users/${robloxUserId}/can-view-inventory`
    );
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    return data.canView === true;
  } catch (error) {
    console.error('Error checking inventory visibility:', error);
    return false;
  }
}