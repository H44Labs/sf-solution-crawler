import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateManager } from '../../src/storage/state';

// Mock chrome.storage.local
const mockStorage: Record<string, any> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys) => Promise.resolve(
        Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys])
            .filter((k: string) => k in mockStorage)
            .map((k: string) => [k, mockStorage[k]])
        )
      )),
      set: vi.fn((items) => { Object.assign(mockStorage, items); return Promise.resolve(); }),
      remove: vi.fn((keys) => {
        (Array.isArray(keys) ? keys : [keys]).forEach((k: string) => delete mockStorage[k]);
        return Promise.resolve();
      }),
    },
  },
});

describe('StateManager', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    vi.clearAllMocks();
  });

  it('creates a new session state', async () => {
    const state = await StateManager.createSession('John Doe', 'Acme WFM Deal', 'https://sf.com/opp/123');
    expect(state.seName).toBe('John Doe');
    expect(state.opportunityName).toBe('Acme WFM Deal');
    expect(state.opportunityUrl).toBe('https://sf.com/opp/123');
    expect(state.status).toBe('crawling');
    expect(state.crawlId).toBeTruthy();
    expect(state.deploymentType).toBe('unknown');
    expect(state.pagesVisited).toEqual([]);
    expect(state.fieldsFound).toEqual({});
    expect(state.tokenUsage.total).toBe(0);
  });

  it('saves and loads session state', async () => {
    const state = await StateManager.createSession('Jane', 'Deal', 'https://sf.com/opp/1');
    await StateManager.save(state);
    const loaded = await StateManager.load(state.crawlId);
    expect(loaded?.seName).toBe('Jane');
    expect(loaded?.opportunityName).toBe('Deal');
  });

  it('returns null for non-existent session', async () => {
    const loaded = await StateManager.load('non-existent-id');
    expect(loaded).toBeNull();
  });

  it('detects interrupted sessions', async () => {
    const state = await StateManager.createSession('Jane', 'Deal', 'https://sf.com/opp/1');
    state.status = 'crawling';
    await StateManager.save(state);
    const interrupted = await StateManager.getInterruptedSession();
    expect(interrupted?.crawlId).toBe(state.crawlId);
  });

  it('does not return completed sessions as interrupted', async () => {
    const state = await StateManager.createSession('Jane', 'Deal', 'https://sf.com/opp/1');
    state.status = 'complete';
    await StateManager.save(state);
    const interrupted = await StateManager.getInterruptedSession();
    expect(interrupted).toBeNull();
  });

  it('cleans up stale sessions older than 24h', async () => {
    const state = await StateManager.createSession('Jane', 'Deal', 'https://sf.com/opp/1');
    state.lastUpdated = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await StateManager.save(state);
    await StateManager.cleanupStale();
    const loaded = await StateManager.load(state.crawlId);
    expect(loaded).toBeNull();
  });

  it('does not clean up recent sessions', async () => {
    const state = await StateManager.createSession('Jane', 'Deal', 'https://sf.com/opp/1');
    await StateManager.save(state);
    await StateManager.cleanupStale();
    const loaded = await StateManager.load(state.crawlId);
    expect(loaded).not.toBeNull();
  });

  it('deletes a session', async () => {
    const state = await StateManager.createSession('Jane', 'Deal', 'https://sf.com/opp/1');
    await StateManager.save(state);
    await StateManager.delete(state.crawlId);
    const loaded = await StateManager.load(state.crawlId);
    expect(loaded).toBeNull();
  });
});
