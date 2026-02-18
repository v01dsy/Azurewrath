// extension/content.js

window.addEventListener('SNIPE_DEAL', (e) => {
  const deal = e.detail;
  console.log('[Azuresniper] Deal received:', deal);

  // Wake up the service worker by connecting first, then send
  const port = chrome.runtime.connect({ name: 'keepalive' });
  port.disconnect();

  chrome.runtime.sendMessage({ type: 'SNIPE_DEAL', deal }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Azuresniper] Message error:', chrome.runtime.lastError.message);
    } else {
      console.log('[Azuresniper] Message sent OK:', response);
    }
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SNIPE_RESULT') {
    window.dispatchEvent(new CustomEvent('SNIPE_RESULT', { detail: msg }));
  }
});