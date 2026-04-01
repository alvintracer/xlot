/**
 * content.ts
 * Allows communication between the injected inpage provider (inpage.ts) and the background service worker.
 */

window.addEventListener('message', async (event) => {
  // Only accept messages from the same frame
  if (event.source !== window || !event.data || event.data.target !== 'xlot-content') {
    return;
  }

  // Forward the request to the background script
  try {
    const response = await chrome.runtime.sendMessage({
      type: event.data.type,
      id: event.data.id,
      method: event.data.method,
      params: event.data.params,
      origin: window.location.origin,
    });
    
    // Relay the response back to the inpage script
    window.postMessage({
      target: 'xlot-inpage',
      type: 'XLOT_RESPONSE',
      id: event.data.id,
      result: response?.result,
      error: response?.error,
    }, '*');
  } catch (error: any) {
    window.postMessage({
      target: 'xlot-inpage',
      type: 'XLOT_RESPONSE',
      id: event.data.id,
      error: { message: error.message || 'Error communicating with extension backend', code: 4900 },
    }, '*');
  }
});

// Listen for background events pushed to the content script (e.g. accountsChanged)
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type && message.type.startsWith('XLOT_')) {
    window.postMessage({
      target: 'xlot-inpage',
      ...message
    }, '*');
  }
});
