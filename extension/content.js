// extension/content.js
// This runs on YOUR snipe page (not Roblox).
// It listens for deal events dispatched by the snipe page and forwards them
// to the background service worker which has full Roblox cookie access.

// The snipe page fires a custom event when a deal lands.
// In snipe/page.tsx onmessage, add:
//   window.dispatchEvent(new CustomEvent('SNIPE_DEAL', { detail: deal }));

window.addEventListener('SNIPE_DEAL', (e) => {
  const deal = e.detail;
  console.log('[Azuresniper] Deal received:', deal);

  chrome.runtime.sendMessage({ type: 'SNIPE_DEAL', deal }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Azuresniper] Message error:', chrome.runtime.lastError);
    }
  });
});

// Listen for results from background and relay back to the page
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SNIPE_RESULT') {
    window.dispatchEvent(new CustomEvent('SNIPE_RESULT', { detail: msg }));
  }
});