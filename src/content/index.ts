import { detectUIMode } from './detector';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DETECT_MODE') {
    sendResponse({ mode: detectUIMode() });
  }
  return true;
});
