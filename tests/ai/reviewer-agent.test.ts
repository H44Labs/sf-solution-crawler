import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewerAgent, ReviewerInput } from '../../src/ai/reviewer-agent';
import { AIProviderClient } from '../../src/ai/providers';
import { PageData } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePageData(overrides: Partial<PageData> = {}): PageData {
  return {
    pageContext: {
      url: 'https://example.salesforce.com/001',
      title: 'Test Opportunity',
      breadcrumb: ['Home', 'Opportunities'],
      uiMode: 'lightning',
    },
    fields: [
      { label: 'Licensed Agents', value: '250', section: 'Details' },
      { label: 'ACD Vendor', value: 'Avaya', section: 'Details' },
    ],
    relatedLists: [],
    quickLinks: [],
    notes: ['Customer is migrating from old platform'],
    ...overrides,
  };
}

function makeExtraction(overrides: Partial<ReviewerInput> = {}): ReviewerInput {
  return {
    templateField: '[Licensed Agents]',
    value: '250',
    rawEvidence: 'Licensed Agents: 250',
    confidence: 'high',
    ...overrides,
  };
}

/** Build a mock AIProviderClient with sendMessage stubbed. */
function makeClient(responseText: string, tokensUsed = 100): AIProviderClient {
  const client = {
    sendMessage: vi.fn().mockResolvedValue({ text: responseText, tokensUsed }),
  } as unknown as AIProviderClient;
  return client;
}

