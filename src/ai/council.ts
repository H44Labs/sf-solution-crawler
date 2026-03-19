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
    // 1. Crawler analyzes page
    const crawlerResult = await this.crawler.analyze(pageData, state);

    // 2. Reviewer validates extractions (convert CrawlerExtraction[] to ReviewerInput[])
    const reviewerInputs: ReviewerInput[] = crawlerResult.extractedFields.map(f => ({
      templateField: f.templateField,
      value: f.value,
      rawEvidence: f.rawEvidence,
      confidence: f.confidence,
    }));
    const reviewerResult = await this.reviewer.validate(reviewerInputs, pageData);

    // 3. Arbiter makes final decisions
    const arbiterResult = await this.arbiter.decide(
      crawlerResult.extractedFields,
      reviewerResult.reviews,
      state
    );

    // 4. Build result: extract accepted fields, compile questions, etc.
    const acceptedFields: Record<string, { value: string; confidence: string; source: string; rawEvidence: string }> = {};
    for (const decision of arbiterResult.fieldDecisions) {
      if (decision.decision === 'accepted') {
        const extraction = crawlerResult.extractedFields.find(f => f.templateField === decision.templateField);
        const review = reviewerResult.reviews.find(r => r.templateField === decision.templateField);
        if (extraction) {
          acceptedFields[decision.templateField] = {
            value: review?.suggestedValue || extraction.value,
            confidence: review?.confidence || extraction.confidence,
            source: pageData.pageContext.title,
            rawEvidence: extraction.rawEvidence,
          };
        }
      }
    }

    const totalTokens = crawlerResult.tokensUsed + reviewerResult.tokensUsed + arbiterResult.tokensUsed;

    return {
      acceptedFields,
      navigation: crawlerResult.nextNavigation,
      questionsForUser: arbiterResult.questionsForUser,
      deploymentType: arbiterResult.deploymentType,
      productsDetected: arbiterResult.productsDetected,
      isComplete: arbiterResult.completionAssessment.isComplete,
      totalTokensUsed: totalTokens,
    };
  }

  async finalReview(state: SessionState): Promise<FinalReviewResult> {
    return this.arbiter.holisticReview(state);
  }
}
