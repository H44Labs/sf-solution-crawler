import { SessionState } from '../types';

const STORAGE_PREFIX = 'crawl_session_';
const SESSION_INDEX_KEY = 'crawl_session_index';
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export class StateManager {
  static async createSession(seName: string, opportunityName: string, opportunityUrl: string): Promise<SessionState> {
    const state: SessionState = {
      crawlId: crypto.randomUUID(),
      seName,
      opportunityName,
      opportunityUrl,
      deploymentType: 'unknown',
      pagesVisited: [],
      fieldsFound: {},
      fieldsRemaining: [],
      pendingQuestions: [],
      productsDetected: { wfm: false, eem: false, performanceManagement: false },
      tokenUsage: { total: 0, budget: 100000 },
      status: 'crawling',
      lastUpdated: new Date().toISOString(),
    };
    return state;
  }

  static async save(state: SessionState): Promise<void> {
    const key = STORAGE_PREFIX + state.crawlId;
    await chrome.storage.local.set({ [key]: state });

    // Update index
    const index = await this.getIndex();
    if (!index.includes(state.crawlId)) {
      index.push(state.crawlId);
      await chrome.storage.local.set({ [SESSION_INDEX_KEY]: index });
    }
  }

  static async load(crawlId: string): Promise<SessionState | null> {
    const key = STORAGE_PREFIX + crawlId;
    const result = await chrome.storage.local.get([key]);
    return result[key] || null;
  }

  static async delete(crawlId: string): Promise<void> {
    const key = STORAGE_PREFIX + crawlId;
    await chrome.storage.local.remove([key]);

    const index = await this.getIndex();
    const newIndex = index.filter(id => id !== crawlId);
    await chrome.storage.local.set({ [SESSION_INDEX_KEY]: newIndex });
  }

  static async getInterruptedSession(): Promise<SessionState | null> {
    const index = await this.getIndex();
    for (const crawlId of index) {
      const state = await this.load(crawlId);
      if (state && state.status !== 'complete') {
        return state;
      }
    }
    return null;
  }

  static async cleanupStale(): Promise<void> {
    const index = await this.getIndex();
    const now = Date.now();

    for (const crawlId of index) {
      const state = await this.load(crawlId);
      if (state) {
        const age = now - new Date(state.lastUpdated).getTime();
        if (age > STALE_THRESHOLD_MS) {
          await this.delete(crawlId);
        }
      }
    }
  }

  private static async getIndex(): Promise<string[]> {
    const result = await chrome.storage.local.get([SESSION_INDEX_KEY]);
    return result[SESSION_INDEX_KEY] || [];
  }
}
