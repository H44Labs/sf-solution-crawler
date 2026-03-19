import { useEffect } from 'react';
import { ExtensionMessage } from '../../types';

export function sendMessage(message: ExtensionMessage): Promise<any> {
  return chrome.runtime.sendMessage(message);
}

export function useMessaging(handler: (message: ExtensionMessage) => void) {
  useEffect(() => {
    const listener = (message: ExtensionMessage) => {
      handler(message);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [handler]);

  return sendMessage;
}
