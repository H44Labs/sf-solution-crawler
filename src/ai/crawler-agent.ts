import { AIProviderClient } from './providers';
import { buildCrawlerPrompt } from './prompts';
import { PageData, SessionState, NavigationDirective, Confidence } from '../types';

export interface CrawlerExtraction {
  templateField: string;
  value: string;
  rawEvidence: string;
  confidence: Confidence;
}

export interface CrawlerResult {
  extractedFields: CrawlerExtraction[];
  nextNavigation: NavigationDirective;
  tokensUsed: number;
}

// Fallback navigation directive used when parsing fails
const FALLBACK_NAVIGATION: NavigationDirective = {
  action: 'done',
  target: '',
  reason: 'Failed to parse AI response',
  fieldsSought: [],
};

export class CrawlerAgent {
  constructor(
    private aiClient: AIProviderClient,
    private fieldRegistry: string[],
  ) {}

  async analyze(pageData: PageData, sessionState: SessionState): Promise<CrawlerResult> {
    const systemPrompt = buildCrawlerPrompt(this.fieldRegistry);

    // Truncate page data to stay within AI context limits
    const trimmedPageData = this.trimPageData(pageData);

    const userMessage = JSON.stringify({
      pageData: trimmedPageData,
      fieldsRemaining: sessionState.fieldsRemaining,
      pagesVisited: sessionState.pagesVisited.map((p) => ({ url: p.url, title: p.title })),
    });

    console.log(`[CrawlerAgent] Sending ${trimmedPageData.fields.length} fields, ${userMessage.length} chars to AI`);
    const response = await this.aiClient.sendMessage(systemPrompt, userMessage);
    return this.parseResponse(response.text, response.tokensUsed);
  }

  /**
   * Trim page data aggressively to stay within AI context/rate limits.
   * Target: ~4000 tokens max for the user message.
   */
  private trimPageData(pageData: PageData): PageData {
    // Separate structured fields from raw text chunks
    const structuredFields = pageData.fields.filter(f => !f.label.startsWith('__RAW_TEXT'));
    const rawChunks = pageData.fields.filter(f => f.label.startsWith('__RAW_TEXT'));

    // Keep structured fields (up to 80), truncate values to 150 chars
    const keptFields = structuredFields.slice(0, 80).map(f => ({
      ...f,
      value: f.value.substring(0, 150),
    }));

    // Only add ONE raw text chunk if we have very few structured fields
    if (keptFields.length < 10 && rawChunks.length > 0) {
      keptFields.push({
        ...rawChunks[0],
        value: rawChunks[0].value.substring(0, 2000),
      });
    }

    // Limit quick links to 15
    const trimmedLinks = pageData.quickLinks.slice(0, 15).map(l => ({
      text: l.text.substring(0, 80),
      href: l.href.substring(0, 120),
    }));

    return {
      ...pageData,
      fields: keptFields,
      quickLinks: trimmedLinks,
      notes: pageData.notes.slice(0, 5).map(n => n.substring(0, 200)),
    };
  }

  private parseResponse(responseText: string, tokensUsed: number): CrawlerResult {
    try {
      // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
      const stripped = responseText
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();

      const parsed = JSON.parse(stripped) as Record<string, unknown>;

      // Validate required structure
      if (!Array.isArray(parsed.extractedFields)) {
        throw new Error('extractedFields is not an array');
      }
      if (typeof parsed.nextNavigation !== 'object' || parsed.nextNavigation === null) {
        throw new Error('nextNavigation is missing or not an object');
      }

      const extractedFields = (parsed.extractedFields as Record<string, unknown>[]).map(
        (item): CrawlerExtraction => ({
          templateField: String(item.templateField ?? ''),
          value: String(item.value ?? ''),
          rawEvidence: String(item.rawEvidence ?? ''),
          confidence: (item.confidence as Confidence) ?? 'low',
        }),
      );

      const nav = parsed.nextNavigation as Record<string, unknown>;
      const nextNavigation: NavigationDirective = {
        action: (nav.action as NavigationDirective['action']) ?? 'done',
        target: String(nav.target ?? ''),
        reason: String(nav.reason ?? ''),
        fieldsSought: Array.isArray(nav.fieldsSought)
          ? (nav.fieldsSought as string[])
          : [],
      };

      return { extractedFields, nextNavigation, tokensUsed };
    } catch {
      // Graceful degradation — return empty result with 'done' navigation
      return {
        extractedFields: [],
        nextNavigation: FALLBACK_NAVIGATION,
        tokensUsed,
      };
    }
  }
}
