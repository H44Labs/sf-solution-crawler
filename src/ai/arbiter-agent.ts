import { AIProviderClient } from './providers';
import { buildArbiterPrompt } from './prompts';
import {
  SessionState,
  ArbiterDecision,
  DeploymentType,
  ProductsDetected,
  PendingQuestion,
} from '../types';
import { ReviewResult } from './reviewer-agent';
import { CrawlerExtraction } from './crawler-agent';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface FieldDecision {
  templateField: string;
  decision: ArbiterDecision;
  reason: string;
}

export interface CompletionAssessment {
  isComplete: boolean;
  percentFilled: number;
  recommendation: 'continue' | 'complete' | 'askUser';
  reason: string;
}

export interface ArbiterResult {
  fieldDecisions: FieldDecision[];
  questionsForUser: PendingQuestion[];
  deploymentType: DeploymentType;
  productsDetected: ProductsDetected;
  completionAssessment: CompletionAssessment;
  tokensUsed: number;
}

export interface FinalReviewResult {
  approved: boolean;
  issues: string[];
  tokensUsed: number;
}

// ---------------------------------------------------------------------------
// Fallback defaults
// ---------------------------------------------------------------------------

const FALLBACK_ARBITER_RESULT: Omit<ArbiterResult, 'tokensUsed'> = {
  fieldDecisions: [],
  questionsForUser: [],
  deploymentType: 'unknown',
  productsDetected: { wfm: false, eem: false, performanceManagement: false },
  completionAssessment: {
    isComplete: false,
    percentFilled: 0,
    recommendation: 'continue',
    reason: 'Failed to parse arbiter response',
  },
};

// ---------------------------------------------------------------------------
// ArbiterAgent
// ---------------------------------------------------------------------------

export class ArbiterAgent {
  constructor(private aiClient: AIProviderClient) {}

  async decide(
    crawlerExtractions: CrawlerExtraction[],
    reviewResults: ReviewResult[],
    sessionState: SessionState,
  ): Promise<ArbiterResult> {
    const systemPrompt = buildArbiterPrompt();
    const userMessage = JSON.stringify({
      crawlerExtractions,
      reviewResults,
      sessionState: {
        fieldsFound: Object.keys(sessionState.fieldsFound),
        fieldsRemaining: sessionState.fieldsRemaining,
        pagesVisited: sessionState.pagesVisited.length,
        tokenUsage: sessionState.tokenUsage,
        deploymentType: sessionState.deploymentType,
      },
    });

    const response = await this.aiClient.sendMessage(systemPrompt, userMessage);
    return this.parseResponse(response.text, response.tokensUsed);
  }

  async holisticReview(sessionState: SessionState): Promise<FinalReviewResult> {
    const systemPrompt = buildArbiterPrompt();
    const userMessage = JSON.stringify({
      type: 'final_review',
      allFields: sessionState.fieldsFound,
      deploymentType: sessionState.deploymentType,
      productsDetected: sessionState.productsDetected,
      totalFields:
        Object.keys(sessionState.fieldsFound).length + sessionState.fieldsRemaining.length,
      filledFields: Object.keys(sessionState.fieldsFound).length,
    });

    const response = await this.aiClient.sendMessage(systemPrompt, userMessage);
    return this.parseFinalReview(response.text, response.tokensUsed);
  }

  // ---------------------------------------------------------------------------
  // Private parsers
  // ---------------------------------------------------------------------------

  private parseResponse(text: string, tokensUsed: number): ArbiterResult {
    try {
      // Strip markdown code fences if present
      const stripped = text
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();

      // Find outermost JSON object
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { ...FALLBACK_ARBITER_RESULT, tokensUsed };
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      // Parse fieldDecisions
      const fieldDecisions: FieldDecision[] = Array.isArray(parsed.fieldDecisions)
        ? (parsed.fieldDecisions as Record<string, unknown>[]).map((d) => ({
            templateField: String(d.templateField ?? ''),
            decision: (d.decision as ArbiterDecision) ?? 'askUser',
            reason: String(d.reason ?? ''),
          }))
        : [];

      // Parse questionsForUser
      const questionsForUser: PendingQuestion[] = Array.isArray(parsed.questionsForUser)
        ? (parsed.questionsForUser as Record<string, unknown>[]).map((q) => ({
            field: String(q.field ?? ''),
            question: String(q.question ?? ''),
            context: String(q.context ?? ''),
          }))
        : [];

      // Parse deploymentType
      const rawDeploymentType = parsed.deploymentType;
      const deploymentType: DeploymentType =
        rawDeploymentType === 'new_business' ||
        rawDeploymentType === 'migration' ||
        rawDeploymentType === 'unknown'
          ? rawDeploymentType
          : 'unknown';

      // Parse productsDetected
      const rawProducts =
        typeof parsed.productsDetected === 'object' && parsed.productsDetected !== null
          ? (parsed.productsDetected as Record<string, unknown>)
          : {};
      const productsDetected: ProductsDetected = {
        wfm: Boolean(rawProducts.wfm ?? false),
        eem: Boolean(rawProducts.eem ?? false),
        performanceManagement: Boolean(rawProducts.performanceManagement ?? false),
      };

      // Parse completionAssessment
      const rawAssessment =
        typeof parsed.completionAssessment === 'object' && parsed.completionAssessment !== null
          ? (parsed.completionAssessment as Record<string, unknown>)
          : {};
      const rawRecommendation = rawAssessment.recommendation;
      const recommendation: CompletionAssessment['recommendation'] =
        rawRecommendation === 'complete' ||
        rawRecommendation === 'askUser' ||
        rawRecommendation === 'continue'
          ? rawRecommendation
          : 'continue';
      const completionAssessment: CompletionAssessment = {
        isComplete: Boolean(rawAssessment.isComplete ?? false),
        percentFilled: typeof rawAssessment.percentFilled === 'number' ? rawAssessment.percentFilled : 0,
        recommendation,
        reason: String(rawAssessment.reason ?? ''),
      };

      return {
        fieldDecisions,
        questionsForUser,
        deploymentType,
        productsDetected,
        completionAssessment,
        tokensUsed,
      };
    } catch {
      return { ...FALLBACK_ARBITER_RESULT, tokensUsed };
    }
  }

  private parseFinalReview(text: string, tokensUsed: number): FinalReviewResult {
    try {
      const stripped = text
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();

      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { approved: false, issues: ['Failed to parse arbiter response'], tokensUsed };
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      const approved = Boolean(parsed.approved ?? false);
      const issues: string[] = Array.isArray(parsed.issues)
        ? (parsed.issues as unknown[]).map((i) => String(i))
        : [];

      return { approved, issues, tokensUsed };
    } catch {
      return { approved: false, issues: ['Failed to parse arbiter response'], tokensUsed };
    }
  }
}
