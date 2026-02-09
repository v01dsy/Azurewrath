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

/**
 * Fetches the full inventory for a Roblox user by userId, scanning all relevant asset types.
 */
export async function scanFullInventory(userId: string) {
  const assetTypes = [
    8,  // Hat
    41, // Hair Accessory
    42, // Face Accessory
    43, // Neck Accessory
    44, // Shoulder Accessory
    45, // Front Accessory
    46, // Back Accessory
    47, // Waist Accessory
    2,  // T-Shirt
    11, // Shirt
    12, // Pants
    64, // Layered Clothing
  ];

  const fullInventory: any[] = [];

  for (const assetType of assetTypes) {
    let cursor: string | null = null;
    try {
      do {
        const url: string = cursor
          ? `https://inventory.roblox.com/v2/users/${userId}/inventory/${assetType}?sortOrder=Asc&limit=100&cursor=${cursor}`
          : `https://inventory.roblox.com/v2/users/${userId}/inventory/${assetType}?sortOrder=Asc&limit=100`;

        const response = await axios.get(url);
        const data = response.data;
        if (data && Array.isArray(data.data)) {
          fullInventory.push(...data.data);
        }
        cursor = data.nextPageCursor || null;
      } while (cursor);
    } catch (error) {
      console.warn(`Failed to fetch inventory for assetType ${assetType} and userId ${userId}:`, error);
    }
  }

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