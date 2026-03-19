import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ArbiterAgent, ArbiterResult, FinalReviewResult } from '../../src/ai/arbiter-agent';
import { AIProviderClient } from '../../src/ai/providers';
import { SessionState, FieldMapEntry } from '../../src/types';
import { CrawlerExtraction } from '../../src/ai/crawler-agent';
import { ReviewResult } from '../../src/ai/reviewer-agent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFieldEntry(overrides: Partial<FieldMapEntry> = {}): FieldMapEntry {
  return {
    value: 'some value',
    confidence: 'high',
    source: 'https://example.com',
    rawEvidence: 'raw text',
    reviewerVerdict: 'accepted',
    arbiterDecision: 'accepted',
    ...overrides,
  };
}

function makeSessionState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    crawlId: 'crawl-1',
    seName: 'SE Name',
    opportunityName: 'Test Opportunity',
    opportunityUrl: 'https://sf.example.com/opp/1',
    deploymentType: 'unknown',
    pagesVisited: [{ url: 'https://sf.example.com', title: 'Home', timestamp: '2026-01-01T00:00:00Z' }],
    fieldsFound: {},
    fieldsRemaining: ['[Licensed Agents]', '[ACD Interval]'],
    pendingQuestions: [],
    productsDetected: { wfm: false, eem: false, performanceManagement: false },
    tokenUsage: { total: 1000, budget: 50000 },
    status: 'crawling',
    lastUpdated: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeCrawlerExtraction(overrides: Partial<CrawlerExtraction> = {}): CrawlerExtraction {
  return {
    templateField: '[Licensed Agents]',
    value: '500',
    rawEvidence: 'Licensed Agents: 500',
    confidence: 'high',
    ...overrides,
  };
}

function makeReviewResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    templateField: '[Licensed Agents]',
    originalValue: '500',
    verdict: 'accepted',
    confidence: 'high',
    reasoning: 'Value clearly present in raw content.',
    suggestedValue: null,
    ...overrides,
  };
}

function makeArbiterResponse(partial: Partial<ArbiterResult> = {}): string {
  const result = {
    fieldDecisions: partial.fieldDecisions ?? [
      { templateField: '[Licensed Agents]', decision: 'accepted', reason: 'High confidence.' },
    ],
    questionsForUser: partial.questionsForUser ?? [],
    deploymentType: partial.deploymentType ?? 'new_business',
    productsDetected: partial.productsDetected ?? { wfm: true, eem: false, performanceManagement: false },
    completionAssessment: partial.completionAssessment ?? {
      isComplete: true,
      percentFilled: 85,
      recommendation: 'complete',
      reason: 'Most fields filled.',
    },
    tokensUsed: partial.tokensUsed ?? 0,
  };
  // Remove tokensUsed from JSON payload (it comes from response metadata)
  const { tokensUsed: _t, ...payload } = result;
  void _t;
  return JSON.stringify(payload);
}

