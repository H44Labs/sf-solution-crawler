import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AICouncil, CouncilResult } from '../../src/ai/council';
import { CrawlerAgent, CrawlerResult, CrawlerExtraction } from '../../src/ai/crawler-agent';
import { ReviewerAgent, ReviewerOutput } from '../../src/ai/reviewer-agent';
import { ArbiterAgent, ArbiterResult, FinalReviewResult } from '../../src/ai/arbiter-agent';
import { PageData, SessionState, NavigationDirective } from '../../src/types';

const makePageData = (title = 'Test Page'): PageData => ({
  pageContext: { url: 'https://example.salesforce.com/test', title, breadcrumb: [], uiMode: 'lightning' },
  fields: [],
  relatedLists: [],
  quickLinks: [],
  notes: [],
});

const makeSessionState = (): SessionState => ({
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
});

const makeNavigation = (action: string = 'navigate'): NavigationDirective => ({
  action: action as any,
  target: 'https://example.salesforce.com/next',
  reason: 'more fields needed',
  fieldsSought: ['field2'],
});

const makeCrawlerResult = (overrides: Partial<CrawlerResult> = {}): CrawlerResult => ({
  extractedFields: [
    { templateField: 'field1', value: 'value1', rawEvidence: 'evidence1', confidence: 'high' },
  ],
  nextNavigation: makeNavigation(),
  tokensUsed: 100,
  ...overrides,
});

const makeMockCrawler = (result: CrawlerResult): Partial<CrawlerAgent> => ({
  analyze: vi.fn().mockResolvedValue(result),
});

const makeMockReviewer = (): Partial<ReviewerAgent> => ({
  validate: vi.fn().mockResolvedValue({ reviews: [], tokensUsed: 0 }),
});

const makeMockArbiter = (): Partial<ArbiterAgent> => ({
  decide: vi.fn().mockResolvedValue({ fieldDecisions: [], questionsForUser: [], deploymentType: 'unknown', productsDetected: { wfm: false, eem: false, performanceManagement: false }, completionAssessment: { isComplete: false, percentFilled: 0, recommendation: 'continue', reason: '' }, tokensUsed: 0 }),
  holisticReview: vi.fn().mockResolvedValue({ approved: true, issues: [], tokensUsed: 50 }),
});

describe('AICouncil (lightweight mode)', () => {
  let pageData: PageData;
  let state: SessionState;

  beforeEach(() => {
    pageData = makePageData('Opportunity Detail');
    state = makeSessionState();
  });

  it('accepts crawler extractions directly', async () => {
    const council = new AICouncil(
      makeMockCrawler(makeCrawlerResult()) as CrawlerAgent,
      makeMockReviewer() as ReviewerAgent,
      makeMockArbiter() as ArbiterAgent,
    );
    const result = await council.processPage(pageData, state);
    expect(result.acceptedFields).toHaveProperty('field1');
    expect(result.acceptedFields['field1'].value).toBe('value1');
    expect(result.acceptedFields['field1'].confidence).toBe('high');
    expect(result.acceptedFields['field1'].source).toBe('Opportunity Detail');
  });

  it('skips fields with empty templateField or value', async () => {
    const crawlerResult = makeCrawlerResult({
      extractedFields: [
        { templateField: 'field1', value: 'val1', rawEvidence: 'ev1', confidence: 'high' },
        { templateField: '', value: 'val2', rawEvidence: 'ev2', confidence: 'high' },
        { templateField: 'field3', value: '', rawEvidence: 'ev3', confidence: 'high' },
      ],
    });
    const council = new AICouncil(
      makeMockCrawler(crawlerResult) as CrawlerAgent,
      makeMockReviewer() as ReviewerAgent,
      makeMockArbiter() as ArbiterAgent,
    );
    const result = await council.processPage(pageData, state);
    expect(Object.keys(result.acceptedFields)).toEqual(['field1']);
  });

  it('returns tokens from crawler only', async () => {
    const crawlerResult = makeCrawlerResult({ tokensUsed: 250 });
    const council = new AICouncil(
      makeMockCrawler(crawlerResult) as CrawlerAgent,
      makeMockReviewer() as ReviewerAgent,
      makeMockArbiter() as ArbiterAgent,
    );
    const result = await council.processPage(pageData, state);
    expect(result.totalTokensUsed).toBe(250);
  });

  it('forwards navigation directive from crawler', async () => {
    const nav = makeNavigation('click');
    const council = new AICouncil(
      makeMockCrawler(makeCrawlerResult({ nextNavigation: nav })) as CrawlerAgent,
      makeMockReviewer() as ReviewerAgent,
      makeMockArbiter() as ArbiterAgent,
    );
    const result = await council.processPage(pageData, state);
    expect(result.navigation.action).toBe('click');
  });

  it('sets isComplete when crawler returns done', async () => {
    const council = new AICouncil(
      makeMockCrawler(makeCrawlerResult({ nextNavigation: makeNavigation('done') })) as CrawlerAgent,
      makeMockReviewer() as ReviewerAgent,
      makeMockArbiter() as ArbiterAgent,
    );
    const result = await council.processPage(pageData, state);
    expect(result.isComplete).toBe(true);
  });

  it('detects new_business by default', async () => {
    const council = new AICouncil(
      makeMockCrawler(makeCrawlerResult()) as CrawlerAgent,
      makeMockReviewer() as ReviewerAgent,
      makeMockArbiter() as ArbiterAgent,
    );
    const result = await council.processPage(pageData, state);
    expect(result.deploymentType).toBe('new_business');
  });

  it('detects migration from title keywords', async () => {
    pageData = makePageData('Acme Migration Project');
    const council = new AICouncil(
      makeMockCrawler(makeCrawlerResult()) as CrawlerAgent,
      makeMockReviewer() as ReviewerAgent,
      makeMockArbiter() as ArbiterAgent,
    );
    const result = await council.processPage(pageData, state);
    expect(result.deploymentType).toBe('migration');
  });

  it('handles empty crawler extractions', async () => {
    const council = new AICouncil(
      makeMockCrawler(makeCrawlerResult({ extractedFields: [] })) as CrawlerAgent,
      makeMockReviewer() as ReviewerAgent,
      makeMockArbiter() as ArbiterAgent,
    );
    const result = await council.processPage(pageData, state);
    expect(result.acceptedFields).toEqual({});
  });

  it('finalReview delegates to arbiter', async () => {
    const mockArbiter = makeMockArbiter();
    const council = new AICouncil(
      makeMockCrawler(makeCrawlerResult()) as CrawlerAgent,
      makeMockReviewer() as ReviewerAgent,
      mockArbiter as ArbiterAgent,
    );
    const result = await council.finalReview(state);
    expect(mockArbiter.holisticReview).toHaveBeenCalledWith(state);
    expect(result.approved).toBe(true);
  });

  it('always sets wfm true in productsDetected', async () => {
    const council = new AICouncil(
      makeMockCrawler(makeCrawlerResult()) as CrawlerAgent,
      makeMockReviewer() as ReviewerAgent,
      makeMockArbiter() as ArbiterAgent,
    );
    const result = await council.processPage(pageData, state);
    expect(result.productsDetected.wfm).toBe(true);
  });
});
