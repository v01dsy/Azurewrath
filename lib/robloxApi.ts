// lib/robloxApi.ts
import axios from 'axios';
import prisma from "./prisma";

export async function getLastOwnerByUAID(userAssetId: string): Promise<string | null> {
  try {
    const response = await axios.get(
      `https://inventory.roblox.com/v1/assets/${userAssetId}/owners?limit=1&sortOrder=Desc`
    );
    const data = response.data;
    if (data && data.data && data.data.length > 0) {
      const owner = data.data[0];
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
 * Uses native fetch() instead of axios to avoid ECONNRESET on background
 * fire-and-forget scans — axios shares the Node HTTP agent with the
 * incoming request, which gets torn down once the response is sent.
 * fetch() has its own connection pool that outlives the request lifecycle.
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

    let data: any = null;
    let success = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let res: Response;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);
        try {
          res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (err: any) {
        console.error(`❌ Network error fetching page ${pageCount} (attempt ${attempt}):`, err.message);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 3000 * attempt));
          continue;
        }
        console.warn(`⚠️ All retries exhausted for page ${pageCount}. Returning ${fullInventory.length} items so far.`);
        return fullInventory;
      }

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000 * Math.pow(2, attempt - 1);
        if (attempt < maxRetries) {
          console.warn(`⚠️ Rate limited (429). Waiting ${waitMs}ms before retry ${attempt}/${maxRetries}...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        } else {
          console.error(`❌ All retries exhausted for page ${pageCount}`);
          console.warn(`⚠️ Returning ${fullInventory.length} items collected so far.`);
          return fullInventory;
        }
      }

      if (res.status === 400) {
        console.error(`❌ Bad Request (400) - Invalid userId or private inventory: ${userId}`);
        throw new Error(`Cannot access inventory for userId ${userId}. User may not exist or inventory is private.`);
      }

      if (res.status === 404) {
        console.error(`❌ Not Found (404) - User does not exist: ${userId}`);
        throw new Error(`User ${userId} not found`);
      }

      if (!res.ok) {
        console.error(`❌ Unexpected status ${res.status} on page ${pageCount}`);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 3000 * attempt));
          continue;
        }
        return fullInventory;
      }

      data = await res.json();
      success = true;
      break;
    }

    if (!success || !data) {
      console.warn(`⚠️ Failed to fetch page ${pageCount}. Returning ${fullInventory.length} items.`);
      break;
    }

    if (pageCount === 1) {
      console.log(`🔍 DEBUG - First page response structure:`, JSON.stringify(data, null, 2).substring(0, 500));
    }

    if (!data.data || !Array.isArray(data.data)) {
      console.error(`❌ Unexpected response structure on page ${pageCount}:`, data);
      console.warn(`Expected data.data to be an array, got:`, typeof data?.data);
      break;
    }

    const items: any[] = data.data;

    if (items.length === 0 && pageCount === 1) {
      console.log(`✅ User has an empty collectibles inventory`);
      return fullInventory;
    }

    const processedItems = items.map((item: any, index: number) => {
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
        created: item.created || null,
        isOnHold: item.isOnHold ?? null,
      };
    }).filter(Boolean);

    fullInventory.push(...processedItems);
    console.log(`✅ Page ${pageCount} added ${processedItems.length} items. Total now: ${fullInventory.length}`);

    cursor = data.nextPageCursor || null;
    console.log(`🔗 Next cursor: ${cursor ? 'exists' : 'null (done)'}`);

    if (cursor) {
      await new Promise(r => setTimeout(r, 2000));
    }
  } while (cursor);

  console.log(`✅ Successfully fetched ${fullInventory.length} total items in ${pageCount} pages`);
  return fullInventory;
}

export async function fetchRobloxUserInfo(userId: string) {
  try {
    const res = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
    return res.data;
  } catch (error) {
    console.error(`Failed to fetch Roblox user info for userId ${userId}:`, error);
    return null;
  }
}

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
  isLimitedUnique?: boolean;
}

export async function fetchRobloxItemData(assetId: string): Promise<RobloxItemData | null> {
  try {
    const catalogRes = await axios.get(
      `${ROBLOX_API_BASE}/catalog/items/${assetId}/details`,
    );

    const catalogData = catalogRes.data;

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

export async function fetchPriceData(assetId: string) {
  try {
    const detailsRes = await axios.get(
      `https://economy.roblox.com/v2/assets/${assetId}/details`
    );
    
    if (!detailsRes.data || !detailsRes.data.CollectibleItemId) {
      console.warn(`Asset ${assetId} is not a collectible item (no CollectibleItemId)`);
      return null;
    }
    
    const collectibleItemId = detailsRes.data.CollectibleItemId;
    console.log(`📊 Asset ${assetId} -> CollectibleItemId: ${collectibleItemId}`);
    
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

/**
 * Fetch full details for a single user asset (UAID).
 * - created/updated come from the owners API (paginated until UAID is found)
 * - Cursor cache allows resuming from the closest known page for this item
 *
 * Uses native fetch() instead of axios to survive background fire-and-forget
 * execution after the Next.js response has already been sent.
 */
export async function fetchUserAssetDetails(userId: string, userAssetId: string, assetId: string): Promise<{
  created: string | null;
  updated: string | null;
  isOnHold: boolean | null;
} | null> {
  try {
    const targetUAID = BigInt(userAssetId);
    const assetIdBigInt = BigInt(assetId);
    let pageNum = 0;
    let requestsSinceBreak = 0;

    const rawCookie = process.env.ROBLOX_SECURITY_COOKIE ?? '';
    const cleanCookie = rawCookie.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' };
    if (cleanCookie) headers['Cookie'] = `.ROBLOSECURITY=${cleanCookie}`;

    // ── Load closest cached cursor below target UAID ──────────────────────
    const cached = await prisma.uaidCursorCache.findFirst({
      where: { assetId: assetIdBigInt, lastUaid: { lt: targetUAID } },
      orderBy: { lastUaid: 'desc' },
    });

    let cursor: string | null = null;
    if (cached?.cursor) {
      cursor = cached.cursor;
      pageNum = cached.pageNum ?? 0;
      console.log(`[UAID search] Resuming from cached cursor at page ~${pageNum} (lastUaid=${cached.lastUaid})`);
    }

    do {
      const ownersUrl: string = `https://inventory.roblox.com/v2/assets/${assetId}/owners?limit=100&sortOrder=Asc${cursor ? `&cursor=${cursor}` : ''}`;

      let ownersData: any = null;
      let retries = 0;

      while (retries < 5) {
        let res: Response;
        try {
          res = await fetch(ownersUrl, { headers });
        } catch (err: any) {
          if (retries < 4) {
            const waitMs = 3000 * Math.pow(2, retries);
            console.warn(`[UAID search] Network error on page ${pageNum + 1}, waiting ${waitMs / 1000}s...`);
            await new Promise(r => setTimeout(r, waitMs));
            retries++;
            continue;
          }
          throw err;
        }

        if (res.status === 429 && retries < 4) {
          const waitMs = 3000 * Math.pow(2, retries);
          console.warn(`[UAID search] 429 on page ${pageNum + 1}, waiting ${waitMs / 1000}s...`);
          await new Promise(r => setTimeout(r, waitMs));
          retries++;
          continue;
        }

        if (!res.ok) throw new Error(`HTTP ${res.status} on owners page ${pageNum + 1}`);

        ownersData = await res.json();
        break;
      }

      if (!ownersData) break;

      const entries: any[] = ownersData?.data ?? [];
      pageNum++;

      if (entries.length === 0) break;

      const nextCursor: string | null = ownersData?.nextPageCursor ?? null;

      // ── Save cursor to cache after every page ──────────────────────────
      if (nextCursor) {
        const lastUaid = BigInt(nextCursor.split('_')[0]);

        await prisma.uaidCursorCache.createMany({
          data: [{ assetId: assetIdBigInt, cursor: nextCursor, lastUaid, pageNum }],
          skipDuplicates: true,
        });

        if (lastUaid < targetUAID) {
          console.log(`[UAID search] Page ${pageNum}: lastUaid=${lastUaid} < target=${targetUAID}, skipping | nextCursor=${nextCursor.substring(0, 30)}...`);
          cursor = nextCursor;
          requestsSinceBreak++;
          if (requestsSinceBreak >= 15) {
            console.log(`⏸️ [UAID search] 15 requests done — taking 21s breather...`);
            await new Promise(r => setTimeout(r, 21000));
            requestsSinceBreak = 0;
          } else {
            await new Promise(r => setTimeout(r, 2000));
          }
          continue;
        }
      }

      // Target is on this page — scan entries
      const match = entries.find((e: any) => BigInt(e.id ?? 0) === targetUAID);
      if (match) {
        console.log(`[UAID search] Found on page ${pageNum}`);
        return {
          created: match.created ?? null,
          updated: match.updated ?? null,
          isOnHold: null,
        };
      }

      console.log(`[UAID search] Page ${pageNum}: passed target UAID, not found`);
      break;

    } while (cursor);

    return { created: null, updated: null, isOnHold: null };
  } catch (err: any) {
    console.warn(`Failed to fetch asset details for UAID ${userAssetId}:`, err.message);
    return null;
  }
}