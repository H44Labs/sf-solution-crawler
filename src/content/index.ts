import { detectUIMode } from './detector';
import { scrapePage } from './scraper';
import { navigateTo, detectSessionExpiration } from './navigator';
import { XHRInterceptor } from './xhr-interceptor';

const interceptor = new XHRInterceptor();
interceptor.start();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    switch (message.type) {
      case 'DETECT_MODE':
        return { mode: detectUIMode() };
      case 'SCRAPE_PAGE':
        return scrapePage();
      case 'NAVIGATE':
        return { success: await navigateTo(message.payload) };
      case 'DETECT_SESSION_EXPIRED':
        return { expired: detectSessionExpiration() };
      default:
        return { error: 'Unknown message type' };
    }
  };
  handler().then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true;
});
