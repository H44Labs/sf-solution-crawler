import { useState, useEffect } from 'react';
import { SessionState } from '../../types';

const ACTIVE_CRAWL_KEY = 'active_crawl_id';
const STORAGE_PREFIX = 'crawl_session_';

export function useCrawlState(): SessionState | null {
  const [state, setState] = useState<SessionState | null>(null);

  useEffect(() => {
    // Load initial state
    chrome.storage.local.get([ACTIVE_CRAWL_KEY], (result) => {
      const crawlId = result[ACTIVE_CRAWL_KEY];
      if (crawlId) {
        chrome.storage.local.get([STORAGE_PREFIX + crawlId], (sessionResult) => {
          const session = sessionResult[STORAGE_PREFIX + crawlId];
          if (session) {
            setState(session);
          }
        });
      }
    });

    // Listen for changes
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local') return;

      // Check if active crawl id changed
      if (changes[ACTIVE_CRAWL_KEY]) {
        const crawlId = changes[ACTIVE_CRAWL_KEY].newValue;
        if (crawlId) {
          chrome.storage.local.get([STORAGE_PREFIX + crawlId], (sessionResult) => {
            const session = sessionResult[STORAGE_PREFIX + crawlId];
            if (session) {
              setState(session);
            }
          });
        } else {
          setState(null);
        }
      }

      // Check if any crawl session was updated
      for (const key of Object.keys(changes)) {
        if (key.startsWith(STORAGE_PREFIX)) {
          const newSession = changes[key].newValue as SessionState | undefined;
          if (newSession) {
            setState(prev => {
              // Only update if it matches the currently tracked session
              if (prev && prev.crawlId === newSession.crawlId) {
                return newSession;
              }
              // If no current state, accept the update
              if (!prev) {
                return newSession;
              }
              return prev;
            });
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  return state;
}
