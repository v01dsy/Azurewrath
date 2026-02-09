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
    // Look for /users/{userId}/profile in the HTML
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

import axios from 'axios';

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
    // Fetch catalog details
    const catalogRes = await axios.get(
      `${ROBLOX_API_BASE}/catalog/items/${assetId}/details`,
    );

    const catalogData = catalogRes.data;

    // Fetch thumbnail
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
    // Try to fetch from various Roblox price tracking APIs
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
