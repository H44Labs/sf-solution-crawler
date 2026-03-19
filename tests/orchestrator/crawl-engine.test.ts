import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrawlEngine, CrawlEvent } from '../../src/orchestrator/crawl-engine';
import { AICouncil, CouncilResult } from '../../src/ai/council';
import { StateManager } from '../../src/storage/state';
import { AllProvidersExhaustedError } from '../../src/ai/providers';
import { SessionState, CrawlConfig, PageData, NavigationDirective } from '../../src/types';

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

vi.mock('../../src/storage/state', () => ({
  StateManager: {
    createSession: vi.fn(),
    save: vi.fn(),
    load: vi.fn(),
    delete: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makePageData = (title = 'Test Page'): PageData => ({
  pageContext: {
    url: 'https://example.salesforce.com/test',
    title,
    breadcrumb: [],
    uiMode: 'lightning',
  },
  fields: [],
  relatedLists: [],
  quickLinks: [],
  notes: [],
});

const makeNavigation = (action: NavigationDirective['action'] = 'navigate'): NavigationDirective => ({
  action,
  target: 'https://example.salesforce.com/next',
  reason: 'more fields needed',
  fieldsSought: ['field2'],
});

const makeCouncilResult = (overrides: Partial<CouncilResult> = {}): CouncilResult => ({
  acceptedFields: {},
  navigation: makeNavigation('done'),
  questionsForUser: [],
  deploymentType: 'unknown',
  productsDetected: { wfm: false, eem: false, performanceManagement: false },
  isComplete: false,
  totalTokensUsed: 100,
  ...overrides,
});

const makeSessionState = (overrides: Partial<SessionState> = {}): SessionState => ({
  crawlId: 'crawl-001',
  seName: 'Jane',
  opportunityName: 'Opp A',
  opportunityUrl: 'https://example.salesforce.com/opp',
  deploymentType: 'unknown',
  pagesVisited: [],
  fieldsFound: {},
  fieldsRemaining: ['field1', 'field2'],
  pendingQuestions: [],
  productsDetected: { wfm: false, eem: false, performanceManagement: false },
  tokenUsage: { total: 0, budget: 100000 },
  status: 'crawling',
  lastUpdated: new Date().toISOString(),
  ...overrides,
});

const makeConfig = (overrides: Partial<CrawlConfig> = {}): CrawlConfig => ({
  maxPages: 10,
  tokenBudget: 100000,
  navigationTimeout: 5000,
  providers: [],
  teamRoster: [],
  productDomains: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

let mockCouncil: { processPage: ReturnType<typeof vi.fn> };
let scrapeFn: ReturnType<typeof vi.fn>;
let navigateFn: ReturnType<typeof vi.fn>;
let detectSessionExpiredFn: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();

  mockCouncil = {
    processPage: vi.fn().mockResolvedValue(makeCouncilResult({ isComplete: true })),
  };

  scrapeFn = vi.fn().mockResolvedValue(makePageData());
  navigateFn = vi.fn().mockResolvedValue(true);
  detectSessionExpiredFn = vi.fn().mockReturnValue(false);

  vi.mocked(StateManager.createSession).mockResolvedValue(makeSessionState());
  vi.mocked(StateManager.save).mockResolvedValue(undefined);
  vi.mocked(StateManager.load).mockResolvedValue(makeSessionState());
  vi.mocked(StateManager.delete).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CrawlEngine', () => {
  describe('start()', () => {
    it('creates session and calls scrapeFn and council.processPage', async () => {
      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(StateManager.createSession).toHaveBeenCalledWith('Jane', 'Opp A', 'https://example.salesforce.com/opp');
      expect(scrapeFn).toHaveBeenCalledTimes(1);
      expect(mockCouncil.processPage).toHaveBeenCalledTimes(1);
    });

    it('saves state after creating session', async () => {
      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(StateManager.save).toHaveBeenCalled();
    });
  });

  describe('navigation', () => {
    it('calls navigateFn when council returns navigate action', async () => {
      mockCouncil.processPage
        .mockResolvedValueOnce(makeCouncilResult({ navigation: makeNavigation('navigate'), isComplete: false }))
        .mockResolvedValueOnce(makeCouncilResult({ isComplete: true }));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(navigateFn).toHaveBeenCalledTimes(1);
      expect(navigateFn).toHaveBeenCalledWith(makeNavigation('navigate'));
    });

    it('calls navigateFn when council returns click action', async () => {
      mockCouncil.processPage
        .mockResolvedValueOnce(makeCouncilResult({ navigation: makeNavigation('click'), isComplete: false }))
        .mockResolvedValueOnce(makeCouncilResult({ isComplete: true }));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(navigateFn).toHaveBeenCalledTimes(1);
    });

    it('does not call navigateFn when action is done', async () => {
      mockCouncil.processPage.mockResolvedValue(makeCouncilResult({ navigation: makeNavigation('done'), isComplete: true }));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(navigateFn).not.toHaveBeenCalled();
    });

    it('continues when navigation fails', async () => {
      navigateFn.mockResolvedValueOnce(false);
      mockCouncil.processPage
        .mockResolvedValueOnce(makeCouncilResult({ navigation: makeNavigation('navigate'), isComplete: false }))
        .mockResolvedValueOnce(makeCouncilResult({ isComplete: true }));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      const state = await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      // Should still complete even after navigation failure
      expect(state.status).toBe('complete');
    });
  });

  describe('completion', () => {
    it('sets status to complete when council says isComplete', async () => {
      mockCouncil.processPage.mockResolvedValue(makeCouncilResult({ isComplete: true }));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      const state = await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(state.status).toBe('complete');
    });
  });

  describe('user questions', () => {
    it('pauses with status askingUser when council returns questions', async () => {
      mockCouncil.processPage.mockResolvedValue(makeCouncilResult({
        isComplete: false,
        questionsForUser: [{ field: 'fieldX', question: 'What is the value?', context: 'some context' }],
      }));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      const state = await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(state.status).toBe('askingUser');
      expect(state.pendingQuestions).toHaveLength(1);
      expect(state.pendingQuestions[0].field).toBe('fieldX');
    });
  });

  describe('pause()', () => {
    it('stops the loop with status paused when pause() is called', async () => {
      // Make processPage take a tick and then pause before next iteration
      mockCouncil.processPage.mockImplementation(async () => {
        // Will be paused before next iteration
        return makeCouncilResult({ isComplete: false, navigation: makeNavigation('navigate') });
      });

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      // Pause before the loop even starts to guarantee pause check fires
      engine.pause();

      const state = await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(state.status).toBe('paused');
    });

    it('saves state when paused', async () => {
      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());
      engine.pause();

      await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      // save should be called at least once (initial + pause)
      expect(StateManager.save).toHaveBeenCalled();
    });
  });

  describe('cancel()', () => {
    it('deletes the session when cancel() is called', async () => {
      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());
      engine.cancel();

      await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(StateManager.delete).toHaveBeenCalledWith('crawl-001');
    });
  });

  describe('maxPages', () => {
    it('stops after config.maxPages iterations', async () => {
      mockCouncil.processPage.mockResolvedValue(makeCouncilResult({
        isComplete: false,
        navigation: makeNavigation('navigate'),
      }));

      const config = makeConfig({ maxPages: 3 });
      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, config);

      const state = await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(scrapeFn).toHaveBeenCalledTimes(3);
      expect(state.status).toBe('complete');
    });
  });

  describe('token budget', () => {
    it('stops when token usage reaches the budget', async () => {
      // Each call uses 60000 tokens; budget is 100000 → stops after 2nd iteration
      mockCouncil.processPage.mockResolvedValue(makeCouncilResult({
        isComplete: false,
        totalTokensUsed: 60000,
        navigation: makeNavigation('navigate'),
      }));

      const sessionWithBudget = makeSessionState({ tokenUsage: { total: 0, budget: 100000 } });
      vi.mocked(StateManager.createSession).mockResolvedValue(sessionWithBudget);

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      const state = await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(state.status).toBe('complete');
      // After 2 iterations: 120000 >= 100000 budget
      expect(scrapeFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('session expiration', () => {
    it('pauses with error when session expires', async () => {
      detectSessionExpiredFn.mockReturnValue(true);

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());
      const events: CrawlEvent[] = [];
      engine.onEvent(e => events.push(e));

      const state = await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(state.status).toBe('paused');
      expect(events.some(e => e.type === 'error' && e.message.includes('session expired'))).toBe(true);
    });
  });

  describe('AllProvidersExhaustedError', () => {
    it('pauses and emits error when all providers are exhausted', async () => {
      mockCouncil.processPage.mockRejectedValue(new AllProvidersExhaustedError());

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());
      const events: CrawlEvent[] = [];
      engine.onEvent(e => events.push(e));

      const state = await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(state.status).toBe('paused');
      expect(events.some(e => e.type === 'error' && e.message.includes('AI providers exhausted'))).toBe(true);
    });

    it('rethrows non-AllProvidersExhaustedError errors', async () => {
      mockCouncil.processPage.mockRejectedValue(new Error('Unexpected failure'));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      await expect(
        engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn),
      ).rejects.toThrow('Unexpected failure');
    });
  });

  describe('resume()', () => {
    it('loads existing state and continues crawl', async () => {
      const existingState = makeSessionState({ status: 'paused', opportunityName: 'Opp B' });
      vi.mocked(StateManager.load).mockResolvedValue(existingState);
      mockCouncil.processPage.mockResolvedValue(makeCouncilResult({ isComplete: true }));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      const state = await engine.resume('crawl-001', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(StateManager.load).toHaveBeenCalledWith('crawl-001');
      expect(scrapeFn).toHaveBeenCalledTimes(1);
      expect(state?.status).toBe('complete');
    });

    it('returns null when crawl ID not found', async () => {
      vi.mocked(StateManager.load).mockResolvedValue(null);

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      const result = await engine.resume('nonexistent-id', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(result).toBeNull();
      expect(scrapeFn).not.toHaveBeenCalled();
    });
  });

  describe('event emission', () => {
    it('emits log event when starting', async () => {
      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());
      const events: CrawlEvent[] = [];
      engine.onEvent(e => events.push(e));

      await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(events.some(e => e.type === 'log' && e.message.includes('Starting analysis'))).toBe(true);
    });

    it('emits log event when reading a page', async () => {
      scrapeFn.mockResolvedValue(makePageData('Account Detail'));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());
      const events: CrawlEvent[] = [];
      engine.onEvent(e => events.push(e));

      await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(events.some(e => e.type === 'log' && e.message.includes('Account Detail'))).toBe(true);
    });

    it('emits progress event after processing a page', async () => {
      mockCouncil.processPage.mockResolvedValue(makeCouncilResult({
        isComplete: true,
        acceptedFields: { field1: { value: 'v1', confidence: 'high', source: 'page', rawEvidence: 'ev' } },
      }));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());
      const events: CrawlEvent[] = [];
      engine.onEvent(e => events.push(e));

      await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(events.some(e => e.type === 'progress')).toBe(true);
    });

    it('emits complete event when crawl finishes', async () => {
      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());
      const events: CrawlEvent[] = [];
      engine.onEvent(e => events.push(e));

      await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(events.some(e => e.type === 'complete')).toBe(true);
    });

    it('emits question event when user questions are present', async () => {
      mockCouncil.processPage.mockResolvedValue(makeCouncilResult({
        isComplete: false,
        questionsForUser: [{ field: 'fieldX', question: 'What value?', context: 'ctx' }],
      }));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());
      const events: CrawlEvent[] = [];
      engine.onEvent(e => events.push(e));

      await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      const questionEvent = events.find(e => e.type === 'question');
      expect(questionEvent).toBeDefined();
      expect(questionEvent?.message).toBe('What value?');
    });
  });

  describe('state persistence', () => {
    it('calls StateManager.save after processing each page', async () => {
      mockCouncil.processPage
        .mockResolvedValueOnce(makeCouncilResult({ isComplete: false, navigation: makeNavigation('navigate') }))
        .mockResolvedValueOnce(makeCouncilResult({ isComplete: true }));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      // Called once at start, plus once per processed page (2 pages), plus final complete save
      // At minimum: initial save + 2 page saves
      const saveCalls = vi.mocked(StateManager.save).mock.calls.length;
      expect(saveCalls).toBeGreaterThanOrEqual(3);
    });

    it('updates fieldsFound with accepted fields from council result', async () => {
      mockCouncil.processPage.mockResolvedValue(makeCouncilResult({
        isComplete: true,
        acceptedFields: {
          field1: { value: 'myValue', confidence: 'high', source: 'Test Page', rawEvidence: 'evidence' },
        },
      }));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      const state = await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(state.fieldsFound['field1']).toMatchObject({
        value: 'myValue',
        confidence: 'high',
        source: 'Test Page',
        reviewerVerdict: 'accepted',
        arbiterDecision: 'accepted',
      });
    });

    it('removes found fields from fieldsRemaining', async () => {
      const initialState = makeSessionState({ fieldsRemaining: ['field1', 'field2'] });
      vi.mocked(StateManager.createSession).mockResolvedValue(initialState);

      mockCouncil.processPage.mockResolvedValue(makeCouncilResult({
        isComplete: true,
        acceptedFields: {
          field1: { value: 'v1', confidence: 'high', source: 'page', rawEvidence: 'ev' },
        },
      }));

      const engine = new CrawlEngine(mockCouncil as unknown as AICouncil, makeConfig());

      const state = await engine.start('Jane', 'Opp A', 'https://example.salesforce.com/opp', scrapeFn, navigateFn, detectSessionExpiredFn);

      expect(state.fieldsRemaining).not.toContain('field1');
      expect(state.fieldsRemaining).toContain('field2');
    });
  });
});
