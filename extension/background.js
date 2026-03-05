// extension/background.js

chrome.runtime.onInstalled.addListener(() => {});
chrome.runtime.onStartup.addListener(() => {});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') port.disconnect();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SNIPE_DEAL') {
    console.log('[Azuresniper] Deal received, opening tab and auto-buying:', msg.deal);
    handleDeal(msg.deal);
    sendResponse({ ok: true });
  }
});

async function handleDeal(deal) {
  const tab = await chrome.tabs.create({
    url: `https://www.roblox.com/catalog/${deal.assetId}`,
    active: true,
  });

  chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
    if (tabId !== tab.id || info.status !== 'complete') return;
    chrome.tabs.onUpdated.removeListener(listener);

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: autoBuy,
      args: [{
        targetAssetId: String(deal.assetId),
        expectedPrice: deal.price,       // the exact price that triggered the deal
        maxPrice: deal.maxPrice ?? null, // user's optional hard budget cap
      }],
    });
  });
}

function autoBuy({ targetAssetId, expectedPrice, maxPrice }) {
  // ── Guard 1: correct page ────────────────────────────────────────────────
  // If Roblox redirected us somewhere else (bundle page, different item),
  // abort before touching anything.
  if (!window.location.href.includes(targetAssetId)) {
    console.warn(`[Azuresniper] ❌ Wrong page — expected assetId ${targetAssetId}, got ${window.location.href}`);
    return;
  }

  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;

    // ── Guard 2: re-check URL each tick ─────────────────────────────────
    if (!window.location.href.includes(targetAssetId)) {
      console.warn('[Azuresniper] ❌ Page redirected mid-load — aborting');
      clearInterval(interval);
      return;
    }

    const buttons = [...document.querySelectorAll('button')];
    const buyBtn = buttons.find(b => b.textContent.trim().match(/^Buy/i));

    if (buyBtn) {
      // ── Guard 3: price equivalence check ────────────────────────────────
      // Read the price Roblox is currently showing and compare it to the price
      // that triggered this deal. If it's different, the original listing already
      // sold and we're looking at a different (likely more expensive) seller.
      //
      // We read the price from the button text itself — Roblox renders it as
      // e.g. "Buy  1,234" — which is the most reliable source on the page.
      const btnText = buyBtn.textContent.replace(/[^0-9]/g, '');
      const displayedPrice = btnText ? parseInt(btnText, 10) : null;

      if (displayedPrice !== null && !isNaN(displayedPrice)) {
        // Price must match exactly. The deal was for a specific listing at a
        // specific price — if even 1 Robux off, it's a different listing.
        if (displayedPrice !== expectedPrice) {
          console.warn(
            `[Azuresniper] ❌ Price mismatch — expected ${expectedPrice} R$, page shows ${displayedPrice} R$. Listing already sold.`
          );
          clearInterval(interval);
          return;
        }

        // ── Guard 4: hard budget cap (maxPrice from user's config) ───────
        // Belt-and-suspenders: even if price matches, respect the user's cap.
        if (maxPrice !== null && displayedPrice > maxPrice) {
          console.warn(
            `[Azuresniper] ❌ Price ${displayedPrice} exceeds user budget ${maxPrice} — aborting`
          );
          clearInterval(interval);
          return;
        }
      } else {
        // Couldn't parse a price from the button — don't buy blind
        console.warn('[Azuresniper] ⚠️ Could not read price from Buy button — aborting to be safe');
        clearInterval(interval);
        return;
      }

      // ── All checks passed — buy ──────────────────────────────────────────
      console.log(`[Azuresniper] ✅ Price confirmed at ${displayedPrice} R$ — clicking Buy!`);
      buyBtn.click();

      setTimeout(() => {
        const confirmButtons = [...document.querySelectorAll('button')];
        const confirmBtn = confirmButtons.find(b => b.textContent.trim().match(/Buy Now/i));
        if (confirmBtn) {
          console.log('[Azuresniper] ✅ Clicking Buy Now confirm!');
          confirmBtn.click();
        } else {
          console.warn('[Azuresniper] ⚠️ Confirm dialog not found — item may have sold between click and confirm');
        }
      }, 500);

      clearInterval(interval);
    }

    if (attempts > 50) {
      console.warn('[Azuresniper] ⚠️ Buy button not found after 5s — item sold out');
      clearInterval(interval);
    }
  }, 100);
}