function makeFinalReviewResponse(partial: { approved?: boolean; issues?: string[] } = {}): string {
  return JSON.stringify({
    approved: partial.approved ?? true,
    issues: partial.issues ?? [],
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ArbiterAgent', () => {
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let mockAiClient: AIProviderClient;
  let agent: ArbiterAgent;

  beforeEach(() => {
    mockSendMessage = vi.fn();
    mockAiClient = { sendMessage: mockSendMessage } as unknown as AIProviderClient;
    agent = new ArbiterAgent(mockAiClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Accepts high-confidence fields
  // -------------------------------------------------------------------------
  it('accepts high-confidence fields that the reviewer accepted', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: makeArbiterResponse({
        fieldDecisions: [{ templateField: '[Licensed Agents]', decision: 'accepted', reason: 'High confidence.' }],
      }),
      tokensUsed: 200,
    });

    const extractions = [makeCrawlerExtraction()];
    const reviews = [makeReviewResult()];
    const session = makeSessionState();

    const result = await agent.decide(extractions, reviews, session);

    expect(result.fieldDecisions).toHaveLength(1);
    expect(result.fieldDecisions[0].templateField).toBe('[Licensed Agents]');
    expect(result.fieldDecisions[0].decision).toBe('accepted');
    expect(result.tokensUsed).toBe(200);
  });

  // -------------------------------------------------------------------------
  // 2. Rejects low-confidence fields and generates user questions
  // -------------------------------------------------------------------------
  it('rejects low-confidence fields and generates questions for the user', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: makeArbiterResponse({
        fieldDecisions: [{ templateField: '[ACD Interval]', decision: 'askUser', reason: 'Low confidence, ambiguous value.' }],
        questionsForUser: [
          {
            field: '[ACD Interval]',
            question: 'What is the ACD interval in minutes?',
            context: 'I found "15 or 30" in the data but could not determine which applies.',
          },
        ],
      }),
      tokensUsed: 150,
    });

    const extractions = [makeCrawlerExtraction({ templateField: '[ACD Interval]', value: '15 or 30', confidence: 'low' })];
    const reviews = [makeReviewResult({ templateField: '[ACD Interval]', verdict: 'flagged', confidence: 'low' })];
    const session = makeSessionState();

    const result = await agent.decide(extractions, reviews, session);

    const acdDecision = result.fieldDecisions.find((d) => d.templateField === '[ACD Interval]');
    expect(acdDecision?.decision).toBe('askUser');
    expect(result.questionsForUser).toHaveLength(1);
    expect(result.questionsForUser[0].field).toBe('[ACD Interval]');
    expect(result.questionsForUser[0].question).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 3. Determines New Business when no migration signals
  // -------------------------------------------------------------------------
  it('determines New Business deployment type when no migration signals are present', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: makeArbiterResponse({ deploymentType: 'new_business' }),
      tokensUsed: 100,
    });

    const session = makeSessionState({ opportunityName: 'ACME Corp - WFM New Deal' });
    const result = await agent.decide([], [], session);

    expect(result.deploymentType).toBe('new_business');
  });

  // -------------------------------------------------------------------------
  // 4. Determines Migration when keywords present
  // -------------------------------------------------------------------------
  it('determines Migration deployment type when migration keywords are in session state', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: makeArbiterResponse({ deploymentType: 'migration' }),
      tokensUsed: 100,
    });

    const session = makeSessionState({
      opportunityName: 'ACME Corp - WFM Migration to CXone',
      fieldsFound: {
        '[Existing WFM Version]': makeFieldEntry({ value: 'WFM 7.3' }),
      },
    });

    const result = await agent.decide([], [], session);

    expect(result.deploymentType).toBe('migration');
  });

  // -------------------------------------------------------------------------
  // 5. Determines product sections — WFM true when WFM fields found
  // -------------------------------------------------------------------------
  it('sets wfm=true in productsDetected when WFM fields are present', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: makeArbiterResponse({
        productsDetected: { wfm: true, eem: false, performanceManagement: false },
      }),
      tokensUsed: 100,
    });

    const session = makeSessionState({
      fieldsFound: {
        '[Licensed Agents]': makeFieldEntry({ value: '300' }),
      },
    });

    const result = await agent.decide([], [], session);

    expect(result.productsDetected.wfm).toBe(true);
    expect(result.productsDetected.eem).toBe(false);
    expect(result.productsDetected.performanceManagement).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 6. Completion >80% → recommends complete
  // -------------------------------------------------------------------------
  it('recommends complete when >80% of fields are filled', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: makeArbiterResponse({
        completionAssessment: {
          isComplete: true,
          percentFilled: 85,
          recommendation: 'complete',
          reason: '85% fields filled with high confidence.',
        },
      }),
      tokensUsed: 120,
    });

    const session = makeSessionState({
      fieldsFound: {
        '[Licensed Agents]': makeFieldEntry(),
        '[ACD Interval]': makeFieldEntry({ value: '15' }),
        '[ACD Information (Vendor)]': makeFieldEntry({ value: 'Avaya' }),
        '[Target Go Live Date]': makeFieldEntry({ value: '2026-06-01' }),
        '[Purchased Date]': makeFieldEntry({ value: '2025-01-15' }),
        '[AI Forecasting]': makeFieldEntry({ value: 'Yes' }),
        '[GDPR Compliance]': makeFieldEntry({ value: 'No' }),
        '[Disaster Recovery]': makeFieldEntry({ value: 'Option 1' }),
        '[Enhanced Strategic Planner]': makeFieldEntry({ value: 'Yes' }),
      },
      fieldsRemaining: ['[Employee Engagement Manager]'],
    });

    const result = await agent.decide([], [], session);

    expect(result.completionAssessment.recommendation).toBe('complete');
    expect(result.completionAssessment.percentFilled).toBeGreaterThan(80);
    expect(result.completionAssessment.isComplete).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 7. Completion 60-80% → recommends complete with warning
  // -------------------------------------------------------------------------
  it('recommends complete with warning when 60-80% of fields are filled', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: makeArbiterResponse({
        completionAssessment: {
          isComplete: false,
          percentFilled: 70,
          recommendation: 'complete',
          reason: '70% fields filled; can complete with warnings.',
        },
      }),
      tokensUsed: 120,
    });

    const session = makeSessionState({
      fieldsFound: {
        '[Licensed Agents]': makeFieldEntry(),
        '[ACD Interval]': makeFieldEntry({ value: '15' }),
        '[ACD Information (Vendor)]': makeFieldEntry({ value: 'Avaya' }),
        '[Target Go Live Date]': makeFieldEntry({ value: '2026-06-01' }),
        '[AI Forecasting]': makeFieldEntry({ value: 'Yes' }),
        '[GDPR Compliance]': makeFieldEntry({ value: 'No' }),
        '[Disaster Recovery]': makeFieldEntry({ value: 'Option 1' }),
      },
      fieldsRemaining: ['[Employee Engagement Manager]', '[Enhanced Strategic Planner]', '[Purchased Date]'],
    });

    const result = await agent.decide([], [], session);

    expect(result.completionAssessment.percentFilled).toBeGreaterThanOrEqual(60);
    expect(result.completionAssessment.percentFilled).toBeLessThanOrEqual(80);
    expect(result.completionAssessment.recommendation).toBe('complete');
  });

  // -------------------------------------------------------------------------
  // 8. Completion <60% → recommends continue
  // -------------------------------------------------------------------------
  it('recommends continue when fewer than 60% of fields are filled', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: makeArbiterResponse({
        completionAssessment: {
          isComplete: false,
          percentFilled: 40,
          recommendation: 'continue',
          reason: 'Only 40% of fields found; more crawling needed.',
        },
      }),
      tokensUsed: 100,
    });

    const session = makeSessionState({
      fieldsFound: {
        '[Licensed Agents]': makeFieldEntry(),
        '[ACD Interval]': makeFieldEntry({ value: '15' }),
      },
      fieldsRemaining: ['[ACD Information (Vendor)]', '[Target Go Live Date]', '[Purchased Date]', '[AI Forecasting]', '[GDPR Compliance]'],
    });

    const result = await agent.decide([], [], session);

    expect(result.completionAssessment.recommendation).toBe('continue');
    expect(result.completionAssessment.percentFilled).toBeLessThan(60);
  });

  // -------------------------------------------------------------------------
  // 9. Token budget near limit → prioritizes critical fields, stops non-essential
  // -------------------------------------------------------------------------
  it('stops non-essential crawling when token budget is near limit', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: makeArbiterResponse({
        completionAssessment: {
          isComplete: false,
          percentFilled: 55,
          recommendation: 'askUser',
          reason: 'Token budget nearly exhausted; stopping non-essential crawling.',
        },
      }),
      tokensUsed: 300,
    });

    const session = makeSessionState({
      tokenUsage: { total: 48000, budget: 50000 }, // 96% used
      fieldsRemaining: ['[ACD Interval]', '[AI Forecasting]'],
    });

    const result = await agent.decide([], [], session);

    expect(result.completionAssessment.recommendation).toBe('askUser');
  });

  // -------------------------------------------------------------------------
  // 10. Multiple values for a field → returns askUser with disambiguation question
  // -------------------------------------------------------------------------
  it('generates disambiguation question when multiple values exist for a single field', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: makeArbiterResponse({
        fieldDecisions: [{ templateField: '[ACD Information (Vendor)]', decision: 'askUser', reason: 'Multiple conflicting values found.' }],
        questionsForUser: [
          {
            field: '[ACD Information (Vendor)]',
            question: 'Which ACD vendor applies: "Avaya" or "Genesys"?',
            context: 'Found "Avaya" on page 1 and "Genesys" on page 2.',
          },
        ],
      }),
      tokensUsed: 175,
    });

    // Two extractions for same field with different values
    const extractions = [
      makeCrawlerExtraction({ templateField: '[ACD Information (Vendor)]', value: 'Avaya', confidence: 'medium' }),
      makeCrawlerExtraction({ templateField: '[ACD Information (Vendor)]', value: 'Genesys', confidence: 'medium' }),
    ];
    const reviews = [
      makeReviewResult({ templateField: '[ACD Information (Vendor)]', originalValue: 'Avaya', verdict: 'flagged', confidence: 'medium' }),
      makeReviewResult({ templateField: '[ACD Information (Vendor)]', originalValue: 'Genesys', verdict: 'flagged', confidence: 'medium' }),
    ];

    const result = await agent.decide(extractions, reviews, makeSessionState());

    const vendorDecision = result.fieldDecisions.find((d) => d.templateField === '[ACD Information (Vendor)]');
    expect(vendorDecision?.decision).toBe('askUser');
    expect(result.questionsForUser.some((q) => q.field === '[ACD Information (Vendor)]')).toBe(true);
    const q = result.questionsForUser.find((q) => q.field === '[ACD Information (Vendor)]');
    expect(q?.question).toBeTruthy();
    expect(q?.context).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 11. Holistic review — returns approved/issues
  // -------------------------------------------------------------------------
  it('performs holistic review and returns approved status with any issues', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: makeFinalReviewResponse({ approved: true, issues: [] }),
      tokensUsed: 250,
    });

    const session = makeSessionState({
      fieldsFound: {
        '[Licensed Agents]': makeFieldEntry(),
        '[ACD Interval]': makeFieldEntry({ value: '15' }),
      },
    });

    const result: FinalReviewResult = await agent.holisticReview(session);

    expect(result.approved).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.tokensUsed).toBe(250);
  });

  it('holistic review returns issues when problems are detected', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: makeFinalReviewResponse({
        approved: false,
        issues: ['[Target Go Live Date] is missing', '[Licensed Agents] value seems too high'],
      }),
      tokensUsed: 300,
    });

    const session = makeSessionState({
      fieldsFound: {
        '[Licensed Agents]': makeFieldEntry({ value: '999999' }),
      },
      fieldsRemaining: ['[Target Go Live Date]'],
    });

    const result: FinalReviewResult = await agent.holisticReview(session);

    expect(result.approved).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toContain('[Target Go Live Date]');
    expect(result.tokensUsed).toBe(300);
  });

  // -------------------------------------------------------------------------
  // 12. Handles malformed response gracefully
  // -------------------------------------------------------------------------
  it('handles malformed JSON response gracefully in decide()', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: 'This is not valid JSON at all !!!',
      tokensUsed: 50,
    });

    const result = await agent.decide([], [], makeSessionState());

    // Should return safe defaults, not throw
    expect(result.fieldDecisions).toEqual([]);
    expect(result.questionsForUser).toEqual([]);
    expect(result.deploymentType).toBe('unknown');
    expect(result.productsDetected).toEqual({ wfm: false, eem: false, performanceManagement: false });
    expect(result.completionAssessment.recommendation).toBe('continue');
    expect(result.tokensUsed).toBe(50);
  });

  it('handles malformed JSON response gracefully in holisticReview()', async () => {
    mockSendMessage.mockResolvedValueOnce({
      text: '{ invalid json }',
      tokensUsed: 50,
    });

    const result = await agent.holisticReview(makeSessionState());

    // Should return safe defaults, not throw
    expect(result.approved).toBe(false);
    expect(result.issues).toContain('Failed to parse arbiter response');
    expect(result.tokensUsed).toBe(50);
  });
});
