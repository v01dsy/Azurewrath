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

import axios from 'axios';

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

export async function scanFullInventory(userId: string, maxRetries = 3) {
  const fullInventory: any[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

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
        response = await axios.get(url, { timeout: 30000 });
        success = true;
        break; // Success, exit retry loop
      } catch (err: any) {
        if (err.response?.status === 429) {
          if (attempt < maxRetries) {
            const waitMs = 5000 * Math.pow(2, attempt - 1); // 5s, 10s, 20s
            console.warn(`Rate limited (429). Waiting ${waitMs}ms before retry ${attempt}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
            continue; // Try again
          } else {
            // All retries exhausted for this page
            console.error(`❌ Attempt ${attempt} failed for userId ${userId}:`, err);
            console.warn(`⚠️ All retries exhausted. Returning ${fullInventory.length} items collected so far.`);
            return fullInventory;
          }
        } else {
          // Non-429 error, fail immediately
          console.error(`❌ Error fetching page ${pageCount}:`, err);
          throw err;
        }
      }
    }

    if (!success || !response) {
      console.warn(`⚠️ Failed to fetch page ${pageCount}. Returning ${fullInventory.length} items.`);
      return fullInventory;
    }

    const data = response.data;
    if (data && Array.isArray(data.data)) {
      fullInventory.push(...data.data);
      console.log(`✅ Page ${pageCount} added ${data.data.length} items. Total now: ${fullInventory.length}`);
    }

    cursor = data.nextPageCursor || null;
    console.log(`🔗 Next cursor: ${cursor ? 'exists' : 'null (done)'}`);

    if (cursor) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay between pages
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
 * Fetch Roblox userId from username by scraping the profile page
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
    };
  } catch (error) {
    console.error(`Failed to fetch Roblox data for asset ${assetId}:`, error);
    return null;
  }
}

/**
 * Fetch price history from market APIs
 */
export async function fetchPriceData(assetId: string) {
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