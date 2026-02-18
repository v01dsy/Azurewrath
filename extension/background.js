// extension/background.js

chrome.runtime.onInstalled.addListener(() => {});
chrome.runtime.onStartup.addListener(() => {});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') port.disconnect();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SNIPE_DEAL') {
    console.log('[Azuresniper] Deal received in background:', msg.deal);
    handleDeal(msg.deal);
    sendResponse({ ok: true });
  }
});

async function handleDeal(deal) {
  try {
    // 1. Get collectibleItemId from catalog API
    const detailsRes = await fetch(
      `https://catalog.roblox.com/v1/catalog/items/${deal.assetId}/details?itemType=Asset`,
      { credentials: 'include' }
    );
    const details = await detailsRes.json();
    console.log('[Azuresniper] Catalog details:', JSON.stringify(details));

    const collectibleItemId = details.collectibleItemId;

    if (!collectibleItemId) {
      console.warn('[Azuresniper] No collectibleItemId for assetId:', deal.assetId);
      return;
    }

    console.log('[Azuresniper] collectibleItemId:', collectibleItemId);

    // 2. Get CSRF token
    const csrfToken = await getCsrfToken();

    // 3. Get the lowest listing
    const listingsRes = await fetch(
      `https://apis.roblox.com/marketplace-sales/v1/item/${collectibleItemId}/resale-instances?limit=1&sortOrder=Asc`,
      {
        credentials: 'include',
        headers: { 'x-csrf-token': csrfToken },
      }
    );
    const listings = await listingsRes.json();
    console.log('[Azuresniper] Listings:', JSON.stringify(listings));
    const listing = listings?.data?.[0];

    if (!listing) {
      console.warn('[Azuresniper] No listings found for:', collectibleItemId);
      return;
    }

    // 4. Get current user ID
    const userRes = await fetch('https://users.roblox.com/v1/users/authenticated', {
      credentials: 'include'
    });
    const userData = await userRes.json();
    const userId = userData.id?.toString();

    if (!userId) {
      console.warn('[Azuresniper] Not logged in to Roblox!');
      return;
    }

    // 5. Fire the purchase!
    const buyRes = await fetch(
      `https://apis.roblox.com/marketplace-sales/v1/item/${collectibleItemId}/purchase-item`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          collectibleItemId,
          collectibleProductId: listing.collectibleProductId,
          expectedCurrency: 1,
          expectedPrice: deal.price,
          expectedPurchaserId: userId,
          expectedPurchaserType: 'User',
          expectedSellerId: listing.seller?.id ?? listing.sellerId,
          expectedSellerType: 'User',
          idempotencyKey: crypto.randomUUID(),
          rentalOptionDays: null,
        }),
      }
    );

    const result = await buyRes.json();
    console.log('[Azuresniper] Purchase result:', result);

    chrome.runtime.sendMessage({
      type: 'SNIPE_RESULT',
      success: buyRes.ok,
      result,
      deal,
    });

  } catch (err) {
    console.error('[Azuresniper] Purchase error:', err);
  }
}

async function getCsrfToken() {
  const res = await fetch('https://auth.roblox.com/v2/logout', {
    method: 'POST',
    credentials: 'include',
  });
  return res.headers.get('x-csrf-token') || '';
}