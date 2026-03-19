import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AICouncil, CouncilResult } from '../../src/ai/council';
import { CrawlerAgent, CrawlerResult, CrawlerExtraction } from '../../src/ai/crawler-agent';
import { ReviewerAgent, ReviewerOutput, ReviewResult } from '../../src/ai/reviewer-agent';
import { ArbiterAgent, ArbiterResult, FinalReviewResult } from '../../src/ai/arbiter-agent';
import { PageData, SessionState, NavigationDirective, PendingQuestion } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers — minimal valid stubs
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

const makeNavigation = (): NavigationDirective => ({
  action: 'navigate',
  target: 'https://example.salesforce.com/next',
  reason: 'more fields needed',
  fieldsSought: ['field2'],
});

const makeCrawlerResult = (overrides: Partial<CrawlerResult> = {}): CrawlerResult => ({
  extractedFields: [
    {
      templateField: 'field1',
      value: 'value1',
      rawEvidence: 'evidence1',
      confidence: 'high',
    },
  ],
  nextNavigation: makeNavigation(),
  tokensUsed: 100,
  ...overrides,
});

const makeReviewerOutput = (overrides: Partial<ReviewerOutput> = {}): ReviewerOutput => ({
  reviews: [
    {
      templateField: 'field1',
      originalValue: 'value1',
      verdict: 'accepted',
      confidence: 'high',
      reasoning: 'Looks good',
      suggestedValue: null,
    },
  ],
  tokensUsed: 80,
  ...overrides,
});

