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
  // Open the Roblox catalog tab
  const tab = await chrome.tabs.create({
    url: `https://www.roblox.com/catalog/${deal.assetId}`,
    active: true, // open in face
  });

  // Wait for the tab to finish loading, then click Buy
  chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
    if (tabId !== tab.id || info.status !== 'complete') return;
    chrome.tabs.onUpdated.removeListener(listener);

    // Inject script to click the Buy button
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: autoBuy,
    });
  });
}

function autoBuy() {
  // Keep trying to find and click the Buy button for up to 5 seconds
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;

    // Roblox's buy button text
    const buttons = [...document.querySelectorAll('button')];
    const buyBtn = buttons.find(b => b.textContent.trim().match(/^Buy/i));

    if (buyBtn) {
      console.log('[Azuresniper] Clicking Buy button!');
      buyBtn.click();

      // Wait for confirm dialog and click "Buy Now"
      setTimeout(() => {
        const confirmButtons = [...document.querySelectorAll('button')];
        const confirmBtn = confirmButtons.find(b => b.textContent.trim().match(/Buy Now/i));
        if (confirmBtn) {
          console.log('[Azuresniper] Clicking Buy Now confirm!');
          confirmBtn.click();
        }
      }, 500);

      clearInterval(interval);
    }

    if (attempts > 50) clearInterval(interval); // give up after 5s
  }, 100);
}