// extension/background.js
// Listens for deal messages from the snipe page and executes the purchase
// in the context of the Roblox tab (so cookies are sent automatically).

let pendingDeals = {}; // tabId -> deal info

// Message from content script on snipe page: a deal fired
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SNIPE_DEAL') {
    handleDeal(msg.deal);
    sendResponse({ ok: true });
  }
});

async function handleDeal(deal) {
  try {
    // 1. Get collectibleItemId from assetId
    const detailsRes = await fetch(
      `https://economy.roblox.com/v2/assets/${deal.assetId}/details`
    );
    const details = await detailsRes.json();
    const collectibleItemId = details.CollectibleItemId;

    if (!collectibleItemId) {
      console.warn('[Azuresniper] Not a collectible:', deal.assetId);
      return;
    }

    // 2. Get CSRF token
    const csrfToken = await getCsrfToken();

    // 3. Get the lowest listing
    const listingsRes = await fetch(
      `https://apis.roblox.com/marketplace-sales/v1/item/${collectibleItemId}/resale-instances?limit=1&sortOrder=Asc`,
      { credentials: 'include' }
    );
    const listings = await listingsRes.json();
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

    // Notify popup/snipe page of result
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
  // Hit any Roblox POST endpoint to get the CSRF token back in the headers
  const res = await fetch('https://auth.roblox.com/v2/logout', {
    method: 'POST',
    credentials: 'include',
  });
  return res.headers.get('x-csrf-token') || '';
}