const makeArbiterResult = (overrides: Partial<ArbiterResult> = {}): ArbiterResult => ({
  fieldDecisions: [
    {
      templateField: 'field1',
      decision: 'accepted',
      reason: 'High confidence',
    },
  ],
  questionsForUser: [],
  deploymentType: 'new_business',
  productsDetected: { wfm: true, eem: false, performanceManagement: false },
  completionAssessment: {
    isComplete: false,
    percentFilled: 50,
    recommendation: 'continue',
    reason: 'More pages to visit',
  },
  tokensUsed: 120,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const makeMockCrawler = (result: CrawlerResult): Partial<CrawlerAgent> => ({
  analyze: vi.fn().mockResolvedValue(result),
});

const makeMockReviewer = (result: ReviewerOutput): Partial<ReviewerAgent> => ({
  validate: vi.fn().mockResolvedValue(result),
});

const makeMockArbiter = (
  result: ArbiterResult,
  finalResult?: FinalReviewResult,
): Partial<ArbiterAgent> => ({
  decide: vi.fn().mockResolvedValue(result),
  holisticReview: vi.fn().mockResolvedValue(
    finalResult ?? { approved: true, issues: [], tokensUsed: 50 },
  ),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AICouncil', () => {
  let pageData: PageData;
  let state: SessionState;

  beforeEach(() => {
    pageData = makePageData('Opportunity Detail');
    state = makeSessionState();
  });

  // Test 1: Full pipeline — crawler extracts, reviewer validates, arbiter accepts
  it('returns accepted fields when arbiter accepts', async () => {
    const crawlerResult = makeCrawlerResult();
    const reviewerResult = makeReviewerOutput();
    const arbiterResult = makeArbiterResult();

    const council = new AICouncil(
      makeMockCrawler(crawlerResult) as CrawlerAgent,
      makeMockReviewer(reviewerResult) as ReviewerAgent,
      makeMockArbiter(arbiterResult) as ArbiterAgent,
    );

    const result = await council.processPage(pageData, state);

    expect(result.acceptedFields).toHaveProperty('field1');
    expect(result.acceptedFields['field1'].value).toBe('value1');
    expect(result.acceptedFields['field1'].confidence).toBe('high');
    expect(result.acceptedFields['field1'].source).toBe('Opportunity Detail');
    expect(result.acceptedFields['field1'].rawEvidence).toBe('evidence1');
  });

  // Test 2: Rejected fields not in acceptedFields
  it('excludes fields that arbiter rejects (askUser decision)', async () => {
    const crawlerResult = makeCrawlerResult({
      extractedFields: [
        { templateField: 'field1', value: 'val1', rawEvidence: 'ev1', confidence: 'low' },
        { templateField: 'field2', value: 'val2', rawEvidence: 'ev2', confidence: 'medium' },
      ],
    });
    const reviewerResult = makeReviewerOutput({
      reviews: [
        { templateField: 'field1', originalValue: 'val1', verdict: 'accepted', confidence: 'low', reasoning: 'ok', suggestedValue: null },
        { templateField: 'field2', originalValue: 'val2', verdict: 'rejected', confidence: 'low', reasoning: 'bad', suggestedValue: null },
      ],
    });
    const arbiterResult = makeArbiterResult({
      fieldDecisions: [
        { templateField: 'field1', decision: 'accepted', reason: 'ok' },
        { templateField: 'field2', decision: 'askUser', reason: 'unclear' },
      ],
    });

    const council = new AICouncil(
      makeMockCrawler(crawlerResult) as CrawlerAgent,
      makeMockReviewer(reviewerResult) as ReviewerAgent,
      makeMockArbiter(arbiterResult) as ArbiterAgent,
    );

    const result = await council.processPage(pageData, state);

    expect(result.acceptedFields).toHaveProperty('field1');
    expect(result.acceptedFields).not.toHaveProperty('field2');
  });

  // Test 3: Token tracking — total = sum of all 3 agents
  it('sums tokens from all three agents', async () => {
    const crawlerResult = makeCrawlerResult({ tokensUsed: 200 });
    const reviewerResult = makeReviewerOutput({ tokensUsed: 150 });
    const arbiterResult = makeArbiterResult({ tokensUsed: 300 });

    const council = new AICouncil(
      makeMockCrawler(crawlerResult) as CrawlerAgent,
      makeMockReviewer(reviewerResult) as ReviewerAgent,
      makeMockArbiter(arbiterResult) as ArbiterAgent,
    );

    const result = await council.processPage(pageData, state);

    expect(result.totalTokensUsed).toBe(650);
  });

  // Test 4: Questions forwarded from arbiter
  it('forwards arbiter questions to result', async () => {
    const questions: PendingQuestion[] = [
      { field: 'field1', question: 'What is this?', context: 'Some context' },
      { field: 'field2', question: 'Which option?', context: 'Another context' },
    ];
    const arbiterResult = makeArbiterResult({ questionsForUser: questions });

    const council = new AICouncil(
      makeMockCrawler(makeCrawlerResult()) as CrawlerAgent,
      makeMockReviewer(makeReviewerOutput()) as ReviewerAgent,
      makeMockArbiter(arbiterResult) as ArbiterAgent,
    );

    const result = await council.processPage(pageData, state);

    expect(result.questionsForUser).toHaveLength(2);
    expect(result.questionsForUser[0].field).toBe('field1');
    expect(result.questionsForUser[1].field).toBe('field2');
  });

  // Test 5: Completion signal
  it('sets isComplete true when arbiter signals completion', async () => {
    const arbiterResult = makeArbiterResult({
      completionAssessment: {
        isComplete: true,
        percentFilled: 100,
        recommendation: 'complete',
        reason: 'All fields filled',
      },
    });

    const council = new AICouncil(
      makeMockCrawler(makeCrawlerResult()) as CrawlerAgent,
      makeMockReviewer(makeReviewerOutput()) as ReviewerAgent,
      makeMockArbiter(arbiterResult) as ArbiterAgent,
    );

    const result = await council.processPage(pageData, state);

    expect(result.isComplete).toBe(true);
  });

  // Test 6: Reviewer suggested value takes precedence over extraction value
  it('uses reviewer suggested value when provided', async () => {
    const crawlerResult = makeCrawlerResult({
      extractedFields: [
        { templateField: 'field1', value: 'original', rawEvidence: 'ev', confidence: 'medium' },
      ],
    });
    const reviewerResult = makeReviewerOutput({
      reviews: [
        {
          templateField: 'field1',
          originalValue: 'original',
          verdict: 'accepted',
          confidence: 'high',
          reasoning: 'Corrected value',
          suggestedValue: 'corrected',
        },
      ],
    });
    const arbiterResult = makeArbiterResult();

    const council = new AICouncil(
      makeMockCrawler(crawlerResult) as CrawlerAgent,
      makeMockReviewer(reviewerResult) as ReviewerAgent,
      makeMockArbiter(arbiterResult) as ArbiterAgent,
    );

    const result = await council.processPage(pageData, state);

    expect(result.acceptedFields['field1'].value).toBe('corrected');
    expect(result.acceptedFields['field1'].confidence).toBe('high');
  });

  // Test 7: finalReview delegates to arbiter holisticReview
  it('finalReview delegates to arbiter.holisticReview', async () => {
    const finalReviewResult: FinalReviewResult = {
      approved: true,
      issues: ['Minor issue'],
      tokensUsed: 75,
    };

    const mockArbiter = makeMockArbiter(makeArbiterResult(), finalReviewResult);

    const council = new AICouncil(
      makeMockCrawler(makeCrawlerResult()) as CrawlerAgent,
      makeMockReviewer(makeReviewerOutput()) as ReviewerAgent,
      mockArbiter as ArbiterAgent,
    );

    const result = await council.finalReview(state);

    expect(mockArbiter.holisticReview).toHaveBeenCalledWith(state);
    expect(result.approved).toBe(true);
    expect(result.issues).toEqual(['Minor issue']);
    expect(result.tokensUsed).toBe(75);
  });

  // Test 8: Empty extractions — crawler finds nothing
  it('handles empty crawler extractions gracefully', async () => {
    const crawlerResult = makeCrawlerResult({
      extractedFields: [],
      tokensUsed: 50,
    });
    const reviewerResult: ReviewerOutput = {
      reviews: [],
      tokensUsed: 30,
    };
    const arbiterResult = makeArbiterResult({
      fieldDecisions: [],
      tokensUsed: 40,
    });

    const mockReviewer = makeMockReviewer(reviewerResult);

    const council = new AICouncil(
      makeMockCrawler(crawlerResult) as CrawlerAgent,
      mockReviewer as ReviewerAgent,
      makeMockArbiter(arbiterResult) as ArbiterAgent,
    );

    const result = await council.processPage(pageData, state);

    // Reviewer should be called with an empty array
    expect(mockReviewer.validate).toHaveBeenCalledWith([], pageData);

    expect(result.acceptedFields).toEqual({});
    expect(result.totalTokensUsed).toBe(120);
    expect(result.isComplete).toBe(false);
  });

  // Additional: navigation directive is taken from crawler
  it('forwards navigation directive from crawler result', async () => {
    const nav: NavigationDirective = {
      action: 'click',
      target: 'Related Tab',
      reason: 'Need related data',
      fieldsSought: ['field2'],
    };
    const crawlerResult = makeCrawlerResult({ nextNavigation: nav });

    const council = new AICouncil(
      makeMockCrawler(crawlerResult) as CrawlerAgent,
      makeMockReviewer(makeReviewerOutput()) as ReviewerAgent,
      makeMockArbiter(makeArbiterResult()) as ArbiterAgent,
    );

    const result = await council.processPage(pageData, state);

    expect(result.navigation).toEqual(nav);
  });

  // Additional: deployment type and productsDetected flow from arbiter
  it('forwards deploymentType and productsDetected from arbiter', async () => {
    const arbiterResult = makeArbiterResult({
      deploymentType: 'migration',
      productsDetected: { wfm: true, eem: true, performanceManagement: false },
    });

    const council = new AICouncil(
      makeMockCrawler(makeCrawlerResult()) as CrawlerAgent,
      makeMockReviewer(makeReviewerOutput()) as ReviewerAgent,
      makeMockArbiter(arbiterResult) as ArbiterAgent,
    );

    const result = await council.processPage(pageData, state);

    expect(result.deploymentType).toBe('migration');
    expect(result.productsDetected).toEqual({ wfm: true, eem: true, performanceManagement: false });
  });
});