/** Build a minimal valid AI response JSON string. */
function makeAIResponse(reviews: object[]): string {
  return JSON.stringify({ reviews });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ReviewerAgent', () => {
  // -------------------------------------------------------------------------
  // 1. Grades high confidence — AI returns accepted/high
  // -------------------------------------------------------------------------
  it('grades high confidence when value clearly matches raw text', async () => {
    const review = {
      templateField: '[Licensed Agents]',
      originalValue: '250',
      verdict: 'accepted',
      confidence: 'high',
      reasoning: 'Value "250" is explicitly present in the raw page content under "Licensed Agents".',
      suggestedValue: null,
    };

    const client = makeClient(makeAIResponse([review]));
    const agent = new ReviewerAgent(client);

    const result = await agent.validate([makeExtraction()], makePageData());

    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].verdict).toBe('accepted');
    expect(result.reviews[0].confidence).toBe('high');
    expect(result.reviews[0].templateField).toBe('[Licensed Agents]');
    expect(result.reviews[0].suggestedValue).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 2. Grades low confidence — AI returns rejected/low (hallucination)
  // -------------------------------------------------------------------------
  it('grades low confidence when value not found in raw text (hallucination)', async () => {
    const review = {
      templateField: '[Licensed Agents]',
      originalValue: '999',
      verdict: 'rejected',
      confidence: 'low',
      reasoning: 'Value "999" does not appear anywhere in the raw page content. Likely hallucinated.',
      suggestedValue: null,
    };

    const extraction = makeExtraction({ value: '999', rawEvidence: '', confidence: 'low' });
    const client = makeClient(makeAIResponse([review]));
    const agent = new ReviewerAgent(client);

    const result = await agent.validate([extraction], makePageData());

    expect(result.reviews[0].verdict).toBe('rejected');
    expect(result.reviews[0].confidence).toBe('low');
  });

  // -------------------------------------------------------------------------
  // 3. Grades medium confidence — AI returns flagged/medium
  // -------------------------------------------------------------------------
  it('grades medium confidence for plausible but uncertain values', async () => {
    const review = {
      templateField: '[Target Go Live Date]',
      originalValue: 'Q1 2025',
      verdict: 'flagged',
      confidence: 'medium',
      reasoning: 'Value is plausible from context but not an exact literal match in raw content.',
      suggestedValue: '2025-03-31',
    };

    const extraction = makeExtraction({
      templateField: '[Target Go Live Date]',
      value: 'Q1 2025',
      rawEvidence: 'Expected delivery early next year',
      confidence: 'medium',
    });

    const client = makeClient(makeAIResponse([review]));
    const agent = new ReviewerAgent(client);

    const result = await agent.validate([extraction], makePageData());

    expect(result.reviews[0].verdict).toBe('flagged');
    expect(result.reviews[0].confidence).toBe('medium');
    expect(result.reviews[0].suggestedValue).toBe('2025-03-31');
  });

  // -------------------------------------------------------------------------
  // 4. Processes batch of multiple fields from one page
  // -------------------------------------------------------------------------
  it('processes a batch of multiple fields in a single call', async () => {
    const reviews = [
      {
        templateField: '[Licensed Agents]',
        originalValue: '250',
        verdict: 'accepted',
        confidence: 'high',
        reasoning: 'Found in raw text.',
        suggestedValue: null,
      },
      {
        templateField: '[ACD Vendor]',
        originalValue: 'Avaya',
        verdict: 'accepted',
        confidence: 'high',
        reasoning: 'Avaya is present in raw text.',
        suggestedValue: null,
      },
      {
        templateField: '[ACD Interval]',
        originalValue: '15',
        verdict: 'flagged',
        confidence: 'medium',
        reasoning: '15 minutes is typical but not confirmed explicitly.',
        suggestedValue: null,
      },
    ];

    const extractions: ReviewerInput[] = [
      makeExtraction({ templateField: '[Licensed Agents]', value: '250' }),
      makeExtraction({ templateField: '[ACD Vendor]', value: 'Avaya', rawEvidence: 'ACD Vendor: Avaya' }),
      makeExtraction({ templateField: '[ACD Interval]', value: '15', confidence: 'medium', rawEvidence: '' }),
    ];

    const client = makeClient(makeAIResponse(reviews));
    const agent = new ReviewerAgent(client);

    // Only one AI call should be made for the whole batch
    const result = await agent.validate(extractions, makePageData());

    expect(result.reviews).toHaveLength(3);
    expect(result.tokensUsed).toBe(100);
    const client_ = client as unknown as { sendMessage: ReturnType<typeof vi.fn> };
    expect(client_.sendMessage).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 5. Handles malformed response — returns all fields as flagged
  // -------------------------------------------------------------------------
  it('returns all fields as flagged when AI response is malformed', async () => {
    const client = makeClient('This is not valid JSON at all!!!', 50);
    const agent = new ReviewerAgent(client);

    const extractions: ReviewerInput[] = [
      makeExtraction({ templateField: '[Licensed Agents]', value: '250' }),
      makeExtraction({ templateField: '[ACD Vendor]', value: 'Avaya' }),
    ];

    const result = await agent.validate(extractions, makePageData());

    expect(result.reviews).toHaveLength(2);
    for (const review of result.reviews) {
      expect(review.verdict).toBe('flagged');
      expect(review.confidence).toBe('medium');
    }
    // tokensUsed should still reflect what the provider reported
    expect(result.tokensUsed).toBe(50);
  });

  // -------------------------------------------------------------------------
  // 6. Includes raw page content in the message sent to AI
  // -------------------------------------------------------------------------
  it('includes raw page content in the user message sent to the AI', async () => {
    const review = {
      templateField: '[Licensed Agents]',
      originalValue: '250',
      verdict: 'accepted',
      confidence: 'high',
      reasoning: 'Present in raw content.',
      suggestedValue: null,
    };

    const client = makeClient(makeAIResponse([review]));
    const agent = new ReviewerAgent(client);
    const pageData = makePageData();

    await agent.validate([makeExtraction()], pageData);

    const mockSend = (client as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage;
    expect(mockSend).toHaveBeenCalledTimes(1);

    const [_systemPrompt, userMessage] = mockSend.mock.calls[0] as [string, string];
    const parsed = JSON.parse(userMessage);

    // The message must contain the raw page content sections
    expect(parsed).toHaveProperty('rawPageContent');
    expect(parsed.rawPageContent).toHaveProperty('fields');
    expect(parsed.rawPageContent).toHaveProperty('relatedLists');
    expect(parsed.rawPageContent).toHaveProperty('notes');

    // And the extractions themselves
    expect(parsed).toHaveProperty('extractions');
    expect(parsed.extractions).toHaveLength(1);

    // Verify actual page data is present
    expect(parsed.rawPageContent.fields).toEqual(pageData.fields);
    expect(parsed.rawPageContent.notes).toEqual(pageData.notes);
  });

  // -------------------------------------------------------------------------
  // 7. Handles markdown-wrapped JSON in response
  // -------------------------------------------------------------------------
  it('parses JSON correctly when AI wraps it in a markdown code block', async () => {
    const review = {
      templateField: '[Licensed Agents]',
      originalValue: '250',
      verdict: 'accepted',
      confidence: 'high',
      reasoning: 'Clearly present.',
      suggestedValue: null,
    };

    const markdownWrapped = `Here is my review:\n\`\`\`json\n${JSON.stringify({ reviews: [review] })}\n\`\`\`\nThat concludes my analysis.`;

    const client = makeClient(markdownWrapped, 75);
    const agent = new ReviewerAgent(client);

    const result = await agent.validate([makeExtraction()], makePageData());

    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].verdict).toBe('accepted');
    expect(result.tokensUsed).toBe(75);
  });
});
