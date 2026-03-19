import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrawlerAgent } from '../../src/ai/crawler-agent';
import { PageData, SessionState } from '../../src/types';

// ---------------------------------------------------------------------------
// Mock AI client
// ---------------------------------------------------------------------------

const mockAIClient = {
  sendMessage: vi.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockPageData: PageData = {
  pageContext: {
    url: 'https://salesforce.example.com/opportunity/123',
    title: 'Acme Corp - WFM Opportunity',
    breadcrumb: ['Opportunities', 'Acme Corp'],
    uiMode: 'lightning',
  },
  fields: [
    { label: 'Licensed Agents', value: '500', section: 'Overview' },
    { label: 'ACD Interval', value: '15', section: 'ACD Details' },
  ],
  relatedLists: [
    {
      name: 'Quote Line Items',
      columns: ['Product', 'Quantity'],
      rows: [['WFM Suite', '500']],
    },
  ],
  quickLinks: [
    { text: 'Quote tab', href: '/opportunity/123/quotes' },
  ],
  notes: ['Customer is migrating from Verint'],
};

const mockSessionState: SessionState = {
  crawlId: 'crawl-abc-123',
  seName: 'Jane Smith',
  opportunityName: 'Acme Corp WFM Deal',
  opportunityUrl: 'https://salesforce.example.com/opportunity/123',
  deploymentType: 'new_business',
  pagesVisited: [
    { url: 'https://salesforce.example.com/opportunity/123', title: 'Acme Corp', timestamp: '2026-03-19T00:00:00Z' },
  ],
  fieldsFound: {},
  fieldsRemaining: ['[Licensed Agents]', '[ACD Interval]'],
  pendingQuestions: [],
  productsDetected: { wfm: true, eem: false, performanceManagement: false },
  tokenUsage: { total: 2000, budget: 50000 },
  status: 'crawling',
  lastUpdated: '2026-03-19T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuccessResponse(overrides: object = {}) {
  return {
    text: JSON.stringify({
      extractedFields: [
        {
          templateField: '[Licensed Agents]',
          value: '500',
          rawEvidence: 'Licensed Agents: 500',
          confidence: 'high',
        },
      ],
      nextNavigation: {
        action: 'navigate',
        target: 'Quote tab',
        reason: 'find pricing',
        fieldsSought: ['[ACD Interval]'],
      },
      ...overrides,
    }),
    tokensUsed: 1000,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('CrawlerAgent', () => {
  beforeEach(() => {
    mockAIClient.sendMessage.mockReset();
  });

  // -------------------------------------------------------------------------
  // 1. Sends page data and session state to AI, parses response correctly
  // -------------------------------------------------------------------------
  it('sends page data and session state to AI and returns parsed result', async () => {
    mockAIClient.sendMessage.mockResolvedValue(makeSuccessResponse());

    const agent = new CrawlerAgent(mockAIClient as any, ['[Licensed Agents]', '[ACD Interval]']);
    const result = await agent.analyze(mockPageData, mockSessionState);

    expect(result.extractedFields).toHaveLength(1);
    expect(result.extractedFields[0].templateField).toBe('[Licensed Agents]');
    expect(result.extractedFields[0].value).toBe('500');
    expect(result.extractedFields[0].rawEvidence).toBe('Licensed Agents: 500');
    expect(result.extractedFields[0].confidence).toBe('high');
    expect(result.nextNavigation.action).toBe('navigate');
    expect(result.nextNavigation.target).toBe('Quote tab');
    expect(result.tokensUsed).toBe(1000);
  });

  // -------------------------------------------------------------------------
  // 2. Returns done when all fields found
  // -------------------------------------------------------------------------
  it('returns done action when AI signals completion', async () => {
    mockAIClient.sendMessage.mockResolvedValue({
      text: JSON.stringify({
        extractedFields: [
          { templateField: '[Licensed Agents]', value: '250', rawEvidence: 'Agents: 250', confidence: 'high' },
          { templateField: '[ACD Interval]', value: '30', rawEvidence: 'Interval: 30 min', confidence: 'high' },
        ],
        nextNavigation: {
          action: 'done',
          target: '',
          reason: 'All fields found',
          fieldsSought: [],
        },
      }),
      tokensUsed: 800,
    });

    const agent = new CrawlerAgent(mockAIClient as any, ['[Licensed Agents]', '[ACD Interval]']);
    const result = await agent.analyze(mockPageData, mockSessionState);

    expect(result.extractedFields).toHaveLength(2);
    expect(result.nextNavigation.action).toBe('done');
    expect(result.tokensUsed).toBe(800);
  });

  // -------------------------------------------------------------------------
  // 3. Returns askUser when data is ambiguous
  // -------------------------------------------------------------------------
  it('returns askUser action when AI needs human clarification', async () => {
    mockAIClient.sendMessage.mockResolvedValue({
      text: JSON.stringify({
        extractedFields: [],
        nextNavigation: {
          action: 'askUser',
          target: '',
          reason: 'Could not determine ACD vendor from page content',
          fieldsSought: ['[ACD Information (Vendor)]'],
        },
      }),
      tokensUsed: 600,
    });

    const agent = new CrawlerAgent(mockAIClient as any, ['[ACD Information (Vendor)]']);
    const result = await agent.analyze(mockPageData, mockSessionState);

    expect(result.extractedFields).toHaveLength(0);
    expect(result.nextNavigation.action).toBe('askUser');
    expect(result.nextNavigation.reason).toBe('Could not determine ACD vendor from page content');
    expect(result.tokensUsed).toBe(600);
  });

  // -------------------------------------------------------------------------
  // 4. Handles malformed AI response gracefully
  // -------------------------------------------------------------------------
  it('handles malformed AI response gracefully by returning empty extractions and done', async () => {
    mockAIClient.sendMessage.mockResolvedValue({
      text: 'This is not valid JSON at all!!! @#$%',
      tokensUsed: 200,
    });

    const agent = new CrawlerAgent(mockAIClient as any, ['[Licensed Agents]']);
    const result = await agent.analyze(mockPageData, mockSessionState);

    expect(result.extractedFields).toHaveLength(0);
    expect(result.nextNavigation.action).toBe('done');
    expect(result.tokensUsed).toBe(200);
  });

  // -------------------------------------------------------------------------
  // 5. Handles response wrapped in markdown code block
  // -------------------------------------------------------------------------
  it('handles response wrapped in markdown code block', async () => {
    const jsonPayload = JSON.stringify({
      extractedFields: [
        { templateField: '[ACD Interval]', value: '15', rawEvidence: 'ACD Interval: 15', confidence: 'medium' },
      ],
      nextNavigation: {
        action: 'scroll',
        target: '#related-lists',
        reason: 'look for more data',
        fieldsSought: ['[Licensed Agents]'],
      },
    });

    mockAIClient.sendMessage.mockResolvedValue({
      text: `\`\`\`json\n${jsonPayload}\n\`\`\``,
      tokensUsed: 750,
    });

    const agent = new CrawlerAgent(mockAIClient as any, ['[ACD Interval]', '[Licensed Agents]']);
    const result = await agent.analyze(mockPageData, mockSessionState);

    expect(result.extractedFields).toHaveLength(1);
    expect(result.extractedFields[0].templateField).toBe('[ACD Interval]');
    expect(result.extractedFields[0].confidence).toBe('medium');
    expect(result.nextNavigation.action).toBe('scroll');
    expect(result.tokensUsed).toBe(750);
  });

  // -------------------------------------------------------------------------
  // 6. Includes field registry in system prompt
  // -------------------------------------------------------------------------
  it('includes field registry in system prompt passed to sendMessage', async () => {
    mockAIClient.sendMessage.mockResolvedValue(makeSuccessResponse());

    const fieldRegistry = ['[Licensed Agents]', '[ACD Interval]', '[Target Go Live Date]'];
    const agent = new CrawlerAgent(mockAIClient as any, fieldRegistry);
    await agent.analyze(mockPageData, mockSessionState);

    expect(mockAIClient.sendMessage).toHaveBeenCalledTimes(1);

    const [systemPrompt, userMessage] = mockAIClient.sendMessage.mock.calls[0] as [string, string];

    // System prompt must mention all fields from the registry
    for (const field of fieldRegistry) {
      expect(systemPrompt).toContain(field);
    }

    // User message must contain serialised page data and session state fields
    const parsed = JSON.parse(userMessage);
    expect(parsed).toHaveProperty('pageData');
    expect(parsed).toHaveProperty('fieldsRemaining');
    expect(parsed).toHaveProperty('pagesVisited');
  });

  // -------------------------------------------------------------------------
  // 7. Handles response with plain JSON (no markdown wrapper)
  // -------------------------------------------------------------------------
  it('parses plain JSON response without markdown wrapper', async () => {
    mockAIClient.sendMessage.mockResolvedValue(makeSuccessResponse());

    const agent = new CrawlerAgent(mockAIClient as any, ['[Licensed Agents]']);
    const result = await agent.analyze(mockPageData, mockSessionState);

    expect(result.extractedFields[0].templateField).toBe('[Licensed Agents]');
  });

  // -------------------------------------------------------------------------
  // 8. Handles response wrapped in plain code block (no language tag)
  // -------------------------------------------------------------------------
  it('handles response wrapped in plain code block without language tag', async () => {
    const jsonPayload = JSON.stringify({
      extractedFields: [
        { templateField: '[Licensed Agents]', value: '100', rawEvidence: 'Agents: 100', confidence: 'low' },
      ],
      nextNavigation: { action: 'done', target: '', reason: 'done', fieldsSought: [] },
    });

    mockAIClient.sendMessage.mockResolvedValue({
      text: `\`\`\`\n${jsonPayload}\n\`\`\``,
      tokensUsed: 300,
    });

    const agent = new CrawlerAgent(mockAIClient as any, ['[Licensed Agents]']);
    const result = await agent.analyze(mockPageData, mockSessionState);

    expect(result.extractedFields).toHaveLength(1);
    expect(result.extractedFields[0].value).toBe('100');
    expect(result.tokensUsed).toBe(300);
  });
});
