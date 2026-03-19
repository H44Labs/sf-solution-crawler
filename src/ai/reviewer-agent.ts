import { AIProviderClient } from './providers';
import { buildReviewerPrompt } from './prompts';
import { PageData, Confidence, ReviewerVerdict } from '../types';

export interface ReviewerInput {
  templateField: string;
  value: string;
  rawEvidence: string;
  confidence: Confidence;
}

export interface ReviewResult {
  templateField: string;
  originalValue: string;
  verdict: ReviewerVerdict;
  confidence: Confidence;
  reasoning: string;
  suggestedValue: string | null;
}

export interface ReviewerOutput {
  reviews: ReviewResult[];
  tokensUsed: number;
}

export class ReviewerAgent {
  constructor(private aiClient: AIProviderClient) {}

  async validate(extractions: ReviewerInput[], pageData: PageData): Promise<ReviewerOutput> {
    const systemPrompt = buildReviewerPrompt();
    const userMessage = JSON.stringify({
      extractions,
      rawPageContent: {
        fields: pageData.fields,
        relatedLists: pageData.relatedLists,
        notes: pageData.notes,
      },
    });

    const response = await this.aiClient.sendMessage(systemPrompt, userMessage);
    return this.parseResponse(response.text, response.tokensUsed, extractions);
  }

  private parseResponse(
    responseText: string,
    tokensUsed: number,
    extractions: ReviewerInput[],
  ): ReviewerOutput {
    // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
    const stripped = responseText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    // Find the first {...} block in the response to handle any preamble/postamble
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as { reviews?: unknown };
        if (
          parsed &&
          typeof parsed === 'object' &&
          Array.isArray(parsed.reviews)
        ) {
          const reviews = (parsed.reviews as ReviewResult[]).map((r) => ({
            templateField: r.templateField,
            originalValue: r.originalValue,
            verdict: r.verdict,
            confidence: r.confidence,
            reasoning: r.reasoning,
            suggestedValue: r.suggestedValue ?? null,
          }));
          return { reviews, tokensUsed };
        }
      } catch {
        // Fall through to fallback
      }
    }

    // Fallback: return all extractions as flagged with medium confidence
    const reviews: ReviewResult[] = extractions.map((e) => ({
      templateField: e.templateField,
      originalValue: e.value,
      verdict: 'flagged' as ReviewerVerdict,
      confidence: 'medium' as Confidence,
      reasoning: 'Could not parse reviewer response; flagged for manual review.',
      suggestedValue: null,
    }));
    return { reviews, tokensUsed };
  }
}
