import { CrawlerAgent, CrawlerResult } from './crawler-agent';
import { ReviewerAgent, ReviewerInput } from './reviewer-agent';
import { ArbiterAgent, ArbiterResult, FinalReviewResult } from './arbiter-agent';
import { PageData, SessionState, NavigationDirective, PendingQuestion } from '../types';

export interface CouncilResult {
  // Fields accepted by the arbiter (to add to session state)
  acceptedFields: Record<string, { value: string; confidence: string; source: string; rawEvidence: string }>;
  // Navigation directive (what to do next)
  navigation: NavigationDirective;
  // Questions for the user
  questionsForUser: PendingQuestion[];
  // Deployment type determination
  deploymentType: string;
  // Products detected
  productsDetected: { wfm: boolean; eem: boolean; performanceManagement: boolean };
  // Whether the crawl should complete
  isComplete: boolean;
  // Total tokens used across all 3 agents
  totalTokensUsed: number;
}

export class AICouncil {
  constructor(
    private crawler: CrawlerAgent,
    private reviewer: ReviewerAgent,
    private arbiter: ArbiterAgent,
  ) {}

  async processPage(pageData: PageData, state: SessionState): Promise<CouncilResult> {
    // 1. Crawler analyzes page (single AI call — lightweight mode for free tier)
    const crawlerResult = await this.crawler.analyze(pageData, state);

    // Accept all crawler extractions directly (skip Reviewer + Arbiter to save tokens)
    // The Crawler already assigns confidence levels
    const acceptedFields: Record<string, { value: string; confidence: string; source: string; rawEvidence: string }> = {};
    for (const extraction of crawlerResult.extractedFields) {
      if (extraction.templateField && extraction.value) {
        acceptedFields[extraction.templateField] = {
          value: extraction.value,
          confidence: extraction.confidence,
          source: pageData.pageContext.title,
          rawEvidence: extraction.rawEvidence,
        };
      }
    }

    // Detect deployment type from extracted fields
    const hasExistingVersion = crawlerResult.extractedFields.some(
      f => f.templateField === '[Existing WFM Version]' && f.value
    );
    const oppName = (pageData.pageContext.title || '').toLowerCase();
    const isMigration = hasExistingVersion ||
      oppName.includes('migration') ||
      oppName.includes('upgrade') ||
      oppName.includes('conversion');

    // Detect products from fields
    const hasEEM = crawlerResult.extractedFields.some(
      f => f.templateField === '[Employee Engagement Manager]' && f.value.toLowerCase().includes('yes')
    );

    const isComplete = crawlerResult.nextNavigation.action === 'done';

    return {
      acceptedFields,
      navigation: crawlerResult.nextNavigation,
      questionsForUser: [],
      deploymentType: isMigration ? 'migration' : 'new_business',
      productsDetected: { wfm: true, eem: hasEEM, performanceManagement: false },
      isComplete,
      totalTokensUsed: crawlerResult.tokensUsed,
    };
  }

  async finalReview(state: SessionState): Promise<FinalReviewResult> {
    return this.arbiter.holisticReview(state);
  }
}
